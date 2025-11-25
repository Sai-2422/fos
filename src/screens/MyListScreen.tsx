// src/screens/MyListScreen.tsx

import React from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  PermissionsAndroid,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useColorScheme,
  View,
} from 'react-native';
import { useRoute } from '@react-navigation/native';
import DateTimePicker, {
  DateTimePickerEvent,
} from '@react-native-community/datetimepicker';
import {
  AgentCase,
  CASE_STATUS_OPTIONS,
  OUTCOME_TYPE_OPTIONS,
  fetchCasesForAgent,
  updateCaseStatus,
  updateCaseOutcome,
  uploadCaseSelfie,
  createKycDocumentWithImages,
} from '../services/myCasesService';
import {
  Asset,
  CameraOptions,
  ImageLibraryOptions,
  launchCamera,
  launchImageLibrary,
} from 'react-native-image-picker';

const BRAND_BLUE = '#397E8A';

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

async function requestCameraPermission(): Promise<boolean> {
  if (Platform.OS !== 'android') {
    return true; // iOS handled via Info.plist
  }

  const granted = await PermissionsAndroid.request(
    PermissionsAndroid.PERMISSIONS.CAMERA,
    {
      title: 'Camera Permission',
      message: 'We need access to your camera to click visit selfie.',
      buttonPositive: 'OK',
      buttonNegative: 'Cancel',
    },
  );

  return granted === PermissionsAndroid.RESULTS.GRANTED;
}

