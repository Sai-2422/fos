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
  View,
  Pressable,
  StatusBar,
  Dimensions,
} from 'react-native';
import { COMPANY_NAME, APP_DISPLAY_NAME } from '../config/erpConfig';
import { loginWithPassword, LoginResult } from '../services/erpAuth';

// --- Color Constants based on your request ---
const COLORS = {
  primary: '#397e8a',    // Teal/Cyan
  background: '#152e47', // Dark Navy
  white: '#ffffff',
  surface: '#ffffff',
  inputBg: '#f0f4f8',
  textMain: '#152e47',
  textSub: '#64748b',
  errorBg: '#fee2e2',
  errorText: '#ef4444',
  successBg: '#dcfce7',
  successText: '#22c55e',
};

type LoginScreenProps = {
  onLoginSuccess: (fullName?: string) => void;
};

const LoginScreen: React.FC<LoginScreenProps> = ({ onLoginSuccess }) => {
  const styles = createStyles();

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
        onLoginSuccess(result.fullName);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const statusColorStyle =
    status && status.ok ? styles.statusSuccess : styles.statusError;

  return (
    <View style={styles.mainContainer}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.background} />
      
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          style={styles.flex}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Header Section (Dark Navy Background) */}
          <View style={styles.headerSection}>
            <Text style={styles.appName}>{APP_DISPLAY_NAME}</Text>
            <Text style={styles.appSubtitle}>
              Welcome to {COMPANY_NAME}
            </Text>
          </View>

          {/* Bottom Section (Card) */}
          <View style={styles.bottomSection}>
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <Text style={styles.cardTitle}>Sign In</Text>
                <View style={styles.titleUnderline} />
              </View>
              
              <Text style={styles.cardSubtitle}>
                Please enter your credentials to proceed.
              </Text>

              {/* Username */}
              <View style={styles.fieldGroup}>
                <Text style={styles.label}>Username or Email</Text>
                <TextInput
                  style={styles.input}
                  placeholder="user@domain.com"
                  placeholderTextColor="#94a3b8"
                  autoCapitalize="none"
                  autoCorrect={false}
                  value={username}
                  onChangeText={setUsername}
                  cursorColor={COLORS.primary}
                />
              </View>

              {/* Password */}
              <View style={styles.fieldGroup}>
                <Text style={styles.label}>Password</Text>
                <TextInput
                  style={styles.input}
                  placeholder="••••••••"
                  placeholderTextColor="#94a3b8"
                  secureTextEntry
                  value={password}
                  onChangeText={setPassword}
                  cursorColor={COLORS.primary}
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
                  <Text style={[
                    styles.statusTitle, 
                    status.ok ? { color: COLORS.textMain } : { color: '#7f1d1d' }
                  ]}>
                    {status.ok ? 'Login Success' : 'Access Denied'}
                  </Text>
                  <Text style={[
                    styles.statusLine, 
                    status.ok ? { color: COLORS.textSub } : { color: '#991b1b' }
                  ]}>
                    {status.message}
                  </Text>
                </View>
              )}
            </View>

            <Text style={styles.footerText}>Protected by ERPNext Security</Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
};

const createStyles = () =>
  StyleSheet.create({
    mainContainer: {
      flex: 1,
      backgroundColor: COLORS.background, // #152e47
    },
    flex: {
      flex: 1,
    },
    scrollContent: {
      flexGrow: 1,
      justifyContent: 'space-between',
    },
    headerSection: {
      paddingTop: Platform.OS === 'android' ? 60 : 80,
      paddingBottom: 50,
      paddingHorizontal: 30,
      alignItems: 'center',
    },
    appName: {
      fontSize: 32,
      fontWeight: '800',
      color: COLORS.white,
      textAlign: 'center',
      marginBottom: 8,
      letterSpacing: 1,
    },
    appSubtitle: {
      fontSize: 16,
      color: '#94a3b8', // Lighter blue-grey for contrast on navy
      textAlign: 'center',
      fontWeight: '500',
    },
    bottomSection: {
      flex: 1,
      backgroundColor: '#f8fafc',
      borderTopLeftRadius: 30,
      borderTopRightRadius: 30,
      paddingHorizontal: 24,
      paddingTop: 32,
      paddingBottom: 40,
      alignItems: 'center',
    },
    card: {
      width: '100%',
      maxWidth: 400,
    },
    cardHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 8,
    },
    cardTitle: {
      fontSize: 24,
      fontWeight: '700',
      color: COLORS.textMain,
      marginRight: 10,
    },
    titleUnderline: {
      height: 4,
      width: 24,
      backgroundColor: COLORS.primary, // #397e8a
      borderRadius: 2,
      marginTop: 4,
    },
    cardSubtitle: {
      fontSize: 14,
      color: COLORS.textSub,
      marginBottom: 32,
      marginTop: 4,
    },
    fieldGroup: {
      marginBottom: 20,
    },
    label: {
      fontSize: 13,
      fontWeight: '600',
      color: COLORS.textMain,
      marginBottom: 8,
      marginLeft: 4,
    },
    input: {
      height: 56,
      borderRadius: 16,
      borderWidth: 1.5,
      borderColor: '#e2e8f0',
      paddingHorizontal: 16,
      fontSize: 16,
      color: COLORS.textMain,
      backgroundColor: COLORS.white,
    },
    button: {
      marginTop: 16,
      height: 56,
      borderRadius: 16,
      backgroundColor: COLORS.primary, // #397e8a
      alignItems: 'center',
      justifyContent: 'center',
      shadowColor: COLORS.primary,
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.3,
      shadowRadius: 10,
      elevation: 8,
    },
    buttonPressed: {
      transform: [{ scale: 0.98 }],
      opacity: 0.9,
    },
    buttonDisabled: {
      opacity: 0.7,
    },
    buttonText: {
      color: COLORS.white,
      fontSize: 18,
      fontWeight: 'bold',
      letterSpacing: 0.5,
    },
    footerText: {
      marginTop: 'auto',
      paddingTop: 40,
      fontSize: 12,
      color: '#cbd5e1',
      textAlign: 'center',
    },
    statusBox: {
      marginTop: 24,
      borderRadius: 12,
      padding: 16,
    },
    statusSuccess: {
      backgroundColor: COLORS.successBg,
      borderLeftWidth: 4,
      borderLeftColor: COLORS.successText,
    },
    statusError: {
      backgroundColor: COLORS.errorBg,
      borderLeftWidth: 4,
      borderLeftColor: COLORS.errorText,
    },
    statusTitle: {
      fontSize: 15,
      fontWeight: '700',
      marginBottom: 4,
    },
    statusLine: {
      fontSize: 13,
    },
  });

export default LoginScreen;