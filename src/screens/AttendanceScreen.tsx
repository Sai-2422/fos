// src/screens/AttendanceScreen.tsx

import React from 'react';
import {
  Alert,
  Image,
  Modal,
  PermissionsAndroid,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useColorScheme,
  View,
} from 'react-native';
import FontAwesome5 from 'react-native-vector-icons/FontAwesome5';
import {
  Asset,
  CameraOptions,
  launchCamera,
} from 'react-native-image-picker';
import {
  ATTENDANCE_OPTIONS,
  AttendanceTypeId,
  markAttendanceOnErp,
} from '../services/attendanceService';

const BRAND_PURPLE = '#3b82f6'; // button color
const CARD_BG_LIGHT = '#ffffff';
const CARD_BG_DARK = '#020617';

// ─────────────────────────────────────────────
// Camera permission helper
// ─────────────────────────────────────────────

async function requestCameraPermission(): Promise<boolean> {
  if (Platform.OS !== 'android') {
    return true; // iOS handled via Info.plist
  }

  const granted = await PermissionsAndroid.request(
    PermissionsAndroid.PERMISSIONS.CAMERA,
    {
      title: 'Camera Permission',
      message: 'We need access to your camera to click selfie for attendance.',
      buttonPositive: 'OK',
      buttonNegative: 'Cancel',
    },
  );

  return granted === PermissionsAndroid.RESULTS.GRANTED;
}

// ─────────────────────────────────────────────
// Main screen
// ─────────────────────────────────────────────

