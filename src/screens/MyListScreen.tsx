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
  fetchCasesForAgent,
  updateCaseStatus,
  updateCaseOutcome,
  uploadCaseSelfie,
  createKycDocumentWithImages,
} from '../services/myCasesService';
import {
  Asset,
  CameraOptions,
  launchCamera,
} from 'react-native-image-picker';

const BRAND_BLUE = '#397E8A';

// ─────────────────────────────────────────────
// Static options
// ─────────────────────────────────────────────

const CASE_STATUS_OPTIONS = [
  'Open',
  'Visit Planned',
  'Pending',
  'Closed',
] as const;

const OUTCOME_TYPE_OPTIONS = [
  'Completed',
  'Reschedule',
  'No Response',
  'Customer Not on Location',
] as const;

type DateFilterKey =
  | 'ALL'
  | 'TODAY'
  | 'YESTERDAY'
  | 'LAST_WEEK'
  | 'THIS_MONTH'
  | 'LAST_MONTH';

const DATE_FILTER_OPTIONS: { key: DateFilterKey; label: string }[] = [
  { key: 'ALL', label: 'All' },
  { key: 'TODAY', label: 'Today' },
  { key: 'YESTERDAY', label: 'Yesterday' },
  { key: 'LAST_WEEK', label: 'Last week' },
  { key: 'THIS_MONTH', label: 'This month' },
  { key: 'LAST_MONTH', label: 'Last month' },
];

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
      message: 'We need access to your camera.',
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

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/**
 * Reads Type of Visit from whatever field backend sends:
 * - typeOfVisit (old)
 * - productType  (camel)
 * - product_type (ERPNext)
 */
