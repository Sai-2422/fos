// src/screens/CollectionScreen.tsx

import React, { useState, useEffect } from 'react';
import {
  Alert,
  Image,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import Feather from 'react-native-vector-icons/Feather';
import {
  Asset,
  ImageLibraryOptions,
  launchImageLibrary,
} from 'react-native-image-picker';
import DateTimePicker, {
  DateTimePickerEvent,
} from '@react-native-community/datetimepicker';

import {
  createCollectionOnErp,
  fetchCollectionsForLoggedInUser,
  fetchLoggedInUserEmail,
  deleteCollection,
  FOSCollectionResponse,
  ModeType,
} from '../services/collectionService';

// 👇 Day Plan service
import {
  fetchTodayDayPlanForAgent,
  DayPlanItem,
} from '../services/dayPlanService';

// 🔹 Brand colors
const PRIMARY = '#152e47';
const ACCENT = '#397e8a';

type FOSCollectionForm = {
  fos_agent: string;
  customer: string;
  collection_datetime: string;
  amount: string;
  mode: ModeType;
  upi_txn_id: string;
  pg_ref_no: string;
  cheque_no: string;
  bank_name: string;
  is_deposited: boolean;
  receipt_image_uri: string | null;
  receipt_image_asset: Asset | null;
};

const MODE_OPTIONS: ModeType[] = ['UPI', 'Cash', 'Cheque', 'NEFT'];
type CollectionFilter = 'ALL' | 'TODAY' | 'PENDING';

// 👇 props type so we can receive fullName from App.tsx
type CollectionScreenProps = {
  fullName?: string; // logged-in agent name passed from HomeStackNavigator
} & any;

// ─────────────────────────────────────────────
// Day Plan helpers (NO hooks here)
// ─────────────────────────────────────────────
type CustomerGroup = {
  customer: string;
  items: DayPlanItem[];
};

const groupDayPlanItemsByCustomer = (items: DayPlanItem[]): CustomerGroup[] => {
  const map: Record<string, DayPlanItem[]> = {};

  items.forEach(item => {
    if (!map[item.customer]) {
      map[item.customer] = [];
    }
    map[item.customer].push(item);
  });

  return Object.entries(map).map(([customer, groupItems]) => ({
    customer,
    items: groupItems,
  }));
};

// ─────────────────────────────────────────────
// Date helpers (NO hooks here)
// ─────────────────────────────────────────────
const pad2 = (n: number) => (n < 10 ? `0${n}` : `${n}`);

const formatDateToErp = (d: Date) =>
  `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ` +
  `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;

// 👇 for display in UI as DD/MM/YYYY (compatible with old parser)
const formatDateForDisplay = (d: Date) =>
  `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()}`;

const parseUserInputToErpDatetime = (input: string): string => {
  const value = input.trim();

  if (!value) {
    // default = now
    return formatDateToErp(new Date());
  }

  const ddmmyyyy = /^(\d{2})\/(\d{2})\/(\d{4})$/;
  const yyyymmdd = /^(\d{4})-(\d{2})-(\d{2})$/;

  let date: Date | null = null;
  let match: RegExpMatchArray | null;

  if ((match = value.match(ddmmyyyy))) {
    const [, dd, mm, yyyy] = match;
    date = new Date(Number(yyyy), Number(mm) - 1, Number(dd));
  } else if ((match = value.match(yyyymmdd))) {
    const [, yyyy, mm, dd] = match;
    date = new Date(Number(yyyy), Number(mm) - 1, Number(dd));
  } else {
    const parsed = new Date(value);
    if (!isNaN(parsed.getTime())) {
      date = parsed;
    }
  }

  if (!date || isNaN(date.getTime())) {
    throw new Error(
      'Invalid date format. Please use DD/MM/YYYY or YYYY-MM-DD.',
    );
  }

  return formatDateToErp(date);
};

const parseErpOrIsoDate = (value?: string | null): Date | null => {
  if (!value) return null;
  const d = new Date(value);
  if (isNaN(d.getTime())) return null;
  return d;
};

const isSameCalendarDate = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() &&
  a.getMonth() === b.getMonth() &&
  a.getDate() === b.getDate();

// ─────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────

const CollectionScreen: React.FC<CollectionScreenProps> = ({ fullName }) => {
  // 🔹 ALL hooks are here at the top, no conditions
  const { width } = useWindowDimensions();
  const isSmall = width < 380;

  const todayDate = new Date();

  const [formData, setFormData] = useState<FOSCollectionForm>({
    fos_agent: fullName || '',
    customer: '',
    collection_datetime: formatDateForDisplay(todayDate), // ✅ default = today
    amount: '',
    mode: 'UPI',
    upi_txn_id: '',
    pg_ref_no: '',
    cheque_no: '',
    bank_name: '',
    is_deposited: false,
    receipt_image_uri: null,
    receipt_image_asset: null,
  });

  const [collections, setCollections] = useState<FOSCollectionResponse[]>([]);
  const [isAdding, setIsAdding] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // this is the ERP user email (login id)
  const [loggedInUser, setLoggedInUser] = useState<string>('');

  // ✅ default filter = TODAY
  const [collectionFilter, setCollectionFilter] =
    useState<CollectionFilter>('TODAY');

  // 👇 NEW: date picker state
  const [collectionDate, setCollectionDate] = useState<Date>(todayDate);
  const [showDatePicker, setShowDatePicker] = useState(false);

  // 👇 NEW: day plan + selection state
  const [dayPlanItems, setDayPlanItems] = useState<DayPlanItem[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<string | null>(null);
  const [selectedCase, setSelectedCase] = useState<DayPlanItem | null>(null);
  const [isCustomerDropdownOpen, setIsCustomerDropdownOpen] = useState(false);
  const [isCaseDropdownOpen, setIsCaseDropdownOpen] = useState(false);

  useEffect(() => {
    initializeScreen();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Group items by customer (pure function)
  const customersFromPlan: CustomerGroup[] =
    groupDayPlanItemsByCustomer(dayPlanItems);

  // ─────────────────────────────────────────────

  const initializeScreen = async () => {
    try {
      const userEmail = await fetchLoggedInUserEmail();
      setLoggedInUser(userEmail);

      const agentName = fullName || userEmail || '';

      setFormData(prev => ({
        ...prev,
        fos_agent: prev.fos_agent || agentName,
      }));

      if (agentName) {
        try {
          const plan = await fetchTodayDayPlanForAgent(agentName);
          setDayPlanItems(plan?.day_plan_items ?? []);
        } catch (err) {
          console.error('Error loading day plan:', err);
          setDayPlanItems([]);
        }
      } else {
        setDayPlanItems([]);
      }

      await loadCollections();
    } catch (error) {
      console.error('Error initializing screen:', error);
      Alert.alert(
        'Error',
        'Failed to load user information. Please try again.',
      );
    }
  };

  const loadCollections = async () => {
    setIsLoading(true);
    try {
      const data = await fetchCollectionsForLoggedInUser();
      setCollections(data);
    } catch (error) {
      console.error('Error loading collections:', error);
      Alert.alert('Error', 'Failed to load collections. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const onRefresh = async () => {
    setIsRefreshing(true);
    await loadCollections();
    setIsRefreshing(false);
  };

  const handleChange = <K extends keyof FOSCollectionForm>(
    key: K,
    value: FOSCollectionForm[K],
  ) => {
    setFormData(prev => ({ ...prev, [key]: value }));
  };

  const clearForm = () => {
    const newToday = new Date();
    setCollectionDate(newToday);
    setFormData({
      fos_agent: fullName || loggedInUser || '',
      customer: '',
      collection_datetime: formatDateForDisplay(newToday), // ✅ reset to today
      amount: '',
      mode: 'UPI',
      upi_txn_id: '',
      pg_ref_no: '',
      cheque_no: '',
      bank_name: '',
      is_deposited: false,
      receipt_image_uri: null,
      receipt_image_asset: null,
    });
    setSelectedCustomer(null);
    setSelectedCase(null);
    setIsCustomerDropdownOpen(false);
    setIsCaseDropdownOpen(false);
  };

  const handleSave = async () => {
    const fosAgent = formData.fos_agent.trim();
    const customer = formData.customer.trim();
    const amountStr = formData.amount.trim();

    if (!fosAgent || !customer || !amountStr) {
      Alert.alert(
        'Missing Fields',
        'Please fill FOS Agent, Customer and Amount.',
      );
      return;
    }

    const amountNumber = parseFloat(amountStr);
    if (isNaN(amountNumber) || amountNumber <= 0) {
      Alert.alert(
        'Invalid Amount',
        'Please enter a valid amount greater than 0.',
      );
      return;
    }

    if (formData.mode === 'UPI' && !formData.upi_txn_id.trim()) {
      Alert.alert(
        'Missing UPI Txn ID',
        'Please enter UPI transaction ID for UPI mode.',
      );
      return;
    }

    if (formData.mode === 'Cheque' && !formData.cheque_no.trim()) {
      Alert.alert(
        'Missing Cheque No',
        'Please enter Cheque No for Cheque mode.',
      );
      return;
    }

    let erpDatetime: string;
    try {
      // still using parser so it remains compatible with ERP format logic
      erpDatetime = parseUserInputToErpDatetime(formData.collection_datetime);
    } catch (err: any) {
      console.error('Date parse error:', err);
      Alert.alert('Invalid Date', err?.message || 'Please check the date.');
      return;
    }

    setIsSaving(true);

    try {
      const result = await createCollectionOnErp({
        fos_agent: fosAgent,
        customer,
        amount: amountNumber,
        mode: formData.mode,
        upi_txn_id: formData.upi_txn_id.trim(),
        pg_ref_no: formData.pg_ref_no.trim(),
        cheque_no: formData.cheque_no.trim(),
        bank_name: formData.bank_name.trim(),
        collection_datetime: erpDatetime,
        is_deposited: 0,
        receipt_image: formData.receipt_image_asset,
      });

      Alert.alert(
        'Success',
        `Collection ${result.collectionName} created successfully!`,
      );

      await loadCollections();
      clearForm();
      setIsAdding(false);
    } catch (error: any) {
      console.error('❌ Error saving collection:', error);

      let errorMessage = 'Failed to save collection. Please try again.';

      if (error.message?.includes('Invalid date format')) {
        errorMessage = error.message;
      } else if (error.message?.includes('401')) {
        errorMessage = 'Authentication failed. Please login again.';
      } else if (error.message?.includes('403')) {
        errorMessage = "You don't have permission to create collections.";
      } else if (error.message?.includes('500')) {
        errorMessage = 'Server error. Please contact administrator.';
      } else if (error.message) {
        errorMessage = error.message;
      }

      Alert.alert('Error', errorMessage);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = (name: string) => {
    Alert.alert(
      'Delete Collection',
      'Are you sure you want to delete this collection record?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteCollection(name);
              Alert.alert('Success', 'Collection deleted successfully');
              await loadCollections();
            } catch (error: any) {
              console.error('Error deleting collection:', error);
              Alert.alert(
                'Error',
                error?.message || 'Failed to delete collection',
              );
            }
          },
        },
      ],
    );
  };

  const handlePickReceipt = async () => {
    const options: ImageLibraryOptions = {
      mediaType: 'photo',
      selectionLimit: 1,
    };
    const result = await launchImageLibrary(options);
    if (result.didCancel) return;

    const asset: Asset | undefined = result.assets && result.assets[0];
    if (asset?.uri) {
      handleChange('receipt_image_uri', asset.uri);
      handleChange('receipt_image_asset', asset);
    }
  };

  // 👇 NEW: Date picker change handler
  const handleDateChange = (
    event: DateTimePickerEvent,
    selectedDate?: Date,
  ) => {
    if (event.type === 'dismissed') {
      setShowDatePicker(false);
      return;
    }
    const currentDate = selectedDate || collectionDate;
    setShowDatePicker(false);
    setCollectionDate(currentDate);
    const display = formatDateForDisplay(currentDate);
    handleChange('collection_datetime', display);
  };

  // 👇 NEW: selection handlers for dropdowns
  const handleSelectCustomerFromPlan = (customer: string) => {
    setSelectedCustomer(customer);
    setIsCustomerDropdownOpen(false);
    handleChange('customer', customer);

    const group = customersFromPlan.find(g => g.customer === customer);
    if (group && group.items.length === 1) {
      setSelectedCase(group.items[0]);
      setIsCaseDropdownOpen(false);
    } else {
      setSelectedCase(null);
    }
  };

  const handleSelectCase = (item: DayPlanItem) => {
    setSelectedCase(item);
    setIsCaseDropdownOpen(false);
    // if later you add "case" field to FOS Collection,
    // set it here in formData.
  };

  // ─────────────────────────────────────────────
  // Derived stats + filtered list
  // ─────────────────────────────────────────────
  const today = new Date();

  const todayTotal = collections.reduce((sum, c) => {
    const d =
      parseErpOrIsoDate((c as any).collection_datetime) ||
      parseErpOrIsoDate(c.creation);
    if (d && isSameCalendarDate(d, today)) {
      return sum + (Number(c.amount) || 0);
    }
    return sum;
  }, 0);

  const pendingTotal = collections.reduce(
    (sum, c) => (c.is_deposited === 1 ? sum : sum + (Number(c.amount) || 0)),
    0,
  );

  const filteredCollections = collections.filter(c => {
    if (collectionFilter === 'ALL') return true;

    if (collectionFilter === 'PENDING') {
      return c.is_deposited !== 1;
    }

    const d =
      parseErpOrIsoDate((c as any).collection_datetime) ||
      parseErpOrIsoDate(c.creation);
    if (!d) return false;
    return isSameCalendarDate(d, today);
  });

  // ─────────────────────────────────────────────

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.screenContent}
      refreshControl={
        <RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} />
      }
    >
      {/* Top header */}
      {/* <View style={styles.topHeader}>
        <Text style={styles.topHeaderBack}>{'←  Collection'}</Text>
        {(fullName || loggedInUser) && (
          <Text style={styles.userBadge}>
            <Feather name="user" size={12} color={ACCENT} />{' '}
            {fullName || loggedInUser}
          </Text>
        )}
      </View> */}

      {/* Summary card */}
      <View style={styles.summaryRow}>
        <View style={styles.summaryCard}>
          <View style={styles.summaryTop}>
            <View style={styles.summaryIconBox}>
              <Feather name="file-text" size={22} color={PRIMARY} />
            </View>
            <Text style={styles.summaryCount}>{collections.length}</Text>
          </View>

          <Text style={styles.summaryTitle}>FOS Collection</Text>
          <Text style={styles.summarySubtitle}>
            Create and manage collection records
          </Text>

          <View style={styles.summaryStatsRow}>
            <View style={styles.summaryStatCard}>
              <Text style={styles.summaryStatLabel}>Today Collected</Text>
              <Text style={styles.summaryStatValue}>
                ₹{todayTotal.toFixed(2)}
              </Text>
            </View>
            <View style={styles.summaryStatCard}>
              <Text style={styles.summaryStatLabel}>Pending Amount</Text>
              <Text style={styles.summaryStatValue}>
                ₹{pendingTotal.toFixed(2)}
              </Text>
            </View>
          </View>

          <TouchableOpacity
            style={styles.summaryButton}
            onPress={() => {
              setIsAdding(true);
              if (!formData.fos_agent && (fullName || loggedInUser)) {
                handleChange('fos_agent', (fullName || loggedInUser) as string);
              }
            }}
            activeOpacity={0.85}
            disabled={isAdding}
          >
            <Text style={styles.summaryButtonText}>Add Collection</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Form card */}
      {isAdding && (
        <>
          <View style={{ height: 16 }} />

          <View style={styles.card}>
            <View style={styles.headerRow}>
              <View>
                <Text style={styles.title}>New FOS Collection</Text>
                <Text style={styles.notSaved}>Not Saved</Text>
              </View>

              <View style={styles.headerButtons}>
                <TouchableOpacity
                  style={styles.secondaryBtn}
                  onPress={() => {
                    clearForm();
                    setIsAdding(false);
                  }}
                  disabled={isSaving}
                >
                  <Text style={styles.secondaryBtnText}>Cancel</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.primaryBtn,
                    isSaving && styles.primaryBtnDisabled,
                  ]}
                  onPress={handleSave}
                  disabled={isSaving}
                >
                  {isSaving ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Text style={styles.primaryBtnText}>Save</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.formGrid}>
              <FormField
                label="FOS AGENT *"
                placeholder="Enter agent name"
                value={formData.fos_agent}
                onChangeText={t => handleChange('fos_agent', t)}
                isSmall={isSmall}
              />

              {/* Customer & Case dropdowns from today's Day Plan */}
              {customersFromPlan.length > 0 && (
                <View style={styles.fieldWrapperFull}>
                  <Text style={styles.label}>
                    CUSTOMER (FROM TODAY&apos;S DAY PLAN)
                  </Text>

                  <TouchableOpacity
                    style={styles.dropdown}
                    onPress={() => setIsCustomerDropdownOpen(prev => !prev)}
                  >
                    <Text style={styles.dropdownValue}>
                      {selectedCustomer || 'Select customer'}
                    </Text>
                    <Feather
                      name={
                        isCustomerDropdownOpen ? 'chevron-up' : 'chevron-down'
                      }
                      size={16}
                      color="#6b7280"
                    />
                  </TouchableOpacity>

                  {isCustomerDropdownOpen && (
                    <View style={styles.dropdownList}>
                      {customersFromPlan.map(group => (
                        <TouchableOpacity
                          key={group.customer}
                          style={styles.dropdownItem}
                          onPress={() =>
                            handleSelectCustomerFromPlan(group.customer)
                          }
                        >
                          <Text style={styles.dropdownItemText}>
                            {group.customer}
                          </Text>
                          {group.items.length > 1 && (
                            <Text style={styles.dropdownItemBadge}>
                              {group.items.length} cases
                            </Text>
                          )}
                        </TouchableOpacity>
                      ))}
                    </View>
                  )}

                  {selectedCustomer && (
                    <>
                      <Text style={[styles.label, { marginTop: 12 }]}>
                        CASE
                      </Text>

                      <TouchableOpacity
                        style={styles.dropdown}
                        onPress={() => setIsCaseDropdownOpen(prev => !prev)}
                      >
                        <Text style={styles.dropdownValue}>
                          {selectedCase?.case || 'Select case'}
                        </Text>
                        <Feather
                          name={
                            isCaseDropdownOpen ? 'chevron-up' : 'chevron-down'
                          }
                          size={16}
                          color="#6b7280"
                        />
                      </TouchableOpacity>

                      {isCaseDropdownOpen && (
                        <View style={styles.dropdownList}>
                          {customersFromPlan
                            .find(g => g.customer === selectedCustomer)
                            ?.items.map(item => (
                              <TouchableOpacity
                                key={item.name}
                                style={styles.dropdownItem}
                                onPress={() => handleSelectCase(item)}
                              >
                                <Text style={styles.dropdownItemText}>
                                  {item.case}
                                </Text>
                              </TouchableOpacity>
                            ))}
                        </View>
                      )}
                    </>
                  )}

                  {selectedCustomer && (
                    <View style={styles.selectionTagsRow}>
                      <View style={styles.selectionTag}>
                        <Text style={styles.selectionTagLabel}>Customer</Text>
                        <Text style={styles.selectionTagValue}>
                          {selectedCustomer}
                        </Text>
                      </View>

                      {selectedCase && (
                        <View style={styles.selectionTag}>
                          <Text style={styles.selectionTagLabel}>Case</Text>
                          <Text style={styles.selectionTagValue}>
                            {selectedCase.case}
                          </Text>
                        </View>
                      )}
                    </View>
                  )}
                </View>
              )}

              {/* ✅ Date picker instead of free text */}
              <View
                style={[
                  styles.fieldWrapper,
                  isSmall && styles.fieldWrapperFull,
                ]}
              >
                <Text style={styles.label}>COLLECTION DATE</Text>
                <TouchableOpacity
                  style={styles.input}
                  activeOpacity={0.8}
                  onPress={() => setShowDatePicker(true)}
                >
                  <Text
                    style={{
                      fontSize: 13,
                      color: '#0f172a',
                    }}
                  >
                    {formData.collection_datetime || 'Select date'}
                  </Text>
                </TouchableOpacity>

                {showDatePicker && (
                  <DateTimePicker
                    value={collectionDate}
                    mode="date"
                    display="default"
                    onChange={handleDateChange}
                  />
                )}
              </View>

              <FormField
                label="BANK NAME"
                placeholder="Enter bank name"
                value={formData.bank_name}
                onChangeText={t => handleChange('bank_name', t)}
                isSmall={isSmall}
              />

              <FormField
                label="AMOUNT *"
                placeholder="Enter amount"
                value={formData.amount}
                onChangeText={t => handleChange('amount', t)}
                keyboardType="numeric"
                isSmall={isSmall}
              />

              <View
                style={[
                  styles.fieldWrapper,
                  isSmall && styles.fieldWrapperFull,
                  styles.rowAlignCenter,
                ]}
              >
                <Text style={styles.label}>IS DEPOSITED</Text>
                <Switch
                  style={{ marginLeft: 8 }}
                  value={formData.is_deposited}
                  onValueChange={v => handleChange('is_deposited', v)}
                  trackColor={{ false: '#d1d5db', true: ACCENT }}
                  thumbColor="#ffffff"
                />
              </View>

              <View style={styles.fieldWrapperFull}>
                <Text style={styles.label}>MODE</Text>
                <View style={styles.modeRow}>
                  {MODE_OPTIONS.map(m => {
                    const active = m === formData.mode;
                    return (
                      <TouchableOpacity
                        key={m}
                        onPress={() => handleChange('mode', m)}
                        style={[
                          styles.modeChip,
                          active && styles.modeChipActive,
                        ]}
                      >
                        <Text
                          style={[
                            styles.modeChipText,
                            active && styles.modeChipTextActive,
                          ]}
                        >
                          {m}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>

              {formData.mode === 'UPI' && (
                <FormField
                  label="UPI TXN ID"
                  placeholder="Enter UPI transaction ID"
                  value={formData.upi_txn_id}
                  onChangeText={t => handleChange('upi_txn_id', t)}
                  isSmall={isSmall}
                />
              )}

              {(formData.mode === 'UPI' || formData.mode === 'NEFT') && (
                <FormField
                  label="PG REF NO"
                  placeholder="Enter PG reference number"
                  value={formData.pg_ref_no}
                  onChangeText={t => handleChange('pg_ref_no', t)}
                  isSmall={isSmall}
                />
              )}

              {formData.mode === 'Cheque' && (
                <FormField
                  label="CHEQUE NO"
                  placeholder="Enter cheque number"
                  value={formData.cheque_no}
                  onChangeText={t => handleChange('cheque_no', t)}
                  isSmall={isSmall}
                />
              )}

              <View style={styles.fieldWrapperFull}>
                <Text style={styles.label}>RECEIPT IMAGE</Text>
                <TouchableOpacity
                  style={styles.attachButton}
                  onPress={handlePickReceipt}
                >
                  <Feather name="camera" size={16} color={ACCENT} />
                  <Text style={styles.attachText}>
                    {formData.receipt_image_uri
                      ? 'Change receipt photo'
                      : 'Attach receipt photo'}
                  </Text>
                </TouchableOpacity>

                {formData.receipt_image_uri && (
                  <Image
                    source={{ uri: formData.receipt_image_uri }}
                    style={styles.receiptPreview}
                  />
                )}
              </View>
            </View>
          </View>
        </>
      )}

      <View style={{ height: 16 }} />

      {/* Saved collections card */}
      <View style={styles.card}>
        <View style={styles.savedHeader}>
          <View style={styles.savedHeaderLeft}>
            <Text style={styles.savedTitle}>My Collections</Text>
            <Text style={styles.recordsPill}>{collections.length} Records</Text>
          </View>

          <View style={styles.filterChipRow}>
            {(['ALL', 'TODAY', 'PENDING'] as CollectionFilter[]).map(opt => {
              const active = collectionFilter === opt;
              const label =
                opt === 'ALL' ? 'All' : opt === 'TODAY' ? 'Today' : 'Pending';
              return (
                <TouchableOpacity
                  key={opt}
                  onPress={() => setCollectionFilter(opt)}
                  style={[styles.filterChip, active && styles.filterChipActive]}
                >
                  <Text
                    style={[
                      styles.filterChipText,
                      active && styles.filterChipTextActive,
                    ]}
                  >
                    {label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {isLoading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={ACCENT} />
            <Text style={styles.loadingText}>Loading collections...</Text>
          </View>
        ) : filteredCollections.length === 0 ? (
          <View style={styles.emptyState}>
            <Feather name="file-text" size={48} color="#d1d5db" />
            <Text style={styles.emptyTitle}>No collections yet</Text>
            <Text style={styles.emptySubtitle}>
              Tap "Add Collection" above and save your first record.
            </Text>
          </View>
        ) : (
          <View style={styles.listContainer}>
            {filteredCollections.map(row => (
              <View key={row.name} style={styles.recordCard}>
                <View style={styles.recordHeader}>
                  <View style={styles.idBadge}>
                    <Feather name="hash" size={12} color={PRIMARY} />
                    <Text style={styles.idText}>{row.name}</Text>
                  </View>
                  <Text style={styles.dateText}>
                    {new Date(row.creation).toLocaleDateString()}
                  </Text>
                </View>

                <View style={styles.recordBody}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.recordLabel}>Agent</Text>
                    <Text style={styles.recordValue} numberOfLines={1}>
                      {row.fos_agent}
                    </Text>

                    <Text style={[styles.recordLabel, { marginTop: 8 }]}>
                      Customer
                    </Text>
                    <Text style={styles.recordValue} numberOfLines={1}>
                      {row.customer}
                    </Text>

                    <Text style={[styles.recordLabel, { marginTop: 8 }]}>
                      Bank
                    </Text>
                    <Text style={styles.recordValue} numberOfLines={1}>
                      {row.bank_name || '-'}
                    </Text>
                  </View>

                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={styles.recordLabel}>Amount</Text>
                    <Text style={styles.amountText}>₹{row.amount}</Text>

                    {row.receipt_image && (
                      <Image
                        source={{
                          uri: `https://erp.pradisystechnologies.in${row.receipt_image}`,
                        }}
                        style={styles.receiptThumbnail}
                      />
                    )}
                  </View>
                </View>

                <View style={styles.divider} />

                {/* ✅ Delete button removed as requested */}
                <View style={styles.recordFooter}>
                  <View style={styles.badgesRow}>
                    <View style={styles.modeBadge}>
                      <Text style={styles.modeBadgeText}>{row.mode}</Text>
                    </View>

                    <View
                      style={[
                        styles.statusBadge,
                        row.is_deposited === 1
                          ? styles.statusDeposited
                          : styles.statusPending,
                      ]}
                    >
                      <Text
                        style={[
                          styles.statusText,
                          row.is_deposited === 1
                            ? styles.textDeposited
                            : styles.textPending,
                        ]}
                      >
                        {row.is_deposited === 1 ? 'Deposited' : 'Pending'}
                      </Text>
                    </View>
                  </View>
                </View>
              </View>
            ))}
          </View>
        )}
      </View>
    </ScrollView>
  );
};

