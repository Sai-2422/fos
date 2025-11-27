// src/screens/HomeScreen.tsx

import React from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useColorScheme,
  View,
} from 'react-native';
import {
  APP_DISPLAY_NAME,
  COMPANY_NAME,
  ERP_FOS_ATTENDANCE_URL,
  ERP_GET_LOGGED_USER_URL,
} from '../config/erpConfig';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import FontAwesome5 from 'react-native-vector-icons/FontAwesome5';

// 👇 collections service
import {
  fetchCollectionsForLoggedInUser,
  FOSCollectionResponse,
} from '../services/collectionService';

type HomeScreenProps = {
  fullName?: string;
};

type TileProps = {
  title: string;
  subtitle?: string;
  onPress: () => void;
  iconName: string;
};

const BRAND_COLOR = '#397E8A';
const BRAND_BLUE = '#397E8A';

// Helper: JS Date → "YYYY-MM-DD" (same format as FOS Attendance.attendance_date)
function formatDateForErp(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// same helpers as in CollectionScreen for date comparison
function parseErpOrIsoDate(value?: string | null): Date | null {
  if (!value) return null;
  const d = new Date(value);
  if (isNaN(d.getTime())) return null;
  return d;
}

function isSameCalendarDate(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

const HomeScreen: React.FC<HomeScreenProps> = ({ fullName }) => {
  const navigation = useNavigation<any>();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  const styles = React.useMemo(() => createStyles(isDark), [isDark]);

  const agentName = fullName;

  // ─────────────────────────────────────────────
  // Attendance state
  // ─────────────────────────────────────────────
  const [attendanceMarkedToday, setAttendanceMarkedToday] = React.useState<
    boolean | null
  >(null); // null = unknown
  const [loadingAttendance, setLoadingAttendance] =
    React.useState<boolean>(true);

  // ─────────────────────────────────────────────
  // Collections state for Pending Amount & Today Collected
  // ─────────────────────────────────────────────
  const [collections, setCollections] = React.useState<FOSCollectionResponse[]>(
    [],
  );
  const [loadingCollections, setLoadingCollections] =
    React.useState<boolean>(true);

  const openDrawer = () => {
    navigation.getParent()?.openDrawer?.();
  };

  const goPriorityBucket = () => navigation.navigate('PriorityBucket');

  const goMyList = () =>
    navigation.navigate('MyList', {
      agentName,
    });

  const goCollection = () => navigation.navigate('Collection');
  const goDeposit = () => navigation.navigate('Deposit');

  // NEW: navigation for leaves & performance
  const goLeaves = () => navigation.navigate('Leaves');
  const goPerformance = () => navigation.navigate('Performance');

  const Tile: React.FC<TileProps> = ({
    title,
    subtitle,
    onPress,
    iconName,
  }) => (
    <Pressable style={styles.tile} onPress={onPress}>
      <View style={styles.tileHeaderRow}>
        <View style={styles.tileIconCircle}>
          <FontAwesome5
            name={iconName}
            size={18}
            color={isDark ? '#e5e7eb' : '#0f172a'}
          />
        </View>

        <View style={styles.tileTextWrapper}>
          <Text style={styles.tileTitle}>{title}</Text>
          {subtitle ? (
            <Text style={styles.tileSubtitle}>{subtitle}</Text>
          ) : null}
        </View>
      </View>
    </Pressable>
  );

  const handleMarkAttendance = () => {
    navigation.getParent()?.navigate('AttendanceDrawer');
  };

  // ─────────────────────────────────────────────
  // Check if today's attendance is already marked
  // ─────────────────────────────────────────────
  const checkTodayAttendance = React.useCallback(async () => {
    try {
      setLoadingAttendance(true);

      const userRes = await fetch(ERP_GET_LOGGED_USER_URL, {
        method: 'GET',
        headers: { Accept: 'application/json' },
      });

      if (!userRes.ok) {
        throw new Error(`Failed to get logged user: ${userRes.status}`);
      }

      const userJson = await userRes.json();
      const email = userJson?.message as string | undefined;

      if (!email) {
        throw new Error('Invalid get_logged_user response');
      }

      const today = formatDateForErp(new Date());

      const params = new URLSearchParams();
      params.append(
        'filters',
        JSON.stringify([['user', '=', email], ['attendance_date', '=', today]]),
      );
      params.append(
        'fields',
        JSON.stringify(['name', 'attendance_date', 'status']),
      );
      params.append('limit_page_length', '1');

      const listUrl = `${ERP_FOS_ATTENDANCE_URL}?${params.toString()}`;

      const attRes = await fetch(listUrl, {
        method: 'GET',
        headers: { Accept: 'application/json' },
      });

      if (!attRes.ok) {
        throw new Error(`Failed to fetch attendance: ${attRes.status}`);
      }

      const attJson = await attRes.json();
      const rows = attJson?.data;

      const alreadyMarked = Array.isArray(rows) && rows.length > 0;
      setAttendanceMarkedToday(alreadyMarked);
    } catch (err) {
      console.warn('HomeScreen: failed to check today attendance', err);
      setAttendanceMarkedToday(false);
    } finally {
      setLoadingAttendance(false);
    }
  }, []);

  // ─────────────────────────────────────────────
  // Load collections summary (for Pending & Today)
  // ─────────────────────────────────────────────
  const loadCollectionsSummary = React.useCallback(async () => {
    try {
      setLoadingCollections(true);
      const data = await fetchCollectionsForLoggedInUser();
      setCollections(Array.isArray(data) ? data : []);
    } catch (err) {
      console.warn('HomeScreen: failed to load collections summary', err);
      setCollections([]);
    } finally {
      setLoadingCollections(false);
    }
  }, []);

  // ❗ REAL-TIME: re-run whenever HomeScreen gets focus
  useFocusEffect(
    React.useCallback(() => {
      checkTodayAttendance();
      loadCollectionsSummary();
    }, [checkTodayAttendance, loadCollectionsSummary]),
  );

  const today = new Date();

  const { pendingAmount, todayCollected } = React.useMemo(() => {
    let pending = 0;
    let todayTotal = 0;

    for (const c of collections) {
      const amount = Number(c.amount) || 0;

      if (c.is_deposited !== 1) {
        pending += amount;
      }

      const d =
        parseErpOrIsoDate((c as any).collection_datetime) ||
        parseErpOrIsoDate(c.creation);

      if (d && isSameCalendarDate(d, today)) {
        todayTotal += amount;
      }
    }

    return { pendingAmount: pending, todayCollected: todayTotal };
  }, [collections]);

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable style={styles.menuButton} onPress={openDrawer}>
          <View style={styles.menuLine} />
          <View style={styles.menuLine} />
          <View style={styles.menuLine} />
        </Pressable>

        <View style={styles.headerTextWrapper}>
          <Text style={styles.appName}>{APP_DISPLAY_NAME}</Text>
          <Text style={styles.appSubtitle}>
            {fullName ? `Hi ${fullName}` : COMPANY_NAME}
          </Text>
        </View>
      </View>

      {/* Top summary strip */}
      <View style={styles.summaryRow}>
        <View style={styles.summaryCard}>
          <Text style={styles.summaryLabel}>Pending Amount</Text>
          <Text style={styles.summaryAmount}>
            {loadingCollections ? '₹0' : `₹${pendingAmount.toFixed(2)}`}
          </Text>
        </View>
        <View style={styles.summaryCard}>
          <Text style={styles.summaryLabel}>Today Collected</Text>
          <Text style={styles.summaryAmount}>
            {loadingCollections ? '₹0' : `₹${todayCollected.toFixed(2)}`}
          </Text>
        </View>
      </View>

      {/* Main content */}
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Hero card */}
        <View style={styles.heroCard}>
          <View style={styles.heroPill}>
            <View style={styles.heroDot} />
            <Text style={styles.heroPillText}>FOS - FIELD OPERATIONS</Text>
          </View>

          <Text style={styles.heroTitle}>Plan. Visit. Collect. Close.</Text>
          <Text style={styles.heroSubtitle}>
            Follow today’s simple checklist to start your FOS day, cover the
            route, record collections and finish day-end from one place.
          </Text>
        </View>

        {/* My Cases section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>My Cases</Text>
          <View style={styles.tileRow}>
            <Tile
              title="My List"
              subtitle="All Cases"
              onPress={goMyList}
              iconName="list-alt"
            />
            <Tile
              title="Priority Bucket"
              onPress={goPriorityBucket}
              iconName="flag"
            />
          </View>
        </View>

        {/* Collection & Deposit section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Collection &amp; Deposit</Text>
          <View style={styles.tileRow}>
            <Tile
              title="Collection"
              onPress={goCollection}
              iconName="rupee-sign"
            />
            <Tile title="Deposit" onPress={goDeposit} iconName="university" />
          </View>
        </View>

        {/* Leave & Performance section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Leave &amp; Performance</Text>
          <View style={styles.tileRow}>
            <Tile
              title="My Leaves"
              onPress={goLeaves}
              iconName="calendar-alt"
            />
            <Tile
              title="My Performance"
              onPress={goPerformance}
              iconName="chart-line"
            />
          </View>
        </View>

        {/* Attendance UI – show button only when NOT loading and NOT already marked */}
        {!loadingAttendance && !attendanceMarkedToday && (
          <Pressable
            style={styles.attendanceButton}
            onPress={handleMarkAttendance}
          >
            <Text style={styles.attendanceButtonLabel}>Mark Attendance</Text>
          </Pressable>
        )}
      </ScrollView>
    </View>
  );
};