function parseYYYYMMDD(str?: string | null): Date | null {
  if (!str) return null;
  const parts = str.split('-');
  if (parts.length !== 3) return null;
  const [yyyy, mm, dd] = parts.map(v => Number(v));
  if (!yyyy || !mm || !dd) return null;
  const d = new Date(yyyy, mm - 1, dd);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

function formatYYYYMMDD(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// ─────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────

const MyListScreen: React.FC = () => {
  const route = useRoute<any>();
  // We expect HomeScreen to do: navigation.navigate('MyList', { agentName })
  const agentName = route.params?.agentName as string | undefined;

  const scheme = useColorScheme();
  const isDark = scheme === 'dark';
  const styles = React.useMemo(() => createStyles(isDark), [isDark]);

  const [cases, setCases] = React.useState<AgentCase[]>([]);
  const [loading, setLoading] = React.useState<boolean>(false);
  const [refreshing, setRefreshing] = React.useState<boolean>(false);
  const [error, setError] = React.useState<string | null>(null);

  // Modal state
  const [selectedCase, setSelectedCase] = React.useState<AgentCase | null>(
    null,
  );
  const [editStatus, setEditStatus] = React.useState<string>('');
  const [editOutcome, setEditOutcome] = React.useState<string>('');
  const [editVisitDate, setEditVisitDate] = React.useState<string>('');
  const [visitDateObj, setVisitDateObj] = React.useState<Date | null>(null);
  const [showVisitDatePicker, setShowVisitDatePicker] =
    React.useState<boolean>(false);
  const [editRescheduleDate, setEditRescheduleDate] =
    React.useState<string>('');
  const [rescheduleDateObj, setRescheduleDateObj] = React.useState<Date | null>(
    null,
  );
  const [showReschedulePicker, setShowReschedulePicker] =
    React.useState<boolean>(false);

  const [visitSelfieAsset, setVisitSelfieAsset] = React.useState<Asset | null>(
    null,
  );
  const [kycDocType, setKycDocType] = React.useState<string>('');
  const [kycDocNo, setKycDocNo] = React.useState<string>('');
  const [kycFrontAsset, setKycFrontAsset] = React.useState<Asset | null>(null);
  const [kycBackAsset, setKycBackAsset] = React.useState<Asset | null>(null);
  const [savingVisit, setSavingVisit] = React.useState<boolean>(false);

  const loadCases = React.useCallback(async () => {
    if (!agentName) {
      setError(
        'Agent name is missing. Pass agentName in navigation params when opening My List screen.',
      );
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const data = await fetchCasesForAgent(agentName);

      // ── Sort by priority: High → Low → (no / other priority) ──
      const getPriorityRank = (p?: string | null): number => {
        if (!p) return 2;
        const lower = p.toLowerCase();
        if (lower === 'high') return 0;
        if (lower === 'low') return 1;
        return 2;
      };

      const sorted = [...data].sort((a, b) => {
        const ra = getPriorityRank(a.priority);
        const rb = getPriorityRank(b.priority);
        if (ra !== rb) return ra - rb;
        // keep relative order for same rank
        return 0;
      });

      setCases(sorted);
    } catch (err: any) {
      console.error('Failed to load cases', err);
      setError(err?.message || 'Failed to load cases.');
    } finally {
      setLoading(false);
    }
  }, [agentName]);

  React.useEffect(() => {
    loadCases();
  }, [loadCases]);

  const onRefresh = React.useCallback(async () => {
    setRefreshing(true);
    try {
      await loadCases();
    } finally {
      setRefreshing(false);
    }
  }, [loadCases]);

  const openCaseModal = (item: AgentCase) => {
    setSelectedCase(item);
    setEditStatus(item.status || 'Open');
    setEditOutcome(item.outcomeType || '');

    // Visit date: default to today's date if not set
    const visitStr = item.visitDate || '';
    if (visitStr) {
      const parsedVisit = parseYYYYMMDD(visitStr);
      if (parsedVisit) {
        setVisitDateObj(parsedVisit);
        setEditVisitDate(visitStr);
      } else {
        const today = new Date();
        setVisitDateObj(today);
        setEditVisitDate(formatYYYYMMDD(today));
      }
    } else {
      const today = new Date();
      setVisitDateObj(today);
      setEditVisitDate(formatYYYYMMDD(today));
    }

    const res = item.rescheduleDate || '';
    setEditRescheduleDate(res);
    setRescheduleDateObj(parseYYYYMMDD(res));

    setShowVisitDatePicker(false);
    setShowReschedulePicker(false);

    setVisitSelfieAsset(null);
    setKycDocType('');
    setKycDocNo('');
    setKycFrontAsset(null);
    setKycBackAsset(null);
  };

  const closeModal = () => {
    if (savingVisit) return;
    setSelectedCase(null);
    setShowVisitDatePicker(false);
    setShowReschedulePicker(false);
  };

  const pickImageFromLibrary = async (onPicked: (asset: Asset) => void) => {
    const options: ImageLibraryOptions = {
      mediaType: 'photo',
      quality: 0.7,
    };

    const result = await launchImageLibrary(options);
    if (result.didCancel || !result.assets || result.assets.length === 0) {
      return;
    }

    const asset = result.assets[0];
    onPicked(asset);
  };

  const pickVisitSelfie = React.useCallback(async () => {
    const hasPermission = await requestCameraPermission();
    if (!hasPermission) {
      Alert.alert(
        'Permission required',
        'Camera permission is needed to click visit selfie.',
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
        Alert.alert(
          'Camera Error',
          response.errorMessage || 'Unable to open camera.',
        );
        return;
      }
      const asset = response.assets && response.assets[0];
      if (asset) {
        setVisitSelfieAsset(asset);
      }
    });
  }, []);

  const pickKycFront = () => {
    pickImageFromLibrary(asset => setKycFrontAsset(asset));
  };

  const pickKycBack = () => {
    pickImageFromLibrary(asset => setKycBackAsset(asset));
  };

  const handleVisitDateChange = (event: DateTimePickerEvent, date?: Date) => {
    if (Platform.OS !== 'ios') {
      setShowVisitDatePicker(false);
    }

    if (event.type === 'set' && date) {
      setVisitDateObj(date);
      setEditVisitDate(formatYYYYMMDD(date));
    }
  };

  const handleRescheduleDateChange = (
    event: DateTimePickerEvent,
    date?: Date,
  ) => {
    if (Platform.OS !== 'ios') {
      setShowReschedulePicker(false);
    }

    if (event.type === 'set' && date) {
      setRescheduleDateObj(date);
      setEditRescheduleDate(formatYYYYMMDD(date));
    }
  };

  const handleSaveVisitDetails = async () => {
    if (!selectedCase) return;

    try {
      setSavingVisit(true);

      // 1) Status
      if (editStatus && editStatus !== selectedCase.status) {
        await updateCaseStatus(selectedCase.id, editStatus);
      }

      // 2) Outcome + dates
      await updateCaseOutcome(selectedCase.id, {
        outcomeType: editOutcome,
        visitDate: editVisitDate,
        // Only keep reschedule_date if outcome is Reschedule
        rescheduleDate: editOutcome === 'Reschedule' ? editRescheduleDate : '',
      });

      // 3) Visit selfie (camera)
      if (visitSelfieAsset) {
        await uploadCaseSelfie(selectedCase.id, visitSelfieAsset);
      }

      // 4) KYC row (only if outcome is KYC and we have minimum data)
      if (
        editOutcome === 'KYC' &&
        kycDocType &&
        kycDocNo &&
        (kycFrontAsset || kycBackAsset)
      ) {
        await createKycDocumentWithImages(selectedCase.id, {
          documentType: kycDocType,
          documentNo: kycDocNo,
          frontAsset: kycFrontAsset || undefined,
          backAsset: kycBackAsset || undefined,
        });
      }

      await loadCases();
      closeModal();
    } catch (err: any) {
      console.error('Failed to save visit details', err);
      Alert.alert('Error', err?.message || 'Failed to save visit details');
    } finally {
      setSavingVisit(false);
    }
  };

  const renderItem = ({ item }: { item: AgentCase }) => {
    const priorityLower =
      typeof item.priority === 'string' ? item.priority.toLowerCase() : '';

    return (
      <TouchableOpacity
        style={styles.card}
        activeOpacity={0.9}
        onPress={() => openCaseModal(item)}
      >
        <View style={styles.cardHeader}>
          <View style={{ flex: 1 }}>
            <Text style={styles.customerName} numberOfLines={1}>
              {item.customer || 'Unknown customer'}
            </Text>
            <Text style={styles.caseId}>{item.caseId}</Text>
          </View>

          <View style={styles.cardHeaderRight}>
            {item.priority ? (
              <Text
                style={[
                  styles.priorityChip,
                  priorityLower === 'high' && styles.priorityChipHigh,
                  priorityLower === 'low' && styles.priorityChipLow,
                ]}
              >
                {item.priority}
              </Text>
            ) : null}

            {/* Status on card – read-only (no onPress) */}
            <Text
              style={[
                styles.statusChip,
                item.status === 'Closed' && styles.statusChipCompleted,
                item.status === 'Open' && styles.statusChipPending,
              ]}
            >
              {item.status || 'Set status'}
            </Text>
          </View>
        </View>

        <View style={styles.metaRow}>
          <Text style={styles.metaText}>Overdue: ₹ {item.overdueAmount}</Text>
          <Text style={styles.metaText}>DPD: {item.dpd}</Text>
        </View>

        {item.address ? (
          <Text style={styles.addressText} numberOfLines={1}>
            {item.address}
          </Text>
        ) : null}

        <View style={styles.footerRow}>
          <Text style={styles.metaText}>Agent: {item.agent || '-'}</Text>
          {item.outcomeType ? (
            <Text style={styles.metaText}>Outcome: {item.outcomeType}</Text>
          ) : null}
        </View>
      </TouchableOpacity>
    );
  };

  const keyExtractor = (item: AgentCase) => item.id;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>My List</Text>
        {/* <Text style={styles.subtitle}>
          All FOS cases assigned to you across all regions.
        </Text>
        {agentName && (
          <Text style={styles.agentLine}>
            Agent: <Text style={styles.agentName}>{agentName}</Text>
          </Text>
        )} */}
      </View>

      {loading && !refreshing ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" />
          <Text style={styles.loadingText}>Loading cases…</Text>
        </View>
      ) : error ? (
        <View style={styles.center}>
          <Text style={styles.errorText}>{error}</Text>
          <Text style={styles.linkText} onPress={loadCases}>
            Tap to retry
          </Text>
        </View>
      ) : cases.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.emptyTitle}>No cases yet</Text>
          <Text style={styles.emptySubtitle}>
            When cases are assigned to you, they will appear here.
          </Text>
        </View>
      ) : (
        <FlatList
          data={cases}
          keyExtractor={keyExtractor}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
        />
      )}

      {/* Visit details / Outcome modal */}
      {selectedCase && (
        <Modal visible animationType="slide" transparent>
          <View style={styles.modalBackdrop}>
            <View style={styles.modalContainer}>
              <ScrollView contentContainerStyle={styles.modalScroll}>
                <Text style={styles.modalTitle}>{selectedCase.customer}</Text>
                <Text style={styles.modalSubtitle}>{selectedCase.caseId}</Text>

                <Text style={styles.modalSectionLabel}>
                  Visit Date (YYYY-MM-DD)
                </Text>
                <TouchableOpacity
                  style={styles.input}
                  onPress={() => setShowVisitDatePicker(true)}
                >
                  <Text
                    style={
                      editVisitDate ? styles.inputText : styles.inputPlaceholder
                    }
                  >
                    {editVisitDate || 'Tap to pick date'}
                  </Text>
                </TouchableOpacity>
                {showVisitDatePicker && (
                  <DateTimePicker
                    value={visitDateObj || new Date()}
                    mode="date"
                    display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                    onChange={handleVisitDateChange}
                  />
                )}

                <Text style={styles.modalSectionLabel}>Status</Text>
                <View style={styles.chipRow}>
                  {CASE_STATUS_OPTIONS.map(status => (
                    <TouchableOpacity
                      key={status}
                      style={[
                        styles.chip,
                        editStatus === status && styles.chipSelected,
                      ]}
                      onPress={() => setEditStatus(status)}
                    >
                      <Text
                        style={[
                          styles.chipText,
                          editStatus === status && styles.chipTextSelected,
                        ]}
                      >
                        {status}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <Text style={styles.modalSectionLabel}>Outcome Type</Text>
                <View style={styles.chipRow}>
                  {OUTCOME_TYPE_OPTIONS.map(outcome => (
                    <TouchableOpacity
                      key={outcome}
                      style={[
                        styles.chip,
                        editOutcome === outcome && styles.chipSelected,
                      ]}
                      onPress={() => setEditOutcome(outcome)}
                    >
                      <Text
                        style={[
                          styles.chipText,
                          editOutcome === outcome && styles.chipTextSelected,
                        ]}
                      >
                        {outcome}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                {editOutcome === 'Reschedule' && (
                  <>
                    <Text style={styles.modalSectionLabel}>
                      Reschedule Date (YYYY-MM-DD)
                    </Text>
                    <TouchableOpacity
                      style={styles.input}
                      onPress={() => setShowReschedulePicker(true)}
                    >
                      <Text
                        style={
                          editRescheduleDate
                            ? styles.inputText
                            : styles.inputPlaceholder
                        }
                      >
                        {editRescheduleDate || 'Tap to pick date'}
                      </Text>
                    </TouchableOpacity>
                    {showReschedulePicker && (
                      <DateTimePicker
                        value={rescheduleDateObj || new Date()}
                        mode="date"
                        display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                        onChange={handleRescheduleDateChange}
                      />
                    )}
                  </>
                )}

                <Text style={styles.modalSectionLabel}>Visit Selfie</Text>
                <TouchableOpacity
                  style={styles.secondaryButton}
                  onPress={pickVisitSelfie}
                >
                  <Text style={styles.secondaryButtonText}>
                    {visitSelfieAsset ? 'Retake selfie' : 'Click selfie'}
                  </Text>
                </TouchableOpacity>
                {visitSelfieAsset && (
                  <Text style={styles.helperText}>
                    Selected: {visitSelfieAsset.fileName || 'image'}
                  </Text>
                )}

                {editOutcome === 'KYC' && (
                  <>
                    <Text style={styles.modalSectionLabel}>
                      KYC Document Type
                    </Text>
                    <TextInput
                      style={styles.input}
                      value={kycDocType}
                      onChangeText={setKycDocType}
                      placeholder="e.g. Aadhaar"
                      placeholderTextColor={isDark ? '#6b7280' : '#9ca3af'}
                    />
                    <Text style={styles.modalSectionLabel}>
                      KYC Document Number
                    </Text>
                    <TextInput
                      style={styles.input}
                      value={kycDocNo}
                      onChangeText={setKycDocNo}
                      placeholder="1234 5678 9012"
                      placeholderTextColor={isDark ? '#6b7280' : '#9ca3af'}
                    />

                    <Text style={styles.modalSectionLabel}>
                      KYC Front Image
                    </Text>
                    <TouchableOpacity
                      style={styles.secondaryButton}
                      onPress={pickKycFront}
                    >
                      <Text style={styles.secondaryButtonText}>
                        {kycFrontAsset ? 'Change front image' : 'Attach front'}
                      </Text>
                    </TouchableOpacity>

                    <Text style={styles.modalSectionLabel}>KYC Back Image</Text>
                    <TouchableOpacity
                      style={styles.secondaryButton}
                      onPress={pickKycBack}
                    >
                      <Text style={styles.secondaryButtonText}>
                        {kycBackAsset ? 'Change back image' : 'Attach back'}
                      </Text>
                    </TouchableOpacity>
                  </>
                )}

                <View style={styles.modalButtonsRow}>
                  <TouchableOpacity
                    style={styles.cancelButton}
                    onPress={closeModal}
                    disabled={savingVisit}
                  >
                    <Text style={styles.cancelButtonText}>Cancel</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.primaryButton}
                    onPress={handleSaveVisitDetails}
                    disabled={savingVisit}
                  >
                    <Text style={styles.primaryButtonText}>
                      {savingVisit ? 'Saving…' : 'Save'}
                    </Text>
                  </TouchableOpacity>
                </View>
              </ScrollView>
            </View>
          </View>
        </Modal>
      )}
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
      paddingHorizontal: 20,
      paddingTop: 24,
      paddingBottom: 12,
    },
    title: {
      fontSize: 22,
      fontWeight: '700',
      color: isDark ? '#f9fafb' : '#0f172a',
      marginBottom: 4,
    },
    subtitle: {
      fontSize: 14,
      color: isDark ? '#9ca3af' : '#4b5563',
    },
    agentLine: {
      marginTop: 8,
      fontSize: 13,
      color: isDark ? '#e5e7eb' : '#374151',
    },
    agentName: {
      fontWeight: '600',
      color: BRAND_BLUE,
    },
    center: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 24,
    },
    loadingText: {
      marginTop: 8,
      fontSize: 14,
      color: isDark ? '#e5e7eb' : '#4b5563',
    },
    errorText: {
      textAlign: 'center',
      fontSize: 14,
      color: '#ef4444',
      marginBottom: 8,
    },
    linkText: {
      fontSize: 14,
      color: BRAND_BLUE,
      fontWeight: '600',
    },
    emptyTitle: {
      fontSize: 18,
      fontWeight: '600',
      color: isDark ? '#e5e7eb' : '#111827',
      marginBottom: 4,
      textAlign: 'center',
    },
    emptySubtitle: {
      fontSize: 13,
      color: isDark ? '#9ca3af' : '#4b5563',
      textAlign: 'center',
    },
    listContent: {
      paddingHorizontal: 16,
      paddingBottom: 24,
    },
    card: {
      borderRadius: 16,
      padding: 16,
      marginBottom: 12,
      backgroundColor: isDark ? '#020617' : '#ffffff',
      shadowColor: '#000',
      shadowOpacity: 0.08,
      shadowRadius: 8,
      shadowOffset: { width: 0, height: 2 },
      elevation: 3,
    },
    cardHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      marginBottom: 8,
    },
    cardHeaderRight: {
      alignItems: 'flex-end',
    },
    customerName: {
      fontSize: 15,
      fontWeight: '700',
      color: isDark ? '#f9fafb' : '#111827',
    },
    caseId: {
      marginTop: 2,
      fontSize: 12,
      color: isDark ? '#9ca3af' : '#6b7280',
    },
    metaRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      marginTop: 6,
    },
    metaText: {
      fontSize: 12,
      color: isDark ? '#9ca3af' : '#6b7280',
    },
    addressText: {
      marginTop: 6,
      fontSize: 12,
      color: isDark ? '#e5e7eb' : '#374151',
    },
    footerRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginTop: 10,
    },
    statusChip: {
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 999,
      fontSize: 12,
      fontWeight: '600',
      color: isDark ? '#e5e7eb' : '#1f2937',
      backgroundColor: isDark ? '#111827' : '#e5e7eb',
      overflow: 'hidden',
      marginTop: 4,
    },
    statusChipCompleted: {
      backgroundColor: '#dcfce7',
      color: '#166534',
    },
    statusChipPending: {
      backgroundColor: '#fef3c7',
      color: '#92400e',
    },
    priorityChip: {
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 999,
      fontSize: 11,
      fontWeight: '600',
      alignSelf: 'flex-end',
      marginBottom: 2,
      backgroundColor: isDark ? '#111827' : '#e5e7eb',
      color: isDark ? '#e5e7eb' : '#374151',
    },
    priorityChipHigh: {
      backgroundColor: '#fee2e2',
      color: '#b91c1c',
    },
    priorityChipLow: {
      backgroundColor: '#dcfce7',
      color: '#166534',
    },
    // Modal styles
    modalBackdrop: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.45)',
      justifyContent: 'flex-end',
    },
    modalContainer: {
      maxHeight: '85%',
      backgroundColor: isDark ? '#020617' : '#ffffff',
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
      paddingHorizontal: 20,
      paddingTop: 16,
      paddingBottom: 20,
    },
    modalScroll: {
      paddingBottom: 12,
    },
    modalTitle: {
      fontSize: 18,
      fontWeight: '700',
      color: isDark ? '#f9fafb' : '#111827',
    },
    modalSubtitle: {
      fontSize: 13,
      color: isDark ? '#9ca3af' : '#6b7280',
      marginBottom: 12,
    },
    modalSectionLabel: {
      marginTop: 12,
      marginBottom: 4,
      fontSize: 13,
      fontWeight: '600',
      color: isDark ? '#e5e7eb' : '#374151',
    },
    chipRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
    },
    chip: {
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: isDark ? '#4b5563' : '#d1d5db',
      marginRight: 8,
      marginBottom: 8,
    },
    chipSelected: {
      backgroundColor: BRAND_BLUE,
      borderColor: BRAND_BLUE,
    },
    chipText: {
      fontSize: 12,
      color: isDark ? '#e5e7eb' : '#374151',
    },
    chipTextSelected: {
      color: '#ffffff',
    },
    input: {
      borderWidth: 1,
      borderColor: isDark ? '#374151' : '#d1d5db',
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 8,
      fontSize: 13,
      color: isDark ? '#f9fafb' : '#111827',
      backgroundColor: isDark ? '#020617' : '#ffffff',
    },
    inputText: {
      fontSize: 13,
      color: isDark ? '#f9fafb' : '#111827',
    },
    inputPlaceholder: {
      fontSize: 13,
      color: isDark ? '#6b7280' : '#9ca3af',
    },
    secondaryButton: {
      marginTop: 4,
      borderRadius: 999,
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderWidth: 1,
      borderColor: isDark ? '#4b5563' : '#d1d5db',
      alignSelf: 'flex-start',
    },
    secondaryButtonText: {
      fontSize: 13,
      color: isDark ? '#e5e7eb' : '#374151',
    },
    helperText: {
      marginTop: 4,
      fontSize: 11,
      color: isDark ? '#9ca3af' : '#6b7280',
    },
    modalButtonsRow: {
      flexDirection: 'row',
      justifyContent: 'flex-end',
      marginTop: 20,
    },
    cancelButton: {
      paddingHorizontal: 16,
      paddingVertical: 10,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: isDark ? '#4b5563' : '#d1d5db',
      marginRight: 12,
    },
    cancelButtonText: {
      fontSize: 13,
      color: isDark ? '#e5e7eb' : '#374151',
    },
    primaryButton: {
      paddingHorizontal: 18,
      paddingVertical: 10,
      borderRadius: 999,
      backgroundColor: BRAND_BLUE,
    },
    primaryButtonText: {
      fontSize: 13,
      fontWeight: '600',
      color: '#ffffff',
    },
  });

export default MyListScreen;