// ─────────────────────────────────────────────
// Small presentational field component
// ─────────────────────────────────────────────

type FieldProps = {
  label: string;
  value: string;
  placeholder?: string;
  keyboardType?: 'default' | 'numeric';
  onChangeText: (text: string) => void;
  isSmall: boolean;
};

const FormField: React.FC<FieldProps> = ({
  label,
  value,
  placeholder,
  keyboardType = 'default',
  onChangeText,
  isSmall,
}) => (
  <View style={[styles.fieldWrapper, isSmall && styles.fieldWrapperFull]}>
    <Text style={styles.label}>{label}</Text>
    <TextInput
      style={styles.input}
      value={value}
      placeholder={placeholder}
      onChangeText={onChangeText}
      keyboardType={keyboardType}
      placeholderTextColor="#9ca3af"
    />
  </View>
);

// ─────────────────────────────────────────────

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#f3f4f6' },
  screenContent: { padding: 16, paddingBottom: 32 },

  topHeader: {
    marginBottom: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  topHeaderBack: {
    fontSize: 16,
    fontWeight: '600',
    color: PRIMARY,
  },
  userBadge: {
    fontSize: 11,
    color: ACCENT,
    backgroundColor: 'rgba(57, 126, 138, 0.08)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },

  summaryRow: { flexDirection: 'row', justifyContent: 'flex-start' },
  summaryCard: {
    width: '100%',
    backgroundColor: '#ffffff',
    borderRadius: 18,
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderLeftWidth: 3,
    borderLeftColor: ACCENT,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  summaryTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  summaryIconBox: {
    width: 40,
    height: 40,
    borderRadius: 14,
    backgroundColor: 'rgba(57, 126, 138, 0.12)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  summaryCount: {
    fontSize: 22,
    fontWeight: '700',
    color: ACCENT,
  },
  summaryTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: PRIMARY,
    marginBottom: 4,
  },
  summarySubtitle: {
    fontSize: 12,
    color: '#6b7280',
    marginBottom: 12,
  },
  summaryStatsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  summaryStatCard: {
    flex: 1,
    marginRight: 8,
    paddingVertical: 6,
  },
  summaryStatLabel: {
    fontSize: 11,
    color: '#6b7280',
  },
  summaryStatValue: {
    marginTop: 2,
    fontSize: 16,
    fontWeight: '700',
    color: PRIMARY,
  },

  summaryButton: {
    borderRadius: 999,
    paddingVertical: 9,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: ACCENT,
  },
  summaryButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#ffffff',
  },

  card: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 16,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },

  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: PRIMARY,
    marginRight: 8,
  },
  notSaved: {
    fontSize: 11,
    color: '#f97316',
    fontWeight: '600',
  },

  headerButtons: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  secondaryBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    marginRight: 8,
    backgroundColor: '#ffffff',
  },
  secondaryBtnText: {
    fontSize: 12,
    color: '#4b5563',
    fontWeight: '500',
  },
  primaryBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: ACCENT,
  },
  primaryBtnDisabled: {
    opacity: 0.7,
  },
  primaryBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#ffffff',
  },

  formGrid: {
    marginTop: 8,
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  fieldWrapper: { width: '48%', marginBottom: 12 },
  fieldWrapperFull: { width: '100%', marginBottom: 12 },
  label: {
    fontSize: 11,
    color: PRIMARY,
    marginBottom: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    fontWeight: '600',
  },
  input: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 13,
    color: '#0f172a',
    backgroundColor: '#ffffff',
  },
  rowAlignCenter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingRight: 8,
  },

  modeRow: { flexDirection: 'row', flexWrap: 'wrap' },
  modeChip: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginRight: 8,
    marginTop: 4,
  },
  modeChipActive: {
    backgroundColor: ACCENT,
    borderColor: ACCENT,
  },
  modeChipText: { fontSize: 12, color: '#374151' },
  modeChipTextActive: {
    color: '#ffffff',
    fontWeight: '600',
  },

  attachButton: {
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: '#d1d5db',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  attachText: { fontSize: 13, color: ACCENT, marginLeft: 6 },
  receiptPreview: {
    marginTop: 8,
    width: '100%',
    height: 120,
    borderRadius: 10,
    resizeMode: 'cover',
  },

  // dropdowns
  dropdown: {
    marginTop: 4,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#d1d5db',
    paddingHorizontal: 10,
    paddingVertical: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#ffffff',
  },
  dropdownValue: {
    fontSize: 13,
    color: '#111827',
  },
  dropdownList: {
    marginTop: 4,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#ffffff',
    overflow: 'hidden',
  },
  dropdownItem: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  dropdownItemText: {
    fontSize: 13,
    color: '#111827',
  },
  dropdownItemBadge: {
    fontSize: 11,
    color: '#6b7280',
  },

  selectionTagsRow: {
    flexDirection: 'row',
    marginTop: 10,
  },
  selectionTag: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(57, 126, 138, 0.08)',
    marginRight: 8,
  },
  selectionTagLabel: {
    fontSize: 10,
    textTransform: 'uppercase',
    color: '#64748b',
  },
  selectionTagValue: {
    fontSize: 12,
    fontWeight: '600',
    color: ACCENT,
  },

  loadingContainer: {
    paddingVertical: 40,
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: '#6b7280',
  },

  listContainer: {
    marginTop: 8,
  },
  recordCard: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    padding: 12,
    marginBottom: 12,
  },
  recordHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  idBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(21, 46, 71, 0.05)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  idText: {
    fontSize: 12,
    fontWeight: '600',
    color: PRIMARY,
    marginLeft: 4,
  },
  dateText: {
    fontSize: 12,
    color: '#9ca3af',
  },
  recordBody: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  recordLabel: {
    fontSize: 10,
    color: '#9ca3af',
    textTransform: 'uppercase',
    fontWeight: '600',
    marginBottom: 2,
  },
  recordValue: {
    fontSize: 14,
    color: '#1f2937',
    fontWeight: '500',
    marginBottom: 4,
  },
  amountText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#16a34a',
  },
  receiptThumbnail: {
    width: 60,
    height: 60,
    borderRadius: 8,
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  divider: {
    height: 1,
    backgroundColor: '#f3f4f6',
    marginVertical: 12,
  },
  recordFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  badgesRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  modeBadge: {
    backgroundColor: 'rgba(57, 126, 138, 0.08)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    marginRight: 8,
    borderWidth: 1,
    borderColor: 'rgba(57, 126, 138, 0.4)',
  },
  modeBadgeText: {
    fontSize: 11,
    color: ACCENT,
    fontWeight: '600',
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
  },
  statusDeposited: {
    backgroundColor: '#f0fdf4',
    borderColor: '#bbf7d0',
  },
  statusPending: {
    backgroundColor: '#fefce8',
    borderColor: '#fef08a',
  },
  statusText: {
    fontSize: 11,
    fontWeight: '600',
  },
  textDeposited: { color: '#15803d' },
  textPending: { color: '#a16207' },

  savedHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  savedHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  savedTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: PRIMARY,
    marginRight: 8,
  },
  recordsPill: {
    fontSize: 12,
    color: ACCENT,
    fontWeight: '600',
    backgroundColor: 'rgba(57, 126, 138, 0.12)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },

  filterChipRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  filterChip: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginLeft: 6,
  },
  filterChipActive: {
    backgroundColor: ACCENT,
    borderColor: ACCENT,
  },
  filterChipText: {
    fontSize: 11,
    color: '#4b5563',
  },
  filterChipTextActive: {
    color: '#ffffff',
    fontWeight: '600',
  },

  emptyState: { alignItems: 'center', paddingVertical: 24 },
  emptyTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#4b5563',
    marginTop: 8,
  },
  emptySubtitle: {
    fontSize: 12,
    color: '#9ca3af',
    marginTop: 4,
    textAlign: 'center',
  },
});

export default CollectionScreen;