function resolveCaseType(c: AgentCase | null): string {
  if (!c) return '';
  const asAny = c as any;
  const raw =
    asAny.typeOfVisit ||
    asAny.productType ||
    asAny.product_type ||
    '';
  return typeof raw === 'string' ? raw : '';
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

  // Filter state
  const [activeFilter, setActiveFilter] =
    React.useState<DateFilterKey>('ALL');

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
  const [rescheduleDateObj, setRescheduleDateObj] =
    React.useState<Date | null>(null);
  const [showReschedulePicker, setShowReschedulePicker] =
    React.useState<boolean>(false);

  const [visitSelfieAsset, setVisitSelfieAsset] =
    React.useState<Asset | null>(null);
  const [kycDocType, setKycDocType] = React.useState<string>('');
  const [kycDocNo, setKycDocNo] = React.useState<string>('');
  const [kycFrontAsset, setKycFrontAsset] =
    React.useState<Asset | null>(null);
  const [kycBackAsset, setKycBackAsset] =
    React.useState<Asset | null>(null);
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

  const pickImageWithCamera = async (
    cameraType: 'front' | 'back',
    onPicked: (asset: Asset) => void,
  ) => {
    const hasPermission = await requestCameraPermission();
    if (!hasPermission) {
      Alert.alert(
        'Permission required',
        'Camera permission is needed to capture image.',
      );
      return;
    }

    const options: CameraOptions = {
      mediaType: 'photo',
      cameraType,
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
        onPicked(asset);
      }
    });
  };

  const pickVisitSelfie = React.useCallback(async () => {
    await pickImageWithCamera('front', asset => setVisitSelfieAsset(asset));
  }, []);

  const pickKycFront = React.useCallback(async () => {
    await pickImageWithCamera('back', asset => setKycFrontAsset(asset));
  }, []);

  const pickKycBack = React.useCallback(async () => {
    await pickImageWithCamera('back', asset => setKycBackAsset(asset));
  }, []);

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

    const caseType = resolveCaseType(selectedCase);
    const normCaseType = caseType ? caseType.trim().toUpperCase() : '';
    const isKycVisit = normCaseType === 'KYC';

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

      // 3) Visit selfie
      if (visitSelfieAsset) {
        await uploadCaseSelfie(selectedCase.id, visitSelfieAsset);
      }

      // 4) KYC row (only for Type of Visit = KYC)
      if (
        isKycVisit &&
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

  const filteredCases = React.useMemo(() => {
    if (activeFilter === 'ALL') return cases;

    const today = startOfDay(new Date());
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    const lastWeekStart = new Date(today);
    lastWeekStart.setDate(lastWeekStart.getDate() - 7);

    const thisMonthStart = new Date(today.getFullYear(), today.getMonth(), 1);
    const lastMonthStart = new Date(
      today.getFullYear(),
      today.getMonth() - 1,
      1,
    );
    const lastMonthEnd = new Date(
      today.getFullYear(),
      today.getMonth(),
      0,
    );

    return cases.filter(item => {
      const visitStr = (item.visitDate as string) || '';
      const parsed = parseYYYYMMDD(visitStr);
      if (!parsed) {
        // If no date is set, only show in "All"
        return false;
      }
      const date = startOfDay(parsed);

      switch (activeFilter) {
        case 'TODAY':
          return date.getTime() === today.getTime();
        case 'YESTERDAY':
          return date.getTime() === yesterday.getTime();
        case 'LAST_WEEK':
          return date < today && date >= lastWeekStart;
        case 'THIS_MONTH':
          return date >= thisMonthStart && date <= today;
        case 'LAST_MONTH':
          return date >= lastMonthStart && date <= lastMonthEnd;
        default:
          return true;
      }
    });
  }, [cases, activeFilter]);

  const renderItem = ({ item }: { item: AgentCase }) => {
    const priorityLower =
      typeof item.priority === 'string' ? item.priority.toLowerCase() : '';
    const typeOfVisit = resolveCaseType(item);

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
            {typeOfVisit ? (
              <Text style={styles.typeOfVisitText}>
                Type of Visit: {typeOfVisit}
              </Text>
            ) : null}
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
          <Text style={styles.metaText}>
            Overdue: ₹ {item.overdueAmount}
          </Text>
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
            <Text style={styles.metaText}>
              Outcome: {item.outcomeType}
            </Text>
          ) : null}
        </View>
      </TouchableOpacity>
    );
  };

  const keyExtractor = (item: AgentCase) => item.id;

  const caseTypeForModal = resolveCaseType(selectedCase);
  const isKycVisitForModal =
    (caseTypeForModal || '').trim().toUpperCase() === 'KYC';

  const hasAnyCases = cases.length > 0;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>My List</Text>
      </View>

      {/* Day-wise filter chips */}
      <View style={styles.filterWrapper}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterScroll}
        >
          {DATE_FILTER_OPTIONS.map(opt => (
            <TouchableOpacity
              key={opt.key}
              style={[
                styles.filterChip,
                activeFilter === opt.key && styles.filterChipActive,
              ]}
              onPress={() => setActiveFilter(opt.key)}
            >
              <Text
                style={[
                  styles.filterChipText,
                  activeFilter === opt.key && styles.filterChipTextActive,
                ]}
              >
                {opt.label}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
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
      ) : !hasAnyCases ? (
        <View style={styles.center}>
          <Text style={styles.emptyTitle}>No cases yet</Text>
          <Text style={styles.emptySubtitle}>
            When cases are assigned to you, they will appear here.
          </Text>
        </View>
      ) : filteredCases.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.emptyTitle}>No cases in this filter</Text>
          <Text style={styles.emptySubtitle}>
            Try changing the day-wise filter above.
          </Text>
        </View>
      ) : (
        <FlatList
          data={filteredCases}
          keyExtractor={keyExtractor}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
        />
      )}

      {/* Full-screen Visit details / Outcome modal */}
      {selectedCase && (
        <Modal visible animationType="slide">
          <View style={styles.fullscreenModal}>
            <View style={styles.modalTopBar}>
              <Text style={styles.modalTopBarTitle}>Visit Details</Text>
              <TouchableOpacity
                onPress={closeModal}
                disabled={savingVisit}
              >
                <Text style={styles.modalCloseText}>Close</Text>
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={styles.modalScroll}>
              <Text style={styles.modalTitle}>{selectedCase.customer}</Text>
              <Text style={styles.modalSubtitle}>
                {selectedCase.caseId}
              </Text>

              {caseTypeForModal ? (
                <Text style={styles.modalTypeOfVisit}>
                  Type of Visit: {caseTypeForModal}
                </Text>
              ) : null}

              <Text style={styles.modalSectionLabel}>
                Visit Date (YYYY-MM-DD)
              </Text>
              <TouchableOpacity
                style={styles.input}
                onPress={() => setShowVisitDatePicker(true)}
              >
                <Text
                  style={
                    editVisitDate
                      ? styles.inputText
                      : styles.inputPlaceholder
                  }
                >
                  {editVisitDate || 'Tap to pick date'}
                </Text>
              </TouchableOpacity>
              {showVisitDatePicker && (
                <DateTimePicker
                  value={visitDateObj || new Date()}
                  mode="date"
                  display={
                    Platform.OS === 'ios' ? 'spinner' : 'default'
                  }
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
                        editStatus === status &&
                          styles.chipTextSelected,
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
                        editOutcome === outcome &&
                          styles.chipTextSelected,
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
                      display={
                        Platform.OS === 'ios' ? 'spinner' : 'default'
                      }
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

              {isKycVisitForModal && (
                <>
                  <Text style={styles.modalSectionLabel}>
                    KYC Document Type
                  </Text>
                  <TextInput
                    style={styles.input}
                    value={kycDocType}
                    onChangeText={setKycDocType}
                    placeholder="e.g. Aadhaar"
                    placeholderTextColor={
                      isDark ? '#6b7280' : '#9ca3af'
                    }
                  />
                  <Text style={styles.modalSectionLabel}>
                    KYC Document Number
                  </Text>
                  <TextInput
                    style={styles.input}
                    value={kycDocNo}
                    onChangeText={setKycDocNo}
                    placeholder="1234 5678 9012"
                    placeholderTextColor={
                      isDark ? '#6b7280' : '#9ca3af'
                    }
                  />

                  <Text style={styles.modalSectionLabel}>
                    KYC Front Image
                  </Text>
                  <TouchableOpacity
                    style={styles.secondaryButton}
                    onPress={pickKycFront}
                  >
                    <Text style={styles.secondaryButtonText}>
                      {kycFrontAsset
                        ? 'Retake front image'
                        : 'Capture front'}
                    </Text>
                  </TouchableOpacity>

                  <Text style={styles.modalSectionLabel}>
                    KYC Back Image
                  </Text>
                  <TouchableOpacity
                    style={styles.secondaryButton}
                    onPress={pickKycBack}
                  >
                    <Text style={styles.secondaryButtonText}>
                      {kycBackAsset
                        ? 'Retake back image'
                        : 'Capture back'}
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
      paddingBottom: 8,
    },
    title: {
      fontSize: 22,
      fontWeight: '700',
      color: isDark ? '#f9fafb' : '#0f172a',
      marginBottom: 4,
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
    typeOfVisitText: {
      marginTop: 4,
      fontSize: 12,
      color: isDark ? '#e5e7eb' : '#374151',
      fontWeight: '500',
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

    // Filter styles
    filterWrapper: {
      paddingHorizontal: 12,
      paddingBottom: 8,
    },
    filterScroll: {
      paddingVertical: 4,
    },
    filterChip: {
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: isDark ? '#4b5563' : '#d1d5db',
      marginRight: 8,
      backgroundColor: isDark ? '#020617' : '#f9fafb',
    },
    filterChipActive: {
      backgroundColor: BRAND_BLUE,
      borderColor: BRAND_BLUE,
    },
    filterChipText: {
      fontSize: 12,
      color: isDark ? '#e5e7eb' : '#374151',
    },
    filterChipTextActive: {
      color: '#ffffff',
      fontWeight: '600',
    },

    // Full-screen modal styles
    fullscreenModal: {
      flex: 1,
      backgroundColor: isDark ? '#020617' : '#ffffff',
      paddingTop: Platform.OS === 'android' ? 32 : 48,
      paddingHorizontal: 20,
      paddingBottom: 16,
    },
    modalTopBar: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 8,
    },
    modalTopBarTitle: {
      fontSize: 16,
      fontWeight: '600',
      color: isDark ? '#e5e7eb' : '#111827',
    },
    modalCloseText: {
      fontSize: 13,
      color: BRAND_BLUE,
      fontWeight: '600',
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
      marginBottom: 8,
    },
    modalTypeOfVisit: {
      fontSize: 13,
      color: isDark ? '#e5e7eb' : '#374151',
      marginBottom: 8,
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