const AttendanceScreen: React.FC = () => {
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';
  const styles = React.useMemo(() => createStyles(isDark), [isDark]);

  const [sheetVisible, setSheetVisible] = React.useState(false);
  const [selectedType, setSelectedType] =
    React.useState<AttendanceTypeId>('FULL_DAY');

  const [selfie, setSelfie] = React.useState<Asset | null>(null);
  const [successVisible, setSuccessVisible] = React.useState(false);
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  const selectedTypeLabel =
    ATTENDANCE_OPTIONS.find(o => o.id === selectedType)?.label ||
    'Full Day';

  const openTypeSheet = () => setSheetVisible(true);
  const closeTypeSheet = () => setSheetVisible(false);

  const handleSelectType = (id: AttendanceTypeId) => {
    setSelectedType(id);
  };

  const handleDoneType = () => {
    closeTypeSheet();
  };

  const handleClickSelfie = async () => {
    if (!selectedType) {
      Alert.alert('Select Attendance Type', 'Please select attendance type first.');
      return;
    }

    const hasPermission = await requestCameraPermission();
    if (!hasPermission) {
      Alert.alert(
        'Permission required',
        'Camera permission is needed to click selfie.',
      );
      return;
    }

    const options: CameraOptions = {
      mediaType: 'photo',
      cameraType: 'front',
      saveToPhotos: false,
    };

    launchCamera(options, response => {
      if (response.didCancel) {
        return;
      }
      if (response.errorCode) {
        Alert.alert('Camera Error', response.errorMessage || 'Unable to open camera.');
        return;
      }
      const asset = response.assets && response.assets[0];
      if (asset) {
        setSelfie(asset); // only show preview, no success popup yet
      }
    });
  };

  const handleSubmitAttendance = async () => {
    if (!selfie) {
      Alert.alert('Selfie required', 'Please click a selfie before marking attendance.');
      return;
    }

    try {
      setIsSubmitting(true);

      await markAttendanceOnErp({
        attendanceTypeId: selectedType,
        selfie,
      });

      setSuccessVisible(true);
    } catch (err: any) {
      console.error('Error marking attendance:', err);
      Alert.alert(
        'Error',
        err?.message || 'Failed to mark attendance. Please try again.',
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSuccessOk = () => {
    setSuccessVisible(false);
  };

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Header area like screenshot */}
        <Text style={styles.pageTitle}>Mark your attendance</Text>

        {/* Illustration-style card */}
        <View style={styles.heroCard}>
          <View style={styles.heroAvatar}>
            <FontAwesome5 name="user" size={32} color="#facc15" />
          </View>
          <View style={styles.heroTextBlock}>
            <Text style={styles.heroTitle}>Ready to start your day?</Text>
            <Text style={styles.heroSubtitle}>
              Select attendance type and click selfie to mark your presence.
            </Text>
          </View>
        </View>

        {/* Select Attendance Type dropdown card */}
        <View style={styles.selectWrapper}>
          <Text style={styles.selectLabel}>Select Attendance Type</Text>
          <Pressable style={styles.selectBox} onPress={openTypeSheet}>
            <Text style={styles.selectValue}>{selectedTypeLabel}</Text>
            <FontAwesome5 name="chevron-down" size={14} color="#6b7280" />
          </Pressable>
        </View>

        {/* Click Selfie button */}
        <Pressable style={styles.selfieButton} onPress={handleClickSelfie}>
          <Text style={styles.selfieButtonText}>Click Selfie</Text>
        </Pressable>

        {/* Show preview + previous attendance + Mark Attendance button after selfie */}
        {selfie && (
          <View style={styles.afterSelfieBlock}>
            <Text style={styles.sectionHeading}>Today&apos;s Selfie</Text>
            <Image
              source={{ uri: selfie.uri }}
              style={styles.selfiePreview}
              resizeMode="cover"
            />
            <Text style={styles.locationText}>
              Location will be shown here (e.g. city, state + coordinates).
            </Text>

            <Text style={[styles.sectionHeading, { marginTop: 16 }]}>
              Previous Attendance
            </Text>
            <View style={styles.statusBadge}>
              <View style={styles.statusDot} />
              <Text style={styles.statusText}>Approved</Text>
            </View>

            {/* Mark Attendance button at end of page */}
            <Pressable
              style={[
                styles.submitButton,
                isSubmitting && styles.submitButtonDisabled,
              ]}
              onPress={handleSubmitAttendance}
              disabled={isSubmitting}
            >
              <Text style={styles.submitButtonText}>
                {isSubmitting ? 'Submitting…' : 'Mark Attendance'}
              </Text>
            </Pressable>
          </View>
        )}
      </ScrollView>

      {/* Bottom sheet – Select Attendance Type */}
      <Modal
        visible={sheetVisible}
        animationType="slide"
        transparent
        statusBarTranslucent
        onRequestClose={closeTypeSheet}
      >
        <View style={styles.sheetOverlay}>
          <View style={styles.sheetCard}>
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>Select Attendance Type</Text>
              <Pressable onPress={closeTypeSheet}>
                <Text style={styles.sheetClose}>×</Text>
              </Pressable>
            </View>

            <View style={styles.sheetOptions}>
              {ATTENDANCE_OPTIONS.map(option => (
                <Pressable
                  key={option.id}
                  style={styles.optionRow}
                  onPress={() => handleSelectType(option.id)}
                >
                  <View
                    style={[
                      styles.radioOuter,
                      selectedType === option.id && styles.radioOuterSelected,
                    ]}
                  >
                    {selectedType === option.id && (
                      <View style={styles.radioInner} />
                    )}
                  </View>
                  <Text style={styles.optionLabel}>{option.label}</Text>
                </Pressable>
              ))}
            </View>

            <Pressable style={styles.sheetDoneButton} onPress={handleDoneType}>
              <Text style={styles.sheetDoneLabel}>Done</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* Success popup – Attendance Marked Successfully */}
      <Modal
        visible={successVisible}
        animationType="fade"
        transparent
        statusBarTranslucent
        onRequestClose={handleSuccessOk}
      >
        <View style={styles.successOverlay}>
          <View style={styles.successCard}>
            <View style={styles.successIconCircle}>
              <FontAwesome5 name="check" size={18} color="#16a34a" />
            </View>
            <Text style={styles.successTitle}>
              Attendance Marked Successfully!
            </Text>
            <Pressable
              style={styles.successButton}
              onPress={handleSuccessOk}
            >
              <Text style={styles.successButtonLabel}>OK</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const createStyles = (isDark: boolean) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: isDark ? '#020617' : '#f3f4f6',
    },
    scrollContent: {
      paddingHorizontal: 20,
      paddingVertical: 18,
      paddingBottom: 40,
    },
    pageTitle: {
      fontSize: 18,
      fontWeight: '700',
      color: isDark ? '#f9fafb' : '#111827',
      marginBottom: 12,
    },
    heroCard: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: isDark ? CARD_BG_DARK : CARD_BG_LIGHT,
      borderRadius: 16,
      padding: 16,
      marginBottom: 24,
      shadowColor: '#000',
      shadowOpacity: isDark ? 0.35 : 0.06,
      shadowOffset: { width: 0, height: 4 },
      shadowRadius: 10,
      elevation: 3,
    },
    heroAvatar: {
      width: 70,
      height: 70,
      borderRadius: 16,
      backgroundColor: '#fef3c7',
      alignItems: 'center',
      justifyContent: 'center',
    },
    heroTextBlock: {
      marginLeft: 12,
      flex: 1,
      flexShrink: 1,
    },
    heroTitle: {
      fontSize: 15,
      fontWeight: '600',
      color: isDark ? '#e5e7eb' : '#111827',
      marginBottom: 4,
    },
    heroSubtitle: {
      fontSize: 12,
      color: isDark ? '#9ca3af' : '#6b7280',
      flexWrap: 'wrap',
    },

    selectWrapper: {
      marginBottom: 18,
    },
    selectLabel: {
      fontSize: 13,
      color: isDark ? '#e5e7eb' : '#4b5563',
      marginBottom: 4,
    },
    selectBox: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: isDark ? CARD_BG_DARK : CARD_BG_LIGHT,
      borderRadius: 12,
      paddingHorizontal: 14,
      paddingVertical: 12,
      borderWidth: 1,
      borderColor: '#e5e7eb',
    },
    selectValue: {
      fontSize: 14,
      color: isDark ? '#f9fafb' : '#111827',
    },

    selfieButton: {
      backgroundColor: BRAND_PURPLE,
      borderRadius: 9999,
      paddingVertical: 14,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 24,
    },
    selfieButtonText: {
      fontSize: 15,
      fontWeight: '600',
      color: '#ffffff',
    },

    afterSelfieBlock: {
      marginTop: 4,
    },
    sectionHeading: {
      fontSize: 14,
      fontWeight: '600',
      color: isDark ? '#e5e7eb' : '#111827',
      marginBottom: 8,
    },
    selfiePreview: {
      width: '100%',
      height: 220,
      borderRadius: 16,
      backgroundColor: '#00000033',
      marginBottom: 8,
    },
    locationText: {
      fontSize: 12,
      color: isDark ? '#9ca3af' : '#4b5563',
      marginBottom: 12,
    },
    statusBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      alignSelf: 'flex-start',
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 9999,
      backgroundColor: '#E6FFEA',
    },
    statusDot: {
      width: 7,
      height: 7,
      borderRadius: 999,
      backgroundColor: '#16a34a',
      marginRight: 6,
    },
    statusText: {
      fontSize: 12,
      color: '#166534',
      fontWeight: '600',
    },

    submitButton: {
      marginTop: 20,
      borderRadius: 9999,
      paddingVertical: 14,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: BRAND_PURPLE,
    },
    submitButtonDisabled: {
      opacity: 0.6,
    },
    submitButtonText: {
      fontSize: 15,
      fontWeight: '600',
      color: '#ffffff',
    },

    // Bottom sheet styles
    sheetOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.35)',
      justifyContent: 'flex-end',
    },
    sheetCard: {
      backgroundColor: isDark ? CARD_BG_DARK : CARD_BG_LIGHT,
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      paddingHorizontal: 20,
      paddingTop: 16,
      paddingBottom: 24,
    },
    sheetHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 12,
    },
    sheetTitle: {
      fontSize: 16,
      fontWeight: '600',
      color: isDark ? '#f9fafb' : '#111827',
    },
    sheetClose: {
      fontSize: 24,
      color: '#6b7280',
      paddingHorizontal: 4,
    },
    sheetOptions: {
      marginBottom: 16,
    },
    optionRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 8,
    },
    radioOuter: {
      width: 20,
      height: 20,
      borderRadius: 999,
      borderWidth: 1.5,
      borderColor: '#d1d5db',
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 10,
    },
    radioOuterSelected: {
      borderColor: BRAND_PURPLE,
    },
    radioInner: {
      width: 11,
      height: 11,
      borderRadius: 999,
      backgroundColor: BRAND_PURPLE,
    },
    optionLabel: {
      fontSize: 14,
      color: isDark ? '#e5e7eb' : '#111827',
    },
    sheetDoneButton: {
      marginTop: 4,
      borderRadius: 9999,
      paddingVertical: 12,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: BRAND_PURPLE,
    },
    sheetDoneLabel: {
      fontSize: 15,
      fontWeight: '600',
      color: '#ffffff',
    },

    // Success popup
    successOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.45)',
      justifyContent: 'center',
      alignItems: 'center',
    },
    successCard: {
      width: '80%',
      borderRadius: 24,
      paddingHorizontal: 22,
      paddingVertical: 22,
      backgroundColor: isDark ? CARD_BG_DARK : CARD_BG_LIGHT,
      shadowColor: '#000',
      shadowOpacity: 0.3,
      shadowOffset: { width: 0, height: 6 },
      shadowRadius: 16,
      elevation: 10,
      alignItems: 'center',
    },
    successIconCircle: {
      width: 40,
      height: 40,
      borderRadius: 999,
      borderWidth: 2,
      borderColor: '#16a34a',
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 12,
    },
    successTitle: {
      fontSize: 16,
      fontWeight: '600',
      color: isDark ? '#e5e7eb' : '#111827',
      textAlign: 'center',
      marginBottom: 16,
    },
    successButton: {
      borderRadius: 9999,
      paddingVertical: 10,
      paddingHorizontal: 32,
      backgroundColor: BRAND_PURPLE,
    },
    successButtonLabel: {
      fontSize: 14,
      fontWeight: '600',
      color: '#ffffff',
    },
  });

export default AttendanceScreen;
