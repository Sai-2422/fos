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
  MarkAttendanceResult,
  FOSAttendanceRow,
  fetchAttendanceHistoryForLoggedInUser,
  fetchTodayAttendanceForLoggedInUser,
  AttendanceStatus,
} from '../services/attendanceService';

const BRAND_PURPLE = '#3b82f6'; // button color
const CARD_BG_LIGHT = '#ffffff';
const CARD_BG_DARK = '#020617';

// ─────────────────────────────────────────────
// Status & Type color helpers
// ─────────────────────────────────────────────

type TypeColor = { bg: string; text: string };
type StatusColor = { bg: string; text: string; dot: string };

function getAttendanceTypeColors(label: string): TypeColor {
  // Label values from ERP: "Full Day", "Leave",
  // "Half Day (First Half)", "Half Day (Second Half)"
  if (label === 'Leave') {
    return {
      bg: '#FFF7D2',
      text: '#92400E',
    };
  }
  if (label.startsWith('Half Day')) {
    return {
      bg: '#EDE9FE',
      text: '#6D28D9',
    };
  }
  // Default → Full Day (or unknown)
  return {
    bg: '#DBEAFE',
    text: '#1D4ED8',
  };
}

function getStatusColors(status: AttendanceStatus | string): StatusColor {
  switch (status) {
    case 'Present':
      return {
        bg: '#E6FFEA',
        text: '#166534',
        dot: '#16a34a',
      };
    case 'Leave':
      return {
        bg: '#FFF7D2',
        text: '#92400E',
        dot: '#D97706',
      };
    case 'Absent':
      return {
        bg: '#FFE0E0',
        text: '#B91C1C',
        dot: '#DC2626',
      };
    default:
      return {
        bg: '#E5E7EB',
        text: '#374151',
        dot: '#6B7280',
      };
  }
}

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
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  const [successVisible, setSuccessVisible] = React.useState(false);
  const [submitResult, setSubmitResult] =
    React.useState<MarkAttendanceResult | null>(null);

  // Today + history state
  const [attendanceMarkedToday, setAttendanceMarkedToday] =
    React.useState<boolean | null>(null); // null = checking
  const [todayAttendance, setTodayAttendance] =
    React.useState<FOSAttendanceRow | null>(null);
  const [history, setHistory] = React.useState<FOSAttendanceRow[]>([]);
  const [loadingHistory, setLoadingHistory] = React.useState<boolean>(false);
  const [historyError, setHistoryError] = React.useState<string | null>(null);

  const selectedTypeLabel =
    ATTENDANCE_OPTIONS.find(o => o.id === selectedType)?.label || 'Full Day';

  // Pre-compute colors for today's card (if any)
  const todayTypeColors = todayAttendance
    ? getAttendanceTypeColors(todayAttendance.attendance_type)
    : null;
  const todayStatusColors = todayAttendance
    ? getStatusColors(todayAttendance.status)
    : null;

  // ─────────────────────────────────────────────
  // Load today's attendance + history from ERP
  // ─────────────────────────────────────────────

  const loadAttendanceData = React.useCallback(async () => {
    try {
      setLoadingHistory(true);
      setHistoryError(null);
      setAttendanceMarkedToday(null);

      const [today, list] = await Promise.all([
        fetchTodayAttendanceForLoggedInUser(),
        fetchAttendanceHistoryForLoggedInUser(),
      ]);

      setTodayAttendance(today);
      setAttendanceMarkedToday(!!today);
      setHistory(list);
    } catch (error) {
      console.warn('AttendanceScreen: failed to load attendance', error);
      setHistoryError(
        "Unable to load attendance history. You can still mark today's attendance.",
      );
      // On error, allow marking attendance
      setAttendanceMarkedToday(false);
    } finally {
      setLoadingHistory(false);
    }
  }, []);

  React.useEffect(() => {
    loadAttendanceData();
  }, [loadAttendanceData]);

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
      Alert.alert(
        'Select Attendance Type',
        'Please select attendance type first.',
      );
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
      saveToPhotos: false,
      includeBase64: false,
      cameraType: 'front',
      quality: 0.8,
    };

    const result = await launchCamera(options);

    if (result.didCancel) {
      return;
    }

    if (result.errorCode) {
      Alert.alert(
        'Camera Error',
        result.errorMessage || 'Unable to open camera.',
      );
      return;
    }

    const asset = result.assets && result.assets[0];
    if (!asset) {
      Alert.alert('No image', 'Could not capture selfie, please try again.');
      return;
    }

    setSelfie(asset);
  };

  const handleSubmitAttendance = async () => {
    if (!selfie) {
      Alert.alert(
        'Selfie required',
        'Please click a selfie to mark your attendance.',
      );
      return;
    }

    try {
      setIsSubmitting(true);

      const result = await markAttendanceOnErp({
        attendanceTypeId: selectedType,
        selfie,
      });

      setSubmitResult(result);
      setSuccessVisible(true);
      setSelfie(null);

      // Build FOSAttendanceRow from result for local UI
      const newRow: FOSAttendanceRow = {
        name: result.attendanceName,
        attendance_date: result.attendanceDate,
        status: result.status,
        attendance_type: result.attendanceType,
      };

      setTodayAttendance(newRow);
      setAttendanceMarkedToday(true);
      setHistory(prev => [newRow, ...prev]);
    } catch (error: any) {
      console.warn('Failed to mark attendance', error);
      Alert.alert(
        'Error',
        error?.message ||
          'Failed to mark attendance. Please try again after some time.',
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSuccessOk = () => {
    setSuccessVisible(false);
  };

  // ─────────────────────────────────────────────
  // History renderer (with colored type + status)
  // ─────────────────────────────────────────────

  const renderHistory = () => {
    if (loadingHistory && history.length === 0) {
      return (
        <View style={styles.historyLoadingCard}>
          <Text style={styles.historyLoadingText}>
            Loading your previous attendance...
          </Text>
        </View>
      );
    }

    if (historyError && history.length === 0) {
      return (
        <View style={styles.historyErrorCard}>
          <Text style={styles.historyErrorText}>{historyError}</Text>
        </View>
      );
    }

    if (history.length === 0) {
      return (
        <View style={styles.historyEmptyCard}>
          <Text style={styles.historyEmptyTitle}>
            No attendance records found
          </Text>
          <Text style={styles.historyEmptyText}>
            Once you start marking attendance, your past entries will appear
            here.
          </Text>
        </View>
      );
    }

    return (
      <View style={styles.historyListWrapper}>
        {history.map(row => {
          const typeColors = getAttendanceTypeColors(row.attendance_type);
          const statusColors = getStatusColors(row.status);

          return (
            <View key={row.name} style={styles.historyRow}>
              <View style={styles.historyLeft}>
                <Text style={styles.historyDate}>{row.attendance_date}</Text>

                <View style={styles.historyTypeRow}>
                  <View
                    style={[
                      styles.historyTypePill,
                      { backgroundColor: typeColors.bg },
                    ]}
                  >
                    <Text
                      style={[
                        styles.historyTypePillText,
                        { color: typeColors.text },
                      ]}
                    >
                      {row.attendance_type}
                    </Text>
                  </View>
                </View>
              </View>

              <View style={styles.historyRight}>
                <View
                  style={[
                    styles.historyStatusBadge,
                    { backgroundColor: statusColors.bg },
                  ]}
                >
                  <View
                    style={[
                      styles.historyStatusDot,
                      { backgroundColor: statusColors.dot },
                    ]}
                  />
                  <Text
                    style={[
                      styles.historyStatusText,
                      { color: statusColors.text },
                    ]}
                  >
                    {row.status}
                  </Text>
                </View>
              </View>
            </View>
          );
        })}
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Header area like screenshot */}
        <Text style={styles.pageTitle}>Mark your attendance</Text>

        {/* If today's attendance is already marked, show info + history only */}
        {attendanceMarkedToday ? (
          <View>
            <View style={styles.infoCard}>
              <View style={styles.infoIconCircle}>
                <FontAwesome5 name="check" size={18} color="#16a34a" />
              </View>
              <Text style={styles.infoTitle}>
                Attendance already marked for today
              </Text>
              {todayAttendance && todayTypeColors && todayStatusColors && (
                <View style={styles.infoSubtitleRow}>
                  <Text style={styles.infoSubtitleDate}>
                    {todayAttendance.attendance_date}
                  </Text>

                  <View
                    style={[
                      styles.infoTypePill,
                      { backgroundColor: todayTypeColors.bg },
                    ]}
                  >
                    <Text
                      style={[
                        styles.infoTypePillText,
                        { color: todayTypeColors.text },
                      ]}
                    >
                      {todayAttendance.attendance_type}
                    </Text>
                  </View>

                  <View
                    style={[
                      styles.infoStatusPill,
                      { backgroundColor: todayStatusColors.bg },
                    ]}
                  >
                    <Text
                      style={[
                        styles.infoStatusPillText,
                        { color: todayStatusColors.text },
                      ]}
                    >
                      {todayAttendance.status}
                    </Text>
                  </View>
                </View>
              )}
              {!todayAttendance && (
                <Text style={styles.infoSubtitlePlain}>
                  You have already marked your attendance for today.
                </Text>
              )}
            </View>

            <Text style={[styles.sectionHeading, { marginTop: 20 }]}>
              Previous Attendance
            </Text>
            {renderHistory()}
          </View>
        ) : (
          <View>
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
                {/* Colored label based on selected type */}
                {(() => {
                  const colors = getAttendanceTypeColors(selectedTypeLabel);
                  return (
                    <View style={styles.selectValueWrapper}>
                      <View
                        style={[
                          styles.selectColorDot,
                          { backgroundColor: colors.text },
                        ]}
                      />
                      <Text
                        style={[
                          styles.selectValue,
                          { color: colors.text },
                        ]}
                      >
                        {selectedTypeLabel}
                      </Text>
                    </View>
                  );
                })()}
                <FontAwesome5 name="chevron-down" size={14} color="#6b7280" />
              </Pressable>
            </View>

            {/* Click Selfie card */}
            <View style={styles.selfieCard}>
              <View style={styles.selfieIconCircle}>
                <FontAwesome5 name="camera" size={20} color="#ffffff" />
              </View>
              <View style={styles.selfieTextBlock}>
                <Text style={styles.selfieTitle}>Click your selfie</Text>
                <Text style={styles.selfieSubtitle}>
                  Make sure your face is clearly visible and you are at your
                  work location.
                </Text>
              </View>
              <Pressable
                style={styles.selfieButton}
                onPress={handleClickSelfie}
              >
                <Text style={styles.selfieButtonLabel}>Click Selfie</Text>
              </Pressable>
            </View>

            {/* Show preview + Mark Attendance + history */}
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
                {renderHistory()}

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

            {/* If no selfie yet, still show history below */}
            {!selfie && (
              <View style={{ marginTop: 24 }}>
                <Text style={styles.sectionHeading}>Previous Attendance</Text>
                {renderHistory()}
              </View>
            )}
          </View>
        )}
      </ScrollView>

      {/* Bottom sheet – Select Attendance Type */}
      <Modal
        visible={sheetVisible}
        transparent
        animationType="slide"
        onRequestClose={closeTypeSheet}
      >
        <View style={styles.sheetBackdrop}>
          <Pressable
            style={styles.sheetBackdropTouchable}
            onPress={closeTypeSheet}
          >
            <View />
          </Pressable>
          <View style={styles.sheetContainer}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>Select Attendance Type</Text>

            {ATTENDANCE_OPTIONS.map(option => {
              const colors = getAttendanceTypeColors(option.label);
              const isSelected = selectedType === option.id;
              return (
                <Pressable
                  key={option.id}
                  style={styles.optionRow}
                  onPress={() => handleSelectType(option.id)}
                >
                  <View
                    style={[
                      styles.radioOuter,
                      isSelected && styles.radioOuterSelected,
                    ]}
                  >
                    {isSelected && <View style={styles.radioInner} />}
                  </View>
                  <View style={styles.optionLabelWrapper}>
                    <View
                      style={[
                        styles.optionColorDot,
                        { backgroundColor: colors.text },
                      ]}
                    />
                    <Text
                      style={[
                        styles.optionLabel,
                        { color: colors.text },
                      ]}
                    >
                      {option.label}
                    </Text>
                  </View>
                </Pressable>
              );
            })}

            <Pressable style={styles.sheetDoneButton} onPress={handleDoneType}>
              <Text style={styles.sheetDoneButtonLabel}>Done</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* Success modal */}
      <Modal
        visible={successVisible}
        transparent
        animationType="fade"
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
            {submitResult && (
              <Text style={styles.successSubtitle}>
                {submitResult.fullName} • {submitResult.attendanceType} •{' '}
                {submitResult.status}
              </Text>
            )}
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
      paddingHorizontal: 16,
      paddingTop: 18,
      paddingBottom: 32,
    },
    pageTitle: {
      fontSize: 20,
      fontWeight: '800',
      color: isDark ? '#e5e7eb' : '#111827',
      marginBottom: 16,
    },
    heroCard: {
      flexDirection: 'row',
      alignItems: 'center',
      padding: 14,
      borderRadius: 16,
      backgroundColor: isDark ? CARD_BG_DARK : CARD_BG_LIGHT,
      marginBottom: 16,
      shadowColor: '#000',
      shadowOpacity: isDark ? 0.4 : 0.06,
      shadowOffset: { width: 0, height: 4 },
      shadowRadius: 10,
      elevation: 3,
    },
    heroAvatar: {
      width: 54,
      height: 54,
      borderRadius: 27,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: '#1d4ed8',
      marginRight: 12,
    },
    heroTextBlock: {
      flex: 1,
    },
    heroTitle: {
      fontSize: 16,
      fontWeight: '700',
      color: isDark ? '#e5e7eb' : '#111827',
      marginBottom: 2,
    },
    heroSubtitle: {
      fontSize: 13,
      color: isDark ? '#9ca3af' : '#6b7280',
    },
    selectWrapper: {
      marginBottom: 16,
    },
    selectLabel: {
      fontSize: 13,
      color: isDark ? '#9ca3af' : '#4b5563',
      marginBottom: 6,
    },
    selectBox: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      borderRadius: 12,
      paddingHorizontal: 14,
      paddingVertical: 12,
      backgroundColor: isDark ? CARD_BG_DARK : '#ffffff',
      borderWidth: 1,
      borderColor: isDark ? '#1f2937' : '#e5e7eb',
    },
    selectValueWrapper: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    selectColorDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
      marginRight: 8,
    },
    selectValue: {
      fontSize: 14,
      color: isDark ? '#e5e7eb' : '#111827',
    },
    selfieCard: {
      flexDirection: 'row',
      alignItems: 'center',
      padding: 14,
      borderRadius: 16,
      backgroundColor: isDark ? CARD_BG_DARK : CARD_BG_LIGHT,
      marginBottom: 16,
      shadowColor: '#000',
      shadowOpacity: isDark ? 0.4 : 0.05,
      shadowOffset: { width: 0, height: 3 },
      shadowRadius: 8,
      elevation: 2,
    },
    selfieIconCircle: {
      width: 38,
      height: 38,
      borderRadius: 19,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: BRAND_PURPLE,
      marginRight: 10,
    },
    selfieTextBlock: {
      flex: 1,
    },
    selfieTitle: {
      fontSize: 14,
      fontWeight: '700',
      color: isDark ? '#e5e7eb' : '#111827',
      marginBottom: 2,
    },
    selfieSubtitle: {
      fontSize: 12,
      color: isDark ? '#9ca3af' : '#6b7280',
    },
    selfieButton: {
      borderRadius: 9999,
      paddingHorizontal: 16,
      paddingVertical: 8,
      backgroundColor: BRAND_PURPLE,
      marginLeft: 8,
    },
    selfieButtonLabel: {
      fontSize: 13,
      fontWeight: '600',
      color: '#ffffff',
    },
    afterSelfieBlock: {
      marginTop: 4,
      borderRadius: 18,
      padding: 14,
      backgroundColor: isDark ? CARD_BG_DARK : CARD_BG_LIGHT,
      shadowColor: '#000',
      shadowOpacity: isDark ? 0.4 : 0.06,
      shadowOffset: { width: 0, height: 4 },
      shadowRadius: 10,
      elevation: 3,
    },
    sectionHeading: {
      fontSize: 15,
      fontWeight: '700',
      color: isDark ? '#e5e7eb' : '#111827',
      marginBottom: 8,
    },
    selfiePreview: {
      width: '100%',
      height: 220,
      borderRadius: 16,
      marginBottom: 8,
    },
    locationText: {
      fontSize: 12,
      color: isDark ? '#9ca3af' : '#4b5563',
      marginBottom: 12,
    },
    submitButton: {
      marginTop: 18,
      borderRadius: 9999,
      paddingVertical: 12,
      alignItems: 'center',
      backgroundColor: BRAND_PURPLE,
    },
    submitButtonDisabled: {
      opacity: 0.7,
    },
    submitButtonText: {
      fontSize: 15,
      fontWeight: '600',
      color: '#ffffff',
    },
    // Bottom sheet styles
    sheetBackdrop: {
      flex: 1,
      backgroundColor: 'rgba(15,23,42,0.7)',
      justifyContent: 'flex-end',
    },
    sheetBackdropTouchable: {
      flex: 1,
    },
    sheetContainer: {
      paddingTop: 10,
      paddingBottom: 22,
      paddingHorizontal: 16,
      borderTopLeftRadius: 18,
      borderTopRightRadius: 18,
      backgroundColor: isDark ? '#020617' : '#ffffff',
    },
    sheetHandle: {
      alignSelf: 'center',
      width: 40,
      height: 4,
      borderRadius: 9999,
      backgroundColor: '#9ca3af',
      marginBottom: 8,
    },
    sheetTitle: {
      fontSize: 15,
      fontWeight: '700',
      color: isDark ? '#e5e7eb' : '#111827',
      marginBottom: 10,
    },
    optionRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 8,
    },
    radioOuter: {
      width: 18,
      height: 18,
      borderRadius: 9,
      borderWidth: 2,
      borderColor: '#9ca3af',
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 10,
    },
    radioOuterSelected: {
      borderColor: BRAND_PURPLE,
    },
    radioInner: {
      width: 10,
      height: 10,
      borderRadius: 5,
      backgroundColor: BRAND_PURPLE,
    },
    optionLabelWrapper: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    optionColorDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
      marginRight: 8,
    },
    optionLabel: {
      fontSize: 14,
      color: isDark ? '#e5e7eb' : '#111827',
    },
    sheetDoneButton: {
      marginTop: 14,
      borderRadius: 9999,
      paddingVertical: 10,
      alignItems: 'center',
      backgroundColor: BRAND_PURPLE,
    },
    sheetDoneButtonLabel: {
      fontSize: 14,
      fontWeight: '600',
      color: '#ffffff',
    },
    // Success modal styles
    successOverlay: {
      flex: 1,
      backgroundColor: 'rgba(15,23,42,0.7)',
      justifyContent: 'center',
      alignItems: 'center',
      paddingHorizontal: 32,
    },
    successCard: {
      width: '100%',
      borderRadius: 18,
      paddingHorizontal: 18,
      paddingVertical: 18,
      backgroundColor: isDark ? CARD_BG_DARK : '#ffffff',
      alignItems: 'center',
    },
    successIconCircle: {
      width: 44,
      height: 44,
      borderRadius: 22,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: '#dcfce7',
      marginBottom: 10,
    },
    successTitle: {
      fontSize: 16,
      fontWeight: '700',
      color: isDark ? '#e5e7eb' : '#166534',
      marginBottom: 4,
      textAlign: 'center',
    },
    successSubtitle: {
      fontSize: 13,
      color: isDark ? '#9ca3af' : '#4b5563',
      textAlign: 'center',
      marginBottom: 14,
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
    // Info + history styles
    infoCard: {
      borderRadius: 16,
      padding: 14,
      backgroundColor: isDark ? CARD_BG_DARK : '#ecfdf5',
      borderWidth: 1,
      borderColor: isDark ? '#065f46' : '#a7f3d0',
      marginBottom: 16,
    },
    infoIconCircle: {
      width: 32,
      height: 32,
      borderRadius: 16,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: '#dcfce7',
      marginBottom: 8,
    },
    infoTitle: {
      fontSize: 15,
      fontWeight: '700',
      color: isDark ? '#bbf7d0' : '#166534',
      marginBottom: 4,
    },
    infoSubtitleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      flexWrap: 'wrap',
      marginTop: 4,
      rowGap: 4,
    },
    infoSubtitleDate: {
      fontSize: 13,
      color: isDark ? '#a7f3d0' : '#065f46',
      marginRight: 8,
    },
    infoSubtitlePlain: {
      fontSize: 13,
      color: isDark ? '#a7f3d0' : '#065f46',
      marginTop: 4,
    },
    infoTypePill: {
      borderRadius: 9999,
      paddingHorizontal: 10,
      paddingVertical: 4,
      marginRight: 8,
    },
    infoTypePillText: {
      fontSize: 12,
      fontWeight: '600',
    },
    infoStatusPill: {
      borderRadius: 9999,
      paddingHorizontal: 10,
      paddingVertical: 4,
    },
    infoStatusPillText: {
      fontSize: 12,
      fontWeight: '600',
    },
    historyLoadingCard: {
      marginTop: 8,
      padding: 10,
      borderRadius: 12,
      backgroundColor: isDark ? CARD_BG_DARK : '#e5e7eb',
    },
    historyLoadingText: {
      fontSize: 13,
      color: isDark ? '#9ca3af' : '#4b5563',
    },
    historyErrorCard: {
      marginTop: 8,
      padding: 10,
      borderRadius: 12,
      backgroundColor: isDark ? '#451a0a' : '#fef2f2',
    },
    historyErrorText: {
      fontSize: 13,
      color: isDark ? '#fed7aa' : '#b91c1c',
    },
    historyEmptyCard: {
      marginTop: 8,
      padding: 12,
      borderRadius: 12,
      backgroundColor: isDark ? CARD_BG_DARK : '#f9fafb',
    },
    historyEmptyTitle: {
      fontSize: 14,
      fontWeight: '600',
      color: isDark ? '#e5e7eb' : '#111827',
      marginBottom: 2,
    },
    historyEmptyText: {
      fontSize: 12,
      color: isDark ? '#9ca3af' : '#6b7280',
    },
    historyListWrapper: {
      marginTop: 8,
      borderRadius: 12,
      backgroundColor: isDark ? CARD_BG_DARK : '#ffffff',
      borderWidth: 1,
      borderColor: isDark ? '#1f2937' : '#e5e7eb',
    },
    historyRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 12,
      paddingVertical: 10,
      borderBottomWidth: 1,
      borderBottomColor: isDark ? '#111827' : '#e5e7eb',
    },
    historyLeft: {
      flex: 1,
      paddingRight: 8,
    },
    historyRight: {},
    historyDate: {
      fontSize: 13,
      fontWeight: '600',
      color: isDark ? '#e5e7eb' : '#111827',
      marginBottom: 4,
    },
    historyTypeRow: {
      flexDirection: 'row',
      alignItems: 'center',
      flexWrap: 'wrap',
    },
    historyTypePill: {
      borderRadius: 9999,
      paddingHorizontal: 10,
      paddingVertical: 3,
      marginRight: 4,
    },
    historyTypePillText: {
      fontSize: 12,
      fontWeight: '600',
    },
    historyStatusBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: 9999,
    },
    historyStatusDot: {
      width: 7,
      height: 7,
      borderRadius: 3.5,
      marginRight: 6,
    },
    historyStatusText: {
      fontSize: 12,
      fontWeight: '600',
    },
  });

export default AttendanceScreen;
