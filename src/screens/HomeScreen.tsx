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
import { APP_DISPLAY_NAME, COMPANY_NAME } from '../config/erpConfig';
import { useNavigation } from '@react-navigation/native';

type HomeScreenProps = {
  fullName?: string;
};

type TileProps = {
  title: string;
  subtitle?: string;
  onPress: () => void;
};

const BRAND_COLOR = '#fda600';

const HomeScreen: React.FC<HomeScreenProps> = ({ fullName }) => {
  const navigation = useNavigation<any>();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  const styles = React.useMemo(() => createStyles(isDark), [isDark]);

  const openDrawer = () => {
    navigation.getParent()?.openDrawer?.();
  };

  const goPriorityBucket = () => navigation.navigate('PriorityBucket');
  const goMyList = () => navigation.navigate('MyList');
  const goCollection = () => navigation.navigate('Collection');
  const goDeposit = () => navigation.navigate('Deposit');

  const Tile: React.FC<TileProps> = ({ title, subtitle, onPress }) => (
    <Pressable style={styles.tile} onPress={onPress}>
      <View style={styles.tileIcon}>
        <View style={styles.iconLine} />
        <View style={styles.iconLine} />
        <View style={styles.iconLineShort} />
      </View>
      <Text style={styles.tileTitle}>{title}</Text>
      {subtitle ? <Text style={styles.tileSubtitle}>{subtitle}</Text> : null}
    </Pressable>
  );

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
        {/* My Cases section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>My Cases</Text>
          <View style={styles.tileRow}>
            <Tile title="Priority Bucket" onPress={goPriorityBucket} />
            <Tile
              title="My List"
              subtitle="All Cases"
              onPress={goMyList}
            />
          </View>
        </View>

        {/* Collection & Deposit section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Collection &amp; Deposit</Text>
          <View style={styles.tileRow}>
            <Tile title="Collection" onPress={goCollection} />
            <Tile title="Deposit" onPress={goDeposit} />
          </View>
        </View>

        <Text style={styles.helperText}>
          This is your FOS home screen. Use the tiles above to open cases,
          record collections and deposits.
        </Text>
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
      paddingBottom: 18,
      paddingTop: 4,
      columnGap: 10,
    },
    summaryCard: {
      flex: 1,
      backgroundColor: isDark ? '#111827' : '#1f2937',
      borderRadius: 12,
      paddingVertical: 12,
      paddingHorizontal: 12,
      minHeight: 72,
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
      paddingTop: 18,
      paddingBottom: 32,
      rowGap: 18,
    },
    section: {
      marginBottom: 10,
    },
    sectionTitle: {
      fontSize: 16,
      fontWeight: '600',
      color: isDark ? '#e5e7eb' : '#111827',
      marginBottom: 10,
    },
    tileRow: {
      flexDirection: 'row',
      columnGap: 12,
    },
    tile: {
      flex: 1,
      backgroundColor: isDark ? '#020617' : '#ffffff',
      borderRadius: 18,
      paddingHorizontal: 14,
      paddingVertical: 20,
      minHeight: 120, // 👈 taller cards
      borderWidth: isDark ? 1 : 0,
      borderColor: isDark ? '#1f2937' : 'transparent',
      shadowColor: '#000',
      shadowOpacity: isDark ? 0.35 : 0.08,
      shadowOffset: { width: 0, height: 4 },
      shadowRadius: 10,
      elevation: 4,
    },
    tileIcon: {
      marginBottom: 10,
    },
    iconLine: {
      width: 22,
      height: 2,
      borderRadius: 999,
      backgroundColor: isDark ? '#fbbf24' : '#4b5563',
      marginBottom: 2,
    },
    iconLineShort: {
      width: 14,
      height: 2,
      borderRadius: 999,
      backgroundColor: isDark ? '#fbbf24' : '#4b5563',
    },
    tileTitle: {
      fontSize: 15,
      fontWeight: '600',
      color: isDark ? '#e5e7eb' : '#111827',
    },
    tileSubtitle: {
      fontSize: 12,
      color: isDark ? '#9ca3af' : '#6b7280',
      marginTop: 4,
    },
    helperText: {
      marginTop: 12,
      fontSize: 12,
      color: isDark ? '#9ca3af' : '#6b7280',
      textAlign: 'center',
      lineHeight: 18,
    },
  });

export default HomeScreen;
