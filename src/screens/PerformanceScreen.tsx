// src/screens/PerformanceScreen.tsx

import React from 'react';
import { StyleSheet, Text, useColorScheme, View } from 'react-native';

const PerformanceScreen: React.FC = () => {
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';
  const styles = React.useMemo(() => createStyles(isDark), [isDark]);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>My Performance</Text>
      <Text style={styles.subtitle}>
        Dummy page. Show daily collections, targets vs achieved and visit
        summary for the agent here.
      </Text>
    </View>
  );
};

const createStyles = (isDark: boolean) =>
  StyleSheet.create({
    container: {
      flex: 1,
      padding: 24,
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: isDark ? '#020617' : '#f3f4f6',
    },
    title: {
      fontSize: 22,
      fontWeight: '700',
      color: isDark ? '#f9fafb' : '#0f172a',
      marginBottom: 8,
      textAlign: 'center',
    },
    subtitle: {
      fontSize: 14,
      color: isDark ? '#e5e7eb' : '#4b5563',
      textAlign: 'center',
    },
  });

export default PerformanceScreen;