const createStyles = (isDark: boolean) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: isDark ? '#020617' : '#f3f4f6',
    },
    header: {
      backgroundColor: BRAND_COLOR,
      paddingTop: 22,
      paddingBottom: 20,
      paddingHorizontal: 18,
      flexDirection: 'row',
      alignItems: 'center',
    },
    menuButton: {
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 14,
      backgroundColor: 'rgba(0,0,0,0.12)',
    },
    menuLine: {
      width: 20,
      height: 2,
      borderRadius: 999,
      backgroundColor: '#ffffff',
      marginVertical: 2,
    },
    headerTextWrapper: {
      flex: 1,
    },
    appName: {
      fontSize: 20,
      fontWeight: '800',
      color: '#ffffff',
    },
    appSubtitle: {
      fontSize: 13,
      color: '#fff7e5',
      marginTop: 2,
    },
    summaryRow: {
      flexDirection: 'row',
      backgroundColor: BRAND_COLOR,
      paddingHorizontal: 18,
      paddingBottom: 20,
      paddingTop: 6,
      columnGap: 10,
    },
    summaryCard: {
      flex: 1,
      backgroundColor: isDark ? '#102132ff' : '#152E47',
      borderRadius: 12,
      paddingVertical: 12,
      paddingHorizontal: 12,
      minHeight: 76,
      justifyContent: 'center',
    },
    summaryLabel: {
      fontSize: 12,
      color: '#e5e7eb',
    },
    summaryAmount: {
      marginTop: 4,
      fontSize: 18,
      fontWeight: '700',
      color: '#ffffff',
    },
    scroll: {
      flex: 1,
    },
    scrollContent: {
      paddingHorizontal: 16,
      paddingTop: 20,
      paddingBottom: 38,
      rowGap: 22,
    },

    heroCard: {
      backgroundColor: isDark ? '#0b1220' : '#ffffff',
      borderRadius: 18,
      paddingHorizontal: 16,
      paddingVertical: 18,
      borderWidth: isDark ? 1 : 0,
      borderColor: isDark ? '#1f2937' : 'transparent',
      shadowColor: '#000',
      shadowOpacity: isDark ? 0.35 : 0.08,
      shadowOffset: { width: 0, height: 4 },
      shadowRadius: 10,
      elevation: 4,
    },
    heroPill: {
      alignSelf: 'flex-start',
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: isDark ? '#0f172a' : '#f1f5f9',
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 999,
      marginBottom: 10,
    },
    heroDot: {
      width: 8,
      height: 8,
      borderRadius: 999,
      backgroundColor: '#f59e0b',
      marginRight: 8,
    },
    heroPillText: {
      fontSize: 11,
      fontWeight: '700',
      color: isDark ? '#cbd5e1' : '#111827',
      letterSpacing: 0.6,
      textTransform: 'uppercase',
    },
    heroTitle: {
      fontSize: 20,
      fontWeight: '800',
      color: isDark ? '#e5e7eb' : '#0f172a',
      marginBottom: 6,
    },
    heroSubtitle: {
      fontSize: 13,
      color: isDark ? '#9ca3af' : '#4b5563',
    },

    section: {
      marginTop: 12,
    },
    sectionTitle: {
      fontSize: 16,
      fontWeight: '700',
      color: isDark ? '#e5e7eb' : '#111827',
      marginBottom: 10,
    },
    tileRow: {
      flexDirection: 'row',
      columnGap: 10,
    },
    tile: {
      flex: 1,
      borderRadius: 14,
      paddingVertical: 16,
      paddingHorizontal: 12,
      backgroundColor: isDark ? '#020617' : '#ffffff',
      shadowColor: '#000',
      shadowOpacity: isDark ? 0.45 : 0.06,
      shadowOffset: { width: 0, height: 4 },
      shadowRadius: 10,
      elevation: 3,
      minHeight: 75,
      justifyContent: 'center', // center content vertically inside card
    },
    tileHeaderRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center', // center icon+text row horizontally
    },
    tileIconCircle: {
      width: 34,
      height: 34,
      borderRadius: 17,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: isDark ? '#111827' : '#bfdbfe',
    },
    tileTextWrapper: {
      flex: 1,
      marginLeft: 10,
    },
    tileTitle: {
      fontSize: 14,
      fontWeight: '700',
      color: isDark ? '#e5e7eb' : '#111827',
      marginBottom: 2,
    },
    tileSubtitle: {
      fontSize: 12,
      color: isDark ? '#9ca3af' : '#6b7280',
    },
    attendanceButton: {
      marginTop: 20,
      borderRadius: 9999,
      paddingVertical: 14,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: BRAND_BLUE,
    },
    attendanceButtonLabel: {
      fontSize: 15,
      fontWeight: '600',
      color: '#ffffff',
    },

    attendanceCheckingWrapper: {
      marginTop: 16,
      borderRadius: 9999,
      paddingVertical: 12,
      paddingHorizontal: 14,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: isDark ? '#020617' : '#e5e7eb',
    },
    attendanceCheckingText: {
      fontSize: 13,
      color: isDark ? '#9ca3af' : '#4b5563',
    },
    attendanceInfoCard: {
      marginTop: 16,
      borderRadius: 14,
      paddingVertical: 12,
      paddingHorizontal: 14,
      backgroundColor: isDark ? '#022c22' : '#ecfdf5',
      borderWidth: 1,
      borderColor: isDark ? '#064e3b' : '#6ee7b7',
    },
    attendanceInfoTitle: {
      fontSize: 14,
      fontWeight: '600',
      color: isDark ? '#bbf7d0' : '#166534',
      marginBottom: 4,
    },
    attendanceInfoText: {
      fontSize: 12,
      color: isDark ? '#a7f3d0' : '#065f46',
    },
  });

export default HomeScreen;
