// src/screens/DepositScreen.tsx

import React, { useState, useEffect } from 'react';
import {
  Alert,
  Image,
  ScrollView,
  StyleSheet,
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

// ✅ Import your services
import {
  createCashDeposit,
  fetchUndepositedCollections,
  fetchMyDeposits,
  deleteDeposit,
  FOSCashDepositResponse,
  fetchLoggedInAgentName,
} from '../services/depositService';
import { FOSCollectionResponse } from '../services/collectionService';
import { ERP_BASE_URL } from '../config/erpConfig';

// Brand colors
const PRIMARY = '#152e47';
const ACCENT = '#397e8a';

type FOSDepositForm = {
  fos_agent: string;
  bank_name: string;
  deposit_date: string;
  branch: string;
  deposit_location: string;
  deposit_slip_no: string;
  deposit_slip_image_uri: string | null;
  deposit_slip_image_asset: Asset | null;
};

const DepositScreen: React.FC = () => {
  const { width } = useWindowDimensions();
  const isSmall = width < 380;

  const todayStr = new Date().toISOString().slice(0, 10); // "YYYY-MM-DD"

  const [formData, setFormData] = useState<FOSDepositForm>({
    fos_agent: '',
    bank_name: '',
    deposit_date: todayStr, // 🗓 default = today
    branch: '',
    deposit_location: '',
    deposit_slip_no: '',
    deposit_slip_image_uri: null,
    deposit_slip_image_asset: null,
  });

  // 👉 NEW: auto-load logged-in agent name into form
  const loadAgentName = async () => {
    try {
      const agentName = await fetchLoggedInAgentName();
      console.log('👤 Auto FOS agent name:', agentName);

      setFormData(prev => ({
        ...prev,
        fos_agent: agentName || prev.fos_agent, // keep old if something goes wrong
      }));
    } catch (err) {
      console.warn('⚠️ Failed to auto-load agent name', err);
    }
  };
  console.log(formData.fos_agent);

  useEffect(() => {
    console.log('🔄 DepositScreen mounted');
    loadAgentName(); // ⬅️ auto-fill FOS Agent
    loadData(); // existing function
  }, []);

  const [undepositedCollections, setUndepositedCollections] = useState<
    FOSCollectionResponse[]
  >([]);
  const [selectedCollections, setSelectedCollections] = useState<Set<string>>(
    new Set(),
  );
  const [deposits, setDeposits] = useState<FOSCashDepositResponse[]>([]);
  const [isAdding, setIsAdding] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [debugInfo, setDebugInfo] = useState<string>(''); // ✅ Debug info

  useEffect(() => {
    console.log('🔄 DepositScreen mounted');
    loadData();
  }, []);

  const loadData = async () => {
    console.log('🔄 Loading data...');
    setIsLoading(true);
    setDebugInfo('Loading...');

    try {
      console.log('📡 Fetching undeposited collections...');
      const collections = await fetchUndepositedCollections();
      console.log(
        '✅ Undeposited collections:',
        collections.length,
        collections,
      );

      console.log('📡 Fetching deposits...');
      const depositList = await fetchMyDeposits();
      console.log('✅ Deposits:', depositList.length, depositList);

      setUndepositedCollections(collections);
      setDeposits(depositList);
      setDebugInfo(
        `Loaded: ${collections.length} collections, ${depositList.length} deposits`,
      );

      if (collections.length === 0) {
        Alert.alert(
          'No Collections',
          'No undeposited collections found. Please create and submit some collections first.',
        );
      }
    } catch (error: any) {
      console.error('❌ Error loading data:', error);
      setDebugInfo(`Error: ${error.message}`);
      Alert.alert(
        'Error Loading Data',
        `${error.message}\n\nPlease check:\n1. You are logged in\n2. Collections exist\n3. Network connection`,
      );
    } finally {
      setIsLoading(false);
    }
  };

  const onRefresh = async () => {
    setIsRefreshing(true);
    await loadData();
    setIsRefreshing(false);
  };

  const handleChange = <K extends keyof FOSDepositForm>(
    key: K,
    value: FOSDepositForm[K],
  ) => {
    setFormData(prev => ({ ...prev, [key]: value }));
  };

  const clearForm = () => {
    setFormData({
      fos_agent: '',
      bank_name: '',
      deposit_date: todayStr, // reset to today again
      branch: '',
      deposit_location: '',
      deposit_slip_no: '',
      deposit_slip_image_uri: null,
      deposit_slip_image_asset: null,
    });
    setSelectedCollections(new Set());
  };

  const toggleCollection = (collectionId: string) => {
    console.log('🔘 Toggling collection:', collectionId);
    setSelectedCollections(prev => {
      const newSet = new Set(prev);
      if (newSet.has(collectionId)) {
        newSet.delete(collectionId);
        console.log('➖ Removed:', collectionId);
      } else {
        newSet.add(collectionId);
        console.log('➕ Added:', collectionId);
      }
      console.log('📋 Selected now:', Array.from(newSet));
      return newSet;
    });
  };

  const handleSave = async () => {
    console.log('💾 Save clicked');
    console.log('📋 Selected collections:', Array.from(selectedCollections));

    if (selectedCollections.size === 0) {
      Alert.alert(
        'No Collections',
        'Please select at least one collection to deposit.',
      );
      return;
    }

    if (!formData.fos_agent || !formData.bank_name) {
      Alert.alert('Missing Fields', 'Please fill FOS Agent and Bank Name.');
      return;
    }

    setIsSaving(true);

    try {
      const selected = undepositedCollections.filter(col =>
        selectedCollections.has(col.name),
      );

      console.log('💾 Saving deposit with collections:');
      console.log(
        '  - Selected IDs:',
        selected.map(c => c.name),
      );
      console.log(
        '  - Total amount:',
        selected.reduce((sum, c) => sum + c.amount, 0),
      );
      console.log('  - Form data:', formData);

      const result = await createCashDeposit({
        fos_agent: formData.fos_agent,
        deposit_date: formData.deposit_date,
        bank_name: formData.bank_name,
        branch: formData.branch,
        deposit_location: formData.deposit_location,
        deposit_slip_no: formData.deposit_slip_no,
        selected_collections: selected,
        deposit_slip_image: formData.deposit_slip_image_asset,
      });

      console.log('✅ Deposit created:', result);

      Alert.alert('Success', `Deposit ${result.name} created successfully!`);

      await loadData();
      clearForm();
      setIsAdding(false);
    } catch (error: any) {
      console.error('❌ Error saving deposit:', error);
      console.error('Error details:', {
        message: error.message,
        stack: error.stack,
      });

      let errorMessage = 'Failed to save deposit. Please try again.';

      if (error.message?.includes('401')) {
        errorMessage = 'Authentication failed. Please login again.';
      } else if (error.message?.includes('403')) {
        errorMessage = "You don't have permission to create deposits.";
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
      'Delete Deposit',
      'Are you sure you want to delete this deposit?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteDeposit(name);
              Alert.alert('Success', 'Deposit deleted successfully');
              await loadData();
            } catch (error: any) {
              console.error('Error deleting deposit:', error);
              Alert.alert(
                'Error',
                error?.message || 'Failed to delete deposit',
              );
            }
          },
        },
      ],
    );
  };

  const handlePickSlipImage = async () => {
    const options: ImageLibraryOptions = {
      mediaType: 'photo',
      selectionLimit: 1,
    };
    const result = await launchImageLibrary(options);
    if (result.didCancel) return;

    const asset: Asset | undefined = result.assets && result.assets[0];
    if (asset?.uri) {
      handleChange('deposit_slip_image_uri', asset.uri);
      handleChange('deposit_slip_image_asset', asset);
    }
  };

  const getTotalSelectedAmount = () => {
    return undepositedCollections
      .filter(col => selectedCollections.has(col.name))
      .reduce((sum, col) => sum + col.amount, 0);
  };

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.screenContent}
      refreshControl={
        <RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} />
      }
    >
      {/* ✅ Debug Info Banner */}
      {debugInfo && (
        <View style={styles.debugBanner}>
          <Text style={styles.debugText}>🐛 {debugInfo}</Text>
        </View>
      )}

      {/* Summary card */}
      <View style={styles.summaryRow}>
        <View style={styles.summaryCard}>
          <View style={styles.summaryTop}>
            <View style={styles.summaryIconBox}>
              <Feather name="credit-card" size={22} color={ACCENT} />
            </View>
            <Text style={styles.summaryCount}>{deposits.length}</Text>
          </View>

          <Text style={styles.summaryTitle}>FOS Cash Deposit</Text>
          <Text style={styles.summarySubtitle}>
            {undepositedCollections.length} undeposited collection
            {undepositedCollections.length === 1 ? '' : 's'}
          </Text>

          <TouchableOpacity
            style={[
              styles.summaryButton,
              undepositedCollections.length === 0 &&
                styles.summaryButtonDisabled,
            ]}
            onPress={() => {
              console.log('➕ Add Deposit clicked');
              setIsAdding(true);
            }}
            activeOpacity={0.85}
            disabled={isAdding || undepositedCollections.length === 0}
          >
            <Text style={styles.summaryButtonText}>
              {undepositedCollections.length === 0
                ? 'No Collections Available'
                : 'Add Deposit'}
            </Text>
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
                <Text style={styles.title}>New FOS Cash Deposit</Text>
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

            {/* Grid form */}
            <View style={styles.formGrid}>
              <FormField
                label="FOS AGENT *"
                placeholder="Enter agent name"
                value={formData.fos_agent}
                onChangeText={t => handleChange('fos_agent', t)}
                isSmall={isSmall}
              />

              <FormField
                label="BANK NAME *"
                placeholder="Enter bank name"
                value={formData.bank_name}
                onChangeText={t => handleChange('bank_name', t)}
                isSmall={isSmall}
              />

              <FormField
                label="DEPOSIT DATE"
                placeholder="YYYY-MM-DD"
                value={formData.deposit_date}
                onChangeText={t => handleChange('deposit_date', t)}
                isSmall={isSmall}
              />

              <FormField
                label="BRANCH"
                placeholder="Enter branch"
                value={formData.branch}
                onChangeText={t => handleChange('branch', t)}
                isSmall={isSmall}
              />

              <FormField
                label="DEPOSIT LOCATION"
                placeholder="Enter city / location"
                value={formData.deposit_location}
                onChangeText={t => handleChange('deposit_location', t)}
                isSmall={isSmall}
              />
              <FormField
                label="DEPOSIT SLIP NO"
                placeholder="Enter slip number"
                value={formData.deposit_slip_no}
                onChangeText={t => handleChange('deposit_slip_no', t)}
                isSmall={isSmall}
              />

              <View
                style={[
                  styles.fieldWrapper,
                  isSmall && styles.fieldWrapperFull,
                ]}
              >
                <Text style={styles.label}>DEPOSIT SLIP IMAGE</Text>
                <TouchableOpacity
                  style={styles.attachButton}
                  onPress={handlePickSlipImage}
                >
                  <Feather name="camera" size={16} color={ACCENT} />
                  <Text style={styles.attachText}>
                    {formData.deposit_slip_image_uri
                      ? 'Change slip photo'
                      : 'Attach slip photo'}
                  </Text>
                </TouchableOpacity>

                {formData.deposit_slip_image_uri && (
                  <Image
                    source={{ uri: formData.deposit_slip_image_uri }}
                    style={styles.receiptPreview}
                  />
                )}
              </View>
            </View>

            {/* Collections selection */}
            <View style={{ marginTop: 16 }}>
              <View style={styles.collectionHeader}>
                <Text style={styles.collectionTitle}>
                  Select Collections to Deposit * ({selectedCollections.size}{' '}
                  selected)
                </Text>
                <View style={styles.amountBadge}>
                  <Text style={styles.amountBadgeText}>
                    ₹{getTotalSelectedAmount().toFixed(2)}
                  </Text>
                </View>
              </View>

              {undepositedCollections.length === 0 ? (
                <View style={styles.emptyCollections}>
                  <Feather name="inbox" size={32} color="#d1d5db" />
                  <Text style={styles.emptyText}>
                    No undeposited collections available
                  </Text>
                  <Text style={styles.emptySubtext}>
                    Create some collections first
                  </Text>
                </View>
              ) : (
                <ScrollView style={styles.collectionsList}>
                  {undepositedCollections.map((col, index) => {
                    const isSelected = selectedCollections.has(col.name);
                    return (
                      <TouchableOpacity
                        key={col.name}
                        style={[
                          styles.collectionItem,
                          isSelected && styles.collectionItemSelected,
                        ]}
                        onPress={() => toggleCollection(col.name)}
                        activeOpacity={0.7}
                      >
                        <View style={styles.collectionLeft}>
                          <View
                            style={[
                              styles.checkbox,
                              isSelected && styles.checkboxSelected,
                            ]}
                          >
                            {isSelected && (
                              <Feather name="check" size={14} color="#fff" />
                            )}
                          </View>

                          <View style={{ flex: 1 }}>
                            <Text style={styles.collectionId}>
                              {index + 1}. {col.name}
                            </Text>
                            <Text style={styles.collectionCustomer}>
                              {col.customer}
                            </Text>
                            <Text style={styles.collectionMode}>
                              {col.mode}
                            </Text>
                          </View>
                        </View>

                        <Text style={styles.collectionAmount}>
                          ₹{col.amount.toFixed(2)}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              )}

              {selectedCollections.size > 0 && (
                <View style={styles.selectionSummary}>
                  <Text style={styles.selectionText}>
                    ✅ {selectedCollections.size} collection
                    {selectedCollections.size === 1 ? '' : 's'} selected •
                    Total: ₹{getTotalSelectedAmount().toFixed(2)}
                  </Text>
                </View>
              )}
            </View>
          </View>
        </>
      )}

      <View style={{ height: 16 }} />

      {/* Saved Deposits */}
      <View style={styles.card}>
        <View style={styles.savedHeader}>
          <View style={styles.savedHeaderLeft}>
            <Text style={styles.savedTitle}>My Deposits</Text>
            <Text style={styles.recordsPill}>
              {deposits.length} Record{deposits.length === 1 ? '' : 's'}
            </Text>
          </View>
        </View>

        {isLoading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={ACCENT} />
            <Text style={styles.loadingText}>Loading deposits...</Text>
          </View>
        ) : deposits.length === 0 ? (
          <View style={styles.emptyState}>
            <Feather name="inbox" size={48} color="#d1d5db" />
            <Text style={styles.emptyTitle}>No deposits yet</Text>
            <Text style={styles.emptySubtitle}>
              Tap "Add Deposit" above to create your first deposit record.
            </Text>
          </View>
        ) : (
          <View style={styles.listContainer}>
            {deposits.map(row => (
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
                      Bank / Branch
                    </Text>
                    <Text style={styles.recordValue} numberOfLines={1}>
                      {row.bank_name || '-'}
                      {row.branch ? ` • ${row.branch}` : ''}
                    </Text>

                    <Text style={[styles.recordLabel, { marginTop: 8 }]}>
                      Collections
                    </Text>
                    <Text style={styles.recordValue}>
                      {row.collections?.length || 0} collection(s)
                    </Text>
                  </View>

                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={styles.recordLabel}>Amount</Text>
                    <Text style={styles.amountText}>
                      ₹{row.amount_deposited.toFixed(2)}
                    </Text>

                    {row.deposit_slip_image && (
                      <Image
                        source={{
                          uri: `${ERP_BASE_URL}${row.deposit_slip_image}`,
                        }}
                        style={styles.receiptThumbnail}
                      />
                    )}
                  </View>
                </View>

                <View style={styles.divider} />

                <View style={styles.recordFooter}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.recordLabel}>Deposit Date</Text>
                    <Text style={styles.collectionText}>
                      {row.deposit_date || '-'}
                    </Text>
                  </View>

                  {/* <TouchableOpacity
                    onPress={() => handleDelete(row.name)}
                    style={styles.deleteBtn}
                  >
                    <Feather name="trash-2" size={16} color="#dc2626" />
                  </TouchableOpacity> */}
                </View>
              </View>
            ))}
          </View>
        )}
      </View>
    </ScrollView>
  );
};

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

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#f3f4f6' },
  screenContent: { padding: 16, paddingBottom: 32 },

  // ✅ Debug banner
  debugBanner: {
    backgroundColor: '#fef3c7',
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
    borderLeftWidth: 3,
    borderLeftColor: '#f59e0b',
  },
  debugText: {
    fontSize: 12,
    color: '#92400e',
    fontWeight: '600',
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
  summaryCount: { fontSize: 22, fontWeight: '700', color: ACCENT },
  summaryTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: PRIMARY,
    marginBottom: 4,
  },
  summarySubtitle: { fontSize: 12, color: '#6b7280', marginBottom: 12 },
  summaryButton: {
    borderRadius: 999,
    paddingVertical: 9,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: ACCENT,
  },
  summaryButtonDisabled: {
    backgroundColor: '#9ca3af',
    opacity: 0.6,
  },
  summaryButtonText: { fontSize: 13, fontWeight: '600', color: '#ffffff' },

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
  notSaved: { fontSize: 11, color: '#f97316', fontWeight: '600' },
  headerButtons: { flexDirection: 'row', alignItems: 'center' },
  secondaryBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    marginRight: 8,
    backgroundColor: '#f9fafb',
  },
  secondaryBtnText: {
    fontSize: 13,
    color: '#4b5563',
    fontWeight: '500',
  },
  primaryBtn: {
    paddingHorizontal: 18,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: ACCENT,
    minWidth: 70,
    alignItems: 'center',
  },
  primaryBtnDisabled: {
    opacity: 0.6,
  },
  primaryBtnText: { fontSize: 13, color: '#ffffff', fontWeight: '600' },

  loadingContainer: {
    paddingVertical: 40,
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: '#6b7280',
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
    height: 90,
    borderRadius: 10,
    resizeMode: 'cover',
  },

  collectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  collectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: PRIMARY,
    flex: 1,
  },
  amountBadge: {
    backgroundColor: 'rgba(57, 126, 138, 0.12)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  amountBadgeText: {
    fontSize: 13,
    fontWeight: '700',
    color: ACCENT,
  },

  emptyCollections: {
    alignItems: 'center',
    paddingVertical: 24,
    backgroundColor: '#f9fafb',
    borderRadius: 10,
  },
  emptyText: {
    fontSize: 12,
    color: '#9ca3af',
    marginTop: 8,
  },
  emptySubtext: {
    fontSize: 11,
    color: '#d1d5db',
    marginTop: 4,
  },

  collectionsList: {
    maxHeight: 300,
  },
  collectionItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 12,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#e5e7eb',
    marginBottom: 8,
    backgroundColor: '#ffffff',
  },
  collectionItemSelected: {
    backgroundColor: 'rgba(57, 126, 138, 0.06)',
    borderColor: ACCENT,
  },
  collectionLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#d1d5db',
    marginRight: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkboxSelected: {
    backgroundColor: ACCENT,
    borderColor: ACCENT,
  },
  collectionId: {
    fontSize: 12,
    fontWeight: '600',
    color: '#374151',
  },
  collectionCustomer: {
    fontSize: 11,
    color: '#6b7280',
    marginTop: 2,
  },
  collectionMode: {
    fontSize: 10,
    color: '#9ca3af',
    marginTop: 2,
  },
  collectionAmount: {
    fontSize: 14,
    fontWeight: '700',
    color: PRIMARY,
  },

  selectionSummary: {
    marginTop: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: 'rgba(57, 126, 138, 0.06)',
    borderRadius: 8,
  },
  selectionText: {
    fontSize: 12,
    color: ACCENT,
    fontWeight: '600',
    textAlign: 'center',
  },

  savedHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  savedHeaderLeft: { flexDirection: 'row', alignItems: 'center' },
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

  listContainer: { marginTop: 8 },
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
  dateText: { fontSize: 12, color: '#9ca3af' },
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
  amountText: { fontSize: 18, fontWeight: '700', color: PRIMARY },
  receiptThumbnail: {
    width: 60,
    height: 60,
    borderRadius: 8,
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  divider: { height: 1, backgroundColor: '#f3f4f6', marginVertical: 12 },
  recordFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  collectionText: {
    fontSize: 13,
    color: '#111827',
    fontWeight: '500',
  },
  deleteBtn: {
    padding: 8,
    backgroundColor: '#fee2e2',
    borderRadius: 8,
  },
});

export default DepositScreen;
