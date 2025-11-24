// src/screens/LoginScreen.tsx

import React from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useColorScheme,
  View,
  Pressable,
} from 'react-native';
import { COMPANY_NAME ,APP_DISPLAY_NAME} from '../config/erpConfig';
import { loginWithPassword, LoginResult } from '../services/erpAuth';

type LoginScreenProps = {
  onLoginSuccess: (fullName?: string) => void;
};

const LoginScreen: React.FC<LoginScreenProps> = ({ onLoginSuccess }) => {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  const styles = React.useMemo(() => createStyles(isDark), [isDark]);

  const [username, setUsername] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [status, setStatus] = React.useState<LoginResult | null>(null);

  const handleLoginPress = async () => {
    setStatus(null);

    if (!username || !password) {
      setStatus({
        ok: false,
        statusCode: null,
        message: 'Please enter username and password.',
        raw: null,
      } as LoginResult);
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await loginWithPassword(username, password);
      setStatus(result);

      if (result.ok) {
        // Navigate to Home
        onLoginSuccess(result.fullName);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const statusColorStyle =
    status && status.ok ? styles.statusSuccess : styles.statusError;

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        style={styles.flex}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.screen}>
          {/* App heading */}
          <Text style={styles.appName}>{APP_DISPLAY_NAME} Mobile App</Text>
          <Text style={styles.appSubtitle}>
            Secure access to {COMPANY_NAME} ERP.
          </Text>

          {/* Login card */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Sign in</Text>
            <Text style={styles.cardSubtitle}>
              Use your ERPNext username and password to continue.
            </Text>

            {/* Username */}
            <View style={styles.fieldGroup}>
              <Text style={styles.label}>Username</Text>
              <TextInput
                style={styles.input}
                placeholder="you@example.com"
                placeholderTextColor={styles.placeholderColor.color}
                autoCapitalize="none"
                autoCorrect={false}
                value={username}
                onChangeText={setUsername}
              />
            </View>

            {/* Password */}
            <View style={styles.fieldGroup}>
              <Text style={styles.label}>Password</Text>
              <TextInput
                style={styles.input}
                placeholder="••••••••"
                placeholderTextColor={styles.placeholderColor.color}
                secureTextEntry
                value={password}
                onChangeText={setPassword}
              />
            </View>

            {/* Login button */}
            <Pressable
              onPress={handleLoginPress}
              disabled={isSubmitting}
              style={({ pressed }) => [
                styles.button,
                pressed && styles.buttonPressed,
                isSubmitting && styles.buttonDisabled,
              ]}
            >
              {isSubmitting ? (
                <ActivityIndicator color="#ffffff" />
              ) : (
                <Text style={styles.buttonText}>Login</Text>
              )}
            </Pressable>

            {/* Status box */}
            {status && (
              <View style={[styles.statusBox, statusColorStyle]}>
                <Text style={styles.statusTitle}>
                  {status.ok ? 'Login Success' : 'Login Failed'}
                </Text>
                {status.statusCode != null && (
                  <Text style={styles.statusLine}>
                    HTTP Status: {status.statusCode}
                  </Text>
                )}
                <Text style={styles.statusLine}>{status.message}</Text>
              </View>
            )}
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

const createStyles = (isDark: boolean) =>
  StyleSheet.create({
    flex: {
      flex: 1,
    },
    scrollContent: {
      flexGrow: 1,
    },
    screen: {
      flex: 1,
      paddingHorizontal: 24,
      paddingVertical: 32,
      backgroundColor: isDark ? '#020617' : '#f3f4f6',
      justifyContent: 'center',
    },
    appName: {
      fontSize: 24,
      fontWeight: '700',
      color: isDark ? '#f9fafb' : '#0f172a',
      textAlign: 'center',
      marginBottom: 4,
    },
    appSubtitle: {
      fontSize: 13,
      color: isDark ? '#9ca3af' : '#6b7280',
      textAlign: 'center',
      marginBottom: 24,
    },
    card: {
      backgroundColor: isDark ? '#020617' : '#ffffff',
      borderRadius: 20,
      paddingHorizontal: 20,
      paddingVertical: 24,
      shadowColor: '#000',
      shadowOpacity: isDark ? 0.4 : 0.12,
      shadowOffset: { width: 0, height: 10 },
      shadowRadius: 20,
      elevation: 6,
      borderWidth: isDark ? 1 : 0,
      borderColor: isDark ? '#1f2937' : 'transparent',
    },
    cardTitle: {
      fontSize: 20,
      fontWeight: '700',
      color: isDark ? '#e5e7eb' : '#0f172a',
      marginBottom: 4,
    },
    cardSubtitle: {
      fontSize: 13,
      color: isDark ? '#9ca3af' : '#6b7280',
      marginBottom: 16,
    },
    fieldGroup: {
      marginBottom: 14,
    },
    label: {
      fontSize: 13,
      fontWeight: '500',
      color: isDark ? '#d1d5db' : '#4b5563',
      marginBottom: 4,
    },
    input: {
      height: 44,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: isDark ? '#374151' : '#e5e7eb',
      paddingHorizontal: 12,
      fontSize: 14,
      color: isDark ? '#f9fafb' : '#111827',
      backgroundColor: isDark ? '#020617' : '#f9fafb',
    },
    placeholderColor: {
      color: isDark ? '#6b7280' : '#9ca3af',
    },
    button: {
      marginTop: 8,
      height: 48,
      borderRadius: 999,
      backgroundColor: '#2563eb',
      alignItems: 'center',
      justifyContent: 'center',
    },
    buttonPressed: {
      opacity: 0.9,
    },
    buttonDisabled: {
      opacity: 0.6,
    },
    buttonText: {
      color: '#ffffff',
      fontSize: 16,
      fontWeight: '600',
    },
    statusBox: {
      marginTop: 16,
      borderRadius: 10,
      padding: 10,
    },
    statusSuccess: {
      backgroundColor: isDark ? '#064e3b' : '#ecfdf5',
      borderColor: '#22c55e',
      borderWidth: 1,
    },
    statusError: {
      backgroundColor: isDark ? '#7f1d1d' : '#fef2f2',
      borderColor: '#ef4444',
      borderWidth: 1,
    },
    statusTitle: {
      fontSize: 14,
      fontWeight: '600',
      marginBottom: 2,
      color: isDark ? '#e5e7eb' : '#111827',
    },
    statusLine: {
      fontSize: 12,
      color: isDark ? '#e5e7eb' : '#374151',
    },
  });

export default LoginScreen;
