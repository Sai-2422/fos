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
import { useNavigation } from '@react-navigation/native';
import FontAwesome5 from 'react-native-vector-icons/FontAwesome5';

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
const BRAND_BLUE = '#3b82f6';

// Helper: JS Date → "YYYY-MM-DD" (same format as FOS Attendance.attendance_date)
function formatDateForErp(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

const HomeScreen: React.FC<HomeScreenProps> = ({ fullName }) => {
  const navigation = useNavigation<any>();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  const styles = React.useMemo(() => createStyles(isDark), [isDark]);

  // use fullName as agent name filter (can change later if you have separate agent field)
  const agentName = fullName;

  // ─────────────────────────────────────────────
  // Attendance state
  // ─────────────────────────────────────────────
  const [attendanceMarkedToday, setAttendanceMarkedToday] =
    React.useState<boolean | null>(null); // null = unknown
  const [loadingAttendance, setLoadingAttendance] =
    React.useState<boolean>(true);

  const openDrawer = () => {
    navigation.getParent()?.openDrawer?.();
  };

  const goPriorityBucket = () => navigation.navigate('PriorityBucket');

  // pass agentName as param to MyList
  const goMyList = () =>
    navigation.navigate('MyList', {
      agentName, // used in MyListScreen to filter cases
    });

  const goCollection = () => navigation.navigate('Collection');
  const goDeposit = () => navigation.navigate('Deposit');

  const Tile: React.FC<TileProps> = ({
    title,
    subtitle,
    onPress,
    iconName,
  }) => (
    <Pressable style={styles.tile} onPress={onPress}>
      <View style={styles.tileIconCircle}>
        <FontAwesome5
          name={iconName}
          size={18}
          color={isDark ? '#e5e7eb' : '#0f172a'}
        />
      </View>
      <Text style={styles.tileTitle}>{title}</Text>
      {subtitle ? <Text style={styles.tileSubtitle}>{subtitle}</Text> : null}
    </Pressable>
  );

  // ---------- Mark Attendance button handler ----------
  const handleMarkAttendance = () => {
    // Switch to the Attendance drawer stack
    navigation.getParent()?.navigate('AttendanceDrawer');
  };

  // ─────────────────────────────────────────────
  // Check if today's attendance is already marked
  // ─────────────────────────────────────────────
  const checkTodayAttendance = React.useCallback(async () => {
    try {
      setLoadingAttendance(true);

      // 1) Get logged-in ERP user email
      const userRes = await fetch(ERP_GET_LOGGED_USER_URL, {
        method: 'GET',
        headers: { Accept: 'application/json' },
      });

      if (!userRes.ok) {
        // If we can't get user, allow marking attendance instead of blocking
        throw new Error(`Failed to get logged user: ${userRes.status}`);
      }

      const userJson = await userRes.json();
      const email = userJson?.message as string | undefined;

      if (!email) {
        throw new Error('Invalid get_logged_user response');
      }

      // 2) Build filters: user = email AND attendance_date = today
      const today = formatDateForErp(new Date());

      const params = new URLSearchParams();
      params.append(
        'filters',
        JSON.stringify([
          ['user', '=', email],
          ['attendance_date', '=', today],
        ]),
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
      // On error → treat as "not marked" so agent can still mark
      setAttendanceMarkedToday(false);
    } finally {
      setLoadingAttendance(false);
    }
  }, []);

  React.useEffect(() => {
    checkTodayAttendance();
  }, [checkTodayAttendance]);

  return (
    <View style={styles.container}>
      {/* Header with hamburger and app name */}
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
          <Text style={styles.summaryLabel}>Pending Deposit</Text>
          <Text style={styles.summaryAmount}>₹0</Text>
        </View>
        <View style={styles.summaryCard}>
          <Text style={styles.summaryLabel}>Unverified Amount</Text>
          <Text style={styles.summaryAmount}>₹0</Text>
        </View>
      </View>

      {/* Main content */}
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Hero card above My Cases */}
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
              title="Priority Bucket"
              onPress={goPriorityBucket}
              iconName="flag"
            />
            <Tile
              title="My List"
              subtitle="All Cases"
              onPress={goMyList}
              iconName="list-alt"
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
            <Tile
              title="Deposit"
              onPress={goDeposit}
              iconName="university"
            />
          </View>
        </View>

        <Text style={styles.helperText}>
          This is your FOS home screen. Use the tiles above to open cases,
          record collections and deposits.
        </Text>

        {/* Attendance UI based on today's status */}
        {loadingAttendance ? (
          <View style={styles.attendanceCheckingWrapper}>
            <Text style={styles.attendanceCheckingText}>
              Checking today&apos;s attendance…
            </Text>
          </View>
        ) : attendanceMarkedToday ? (
          <View style={styles.attendanceInfoCard}>
            <Text style={styles.attendanceInfoTitle}>
              Attendance already marked for today
            </Text>
            <Text style={styles.attendanceInfoText}>
              You can view details and history on the Attendance screen.
            </Text>
          </View>
        ) : (
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
      paddingBottom: 20, // 22 - 2
      paddingTop: 6, // 8 - 2
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
      paddingTop: 20, // 22 - 2
      paddingBottom: 38, // 40 - 2
      rowGap: 22, // 24 - 2
    },

    // Hero card styles
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
      marginTop: 14, // 16 - 2
    },
    sectionTitle: {
      fontSize: 16,
      fontWeight: '700',
      color: isDark ? '#e5e7eb' : '#111827',
      marginBottom: 10, // 12 - 2
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
      minHeight: 110,
    },
    tileIconCircle: {
      width: 34,
      height: 34,
      borderRadius: 17,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: isDark ? '#111827' : '#bfdbfe',
      marginBottom: 8,
    },
    tileTitle: {
      fontSize: 14,
      fontWeight: '700',
      color: isDark ? '#e5e7eb' : '#111827',
      marginBottom: 4,
    },
    tileSubtitle: {
      fontSize: 12,
      color: isDark ? '#9ca3af' : '#6b7280',
    },
    helperText: {
      fontSize: 12,
      color: isDark ? '#9ca3af' : '#6b7280',
      marginTop: 8, // 10 - 2
    },

    // Bottom Mark Attendance button
    attendanceButton: {
      marginTop: 20, // 22 - 2
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

    // attendance status / loading UI
    attendanceCheckingWrapper: {
      marginTop: 16, // 18 - 2
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
      marginTop: 16, // 18 - 2
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
