import React, { useState, useEffect, useCallback } from 'react';
import { StyleSheet, FlatList, RefreshControl, View, TextInput, TouchableOpacity, useColorScheme, Alert, ActivityIndicator, Image, Modal, ScrollView } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { getPendingFarmersWithFarms, getPendingLogsToSync, updateVisitRequestStatus } from '@/lib/offline-db';
import { syncOfflineData } from '@/lib/sync-engine';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors } from '@/constants/theme';
import { useAuth } from '@/context/auth-context';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { useTranslation } from '@/context/language-context';

export default function FarmerDashboard() {
  const { t, locale, setLocale } = useTranslation();
  const router = useRouter();
  const colorScheme = useColorScheme();
  const { signOut, user } = useAuth();
  const [farmers, setFarmers] = useState<any[]>([]);
  const [filteredFarmers, setFilteredFarmers] = useState<any[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterCrop, setFilterCrop] = useState('');
  const [exporting, setExporting] = useState(false);
  const [showRequests, setShowRequests] = useState(false);
  const [pendingRequests, setPendingRequests] = useState<any[]>([]);

  const handleLogout = () => {
    Alert.alert('Sign Out', 'Are you sure you want to end your secure session?', [
      { text: 'Stay Logged In', style: 'cancel' },
      { text: 'Sign Out', style: 'destructive', onPress: signOut }
    ]);
  };

  const fetchFarmers = async () => {
    try {
      // 1. Fetch from Supabase
      const { data: onlineData, error } = await supabase
        .from('farmers')
        .select(`
          id, name, phone_number, land_area, crop_type, crop_duration, avatar_url, village, address, created_by,
          farms (
            id,
            boundary
          )
        `)
        .order('created_at', { ascending: false });

      if (error) throw error;

      // 2. Fetch from Offline DB
      const offlineRecords = await getPendingFarmersWithFarms();
      const formattedOffline = offlineRecords.map(rec => ({
        id: `local_${rec.id}`,
        name: rec.name,
        phone_number: rec.phone_number,
        land_area: rec.land_area,
        crop_type: rec.crop_type,
        crop_duration: rec.crop_duration,
        avatar_url: rec.avatar_uri,
        farms: rec.farms,
        village: rec.village,
        address: rec.address,
        sync_status: rec.sync_status,
        created_by: rec.created_by,
        is_offline: true
      }));

      // 3. Fetch Visit Requests (Online + Offline)
      const { data: onlineVReqs } = await supabase
        .from('visit_requests')
        .select('*, farmers(name, phone_number)')
        .eq('status', 'pending');

      const { visitRequests: offlineVReqs } = await getPendingLogsToSync();
      
      // Format offline requests to match online structure
      const formattedOfflineVReqs = offlineVReqs.map(vr => {
        const farmer = formattedOffline.find(f => f.id === vr.farmer_id) || 
                      onlineData?.find(f => f.id === vr.farmer_id);
        return {
          ...vr,
          farmers: farmer ? { name: farmer.name, phone_number: farmer.phone_number } : null,
          is_offline: true
        };
      });

      const allVReqs = [...(onlineVReqs || []), ...formattedOfflineVReqs];
      setPendingRequests(allVReqs);
      
      const merged = [...formattedOffline, ...(onlineData || [])].map(f => ({
        ...f,
        has_pending_visit: allVReqs.some(vr => vr.farmer_id === f.id) || false
      }));
      setFarmers(merged);
      applyFilters(merged, searchQuery, filterCrop);
    } catch (error: any) {
      console.error('Error fetching farmers:', error.message);
    }
  };

  const markRequestComplete = async (requestId: string | number, isOffline?: boolean) => {
    try {
      if (isOffline) {
        await updateVisitRequestStatus(requestId as number, 'completed');
      } else {
        const { error } = await supabase
          .from('visit_requests')
          .update({ status: 'completed' })
          .eq('id', requestId);

        if (error) throw error;
      }
      
      // Update local state
      setPendingRequests(prev => prev.filter(r => r.id !== requestId));
      fetchFarmers(); // Refresh stats
    } catch (error: any) {
      Alert.alert('Error', 'Failed to update request status');
    }
  };

  const applyFilters = (data: any[], query: string, crop: string) => {
    let filtered = data;
    if (query) {
      filtered = filtered.filter(f => 
        f.name.toLowerCase().includes(query.toLowerCase()) || 
        (f.phone_number && f.phone_number.includes(query))
      );
    }
    if (crop) {
      filtered = filtered.filter(f => 
        f.crop_type && f.crop_type.toLowerCase().includes(crop.toLowerCase())
      );
    }
    setFilteredFarmers(filtered);
  };

  useEffect(() => {
    applyFilters(farmers, searchQuery, filterCrop);
  }, [searchQuery, filterCrop, farmers]);

  useFocusEffect(
    useCallback(() => {
      fetchFarmers();
    }, [])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchFarmers();
    setRefreshing(false);
  };

  const handleExport = async () => {
    if (filteredFarmers.length === 0) {
      Alert.alert('No Data', 'There is no data available to export.');
      return;
    }

    setExporting(true);
    try {
      const header = 'Name,Phone,Land Area (Acres),Crop Type,Duration,Status,Coordinates\n';
      const rows = filteredFarmers.map(item => {
        const isMapped = Array.isArray(item.farms) ? item.farms.length > 0 : !!item.farms;
        const farm = Array.isArray(item.farms) ? item.farms[0] : item.farms;
        const boundaryStr = farm?.boundary ? JSON.stringify(farm.boundary).replace(/,/g, ';') : 'N/A';
        
        return `"${item.name}","${item.phone_number || ''}","${item.land_area || ''}","${item.crop_type || ''}","${item.crop_duration || ''}","${isMapped ? 'Mapped' : 'Unmapped'}","${boundaryStr}"`;
      }).join('\n');

      const csvContent = header + rows;
      const fileName = `KK_Sathi_Data_${new Date().toISOString().split('T')[0]}.csv`;
      const fileUri = `${FileSystem.documentDirectory}${fileName}`;

      await FileSystem.writeAsStringAsync(fileUri, csvContent, { encoding: FileSystem.EncodingType.UTF8 });
      
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(fileUri, { mimeType: 'text/csv', dialogTitle: 'Export KK Sathi Data' });
      } else {
        Alert.alert('Sharing Unavailable', 'Your device does not support sharing files.');
      }
    } catch (error: any) {
      console.error('Export Error:', error);
      Alert.alert('Export Failed', 'An error occurred while generating the CSV: ' + error.message);
    } finally {
      setExporting(false);
    }
  };

  const renderItem = ({ item }: { item: any }) => {
    const isMapped = Array.isArray(item.farms) ? item.farms.length > 0 : !!item.farms;
    const isOffline = !!item.is_offline;
    const isSyncing = item.sync_status === 'syncing';
    const isError = item.sync_status === 'error';
    
    return (
      <TouchableOpacity 
        key={item.id}
        style={[styles.card, { backgroundColor: colorScheme === 'dark' ? '#1E293B' : '#FFFFFF' }]}
        onPress={() => router.push({ pathname: '/farmer-details', params: { id: item.id } })}
        activeOpacity={0.7}
      >
        <View style={styles.cardTop}>
          <View style={styles.avatarWrapper}>
            <View style={[styles.avatarBorder, { borderColor: Colors[colorScheme ?? 'light'].tint + '30' }]}>
              {item.avatar_url || item.avatar_uri ? (
                <Image 
                  source={{ uri: item.avatar_url || item.avatar_uri }} 
                  style={styles.avatarImage} 
                />
              ) : (
                <View style={[styles.avatarPlaceholder, { backgroundColor: Colors[colorScheme ?? 'light'].tint + '10' }]}>
                  <ThemedText style={[styles.avatarInitial, { color: Colors[colorScheme ?? 'light'].tint }]}>
                    {item.name[0].toUpperCase()}
                  </ThemedText>
                </View>
              )}
            </View>
          </View>
          
          <View style={styles.headerInfo}>
            <ThemedText type="defaultSemiBold" style={styles.farmerNameText}>{item.name}</ThemedText>
            <View style={styles.infoRow}>
              <View style={styles.phoneRow}>
                <IconSymbol name="phone.fill" size={10} color="#94A3B8" />
                <ThemedText style={styles.phoneText}>{item.phone_number || 'No contact'}</ThemedText>
              </View>
              {item.village && (
                <View style={[styles.villageBadge, { backgroundColor: colorScheme === 'dark' ? '#334155' : '#F1F5F9' }]}>
                  <IconSymbol name="house.fill" size={10} color="#64748B" />
                  <ThemedText style={styles.villageText}>{item.village}</ThemedText>
                </View>
              )}
            </View>
          </View>
          <View style={styles.statusBadgeContainer}>
            <View style={[
              styles.glassBadge, 
              isSyncing ? styles.badgeOffline : (isError ? styles.badgeError : (isOffline ? styles.badgeWarning : (isMapped ? styles.badgeSuccess : styles.badgeWarning)))
            ]}>
              <View style={[
                styles.statusDot, 
                { backgroundColor: isSyncing ? '#6366F1' : (isError ? '#EF4444' : (isOffline ? '#F59E0B' : (isMapped ? '#22C55E' : '#F59E0B'))) }
              ]} />
              <ThemedText style={[
                styles.badgeLabel, 
                { color: isSyncing ? '#6366F1' : (isError ? '#B91C1C' : (isOffline ? '#92400E' : (isMapped ? '#166534' : '#92400E'))) }
              ]}>
                {isSyncing ? 'Syncing' : (isError ? 'Error' : (isOffline ? 'Pending' : (isMapped ? 'Mapped' : 'Unmapped')))}
              </ThemedText>
            </View>
            {item.has_pending_visit && (
              <View style={[styles.glassBadge, { backgroundColor: '#FEE2E2', marginLeft: 6 }]}>
                <View style={[styles.statusDot, { backgroundColor: '#EF4444' }]} />
                <ThemedText style={[styles.badgeLabel, { color: '#B91C1C', fontSize: 10 }]}>VISIT REQ</ThemedText>
              </View>
            )}
          </View>
        </View>
        
        <View style={styles.cardSeparator} />
        
        <View style={styles.statsGrid}>
          <View style={styles.statBox}>
            <ThemedText style={styles.statLabel}>{t('selectCrop')}</ThemedText>
            <View style={styles.statValueRow}>
              <IconSymbol name="leaf.fill" size={14} color="#10B981" />
              <ThemedText style={styles.statValue}>{item.crop_type || 'N/A'}</ThemedText>
            </View>
          </View>
          
          <View style={styles.statDivider} />
          
          <View style={styles.statBox}>
            <ThemedText style={styles.statLabel}>{t('landArea')}</ThemedText>
            <View style={styles.statValueRow}>
              <IconSymbol name="square.dashed" size={14} color="#6366F1" />
              <ThemedText style={styles.statValue}>{item.land_area ? `${item.land_area} Ac` : 'N/A'}</ThemedText>
            </View>
          </View>

          {isMapped && !isOffline && (
            <>
              <View style={styles.statDivider} />
              <View style={styles.mapHintBox}>
                <IconSymbol name="map.fill" size={18} color={Colors[colorScheme ?? 'light'].tint} />
              </View>
            </>
          )}
        </View>
      </TouchableOpacity>
    );
  };

  const renderVisitRequestsModal = () => (
    <Modal
      visible={showRequests}
      animationType="slide"
      transparent={true}
      onRequestClose={() => setShowRequests(false)}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <View style={styles.modalHeader}>
            <ThemedText style={styles.modalTitle}>{t('visitRequests')}</ThemedText>
            <TouchableOpacity 
              onPress={() => setShowRequests(false)} 
              style={styles.closeButton}
            >
              <IconSymbol name="xmark.circle.fill" size={28} color="#94A3B8" />
            </TouchableOpacity>
          </View>
          
          <ScrollView style={styles.requestList} showsVerticalScrollIndicator={false}>
            {pendingRequests.length === 0 ? (
              <View style={styles.emptyContainer}>
                <IconSymbol name="bell.slash.fill" size={48} color="#E2E8F0" />
                <ThemedText style={styles.emptyText}>No pending requests</ThemedText>
              </View>
            ) : (
              pendingRequests.map(item => (
                <View key={item.id} style={styles.requestItem}>
                  <View style={styles.requestItemHeader}>
                    <ThemedText style={styles.requestFarmerName}>
                      {item.farmers?.name || 'Unknown Farmer'}
                    </ThemedText>
                    <ThemedText style={styles.requestDate}>
                      {new Date(item.created_at).toLocaleDateString()}
                    </ThemedText>
                  </View>
                  <ThemedText style={styles.requestText}>
                    {item.request_text || 'No reason provided'}
                  </ThemedText>
                  <View style={styles.requestFooter}>
                    <View style={styles.requestPhoneRow}>
                      <IconSymbol name="phone.fill" size={14} color="#64748B" />
                      <ThemedText style={styles.requestPhone}>
                        {item.farmers?.phone_number || 'No phone'}
                      </ThemedText>
                    </View>
                    <TouchableOpacity 
                      style={styles.completeActionBtn}
                      onPress={() => markRequestComplete(item.id, item.is_offline)}
                    >
                      <ThemedText style={styles.completeActionText}>Done</ThemedText>
                    </TouchableOpacity>
                  </View>
                </View>
              ))
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );

  const getStatsOverview = () => {
    const total = farmers.length;
    const mapped = farmers.filter(f => Array.isArray(f.farms) ? f.farms.length > 0 : !!f.farms).length;
    const offline = farmers.filter(f => f.is_offline).length;
    const visitRequests = farmers.filter(f => f.has_pending_visit).length;
    const myReg = farmers.filter(f => f.created_by === user?.id).length;
    return { total, mapped, offline, visitRequests, myReg };
  };

  const stats = getStatsOverview();

  return (
    <ThemedView style={[styles.container, { backgroundColor: colorScheme === 'dark' ? Colors.dark.background : '#F8FAFC' }]}>
      <View style={styles.modernHeader}>
        <View style={styles.headerTopRow}>
          <TouchableOpacity 
            style={styles.langToggle}
            onPress={() => setLocale(locale === 'en' ? 'mr' : 'en')}
          >
            <ThemedText style={styles.langToggleText}>
              {locale === 'en' ? 'मराठी' : 'English'}
            </ThemedText>
          </TouchableOpacity>

          <View>
            <ThemedText style={styles.welcomeLabel}>{t('appName')} {t('ecosystem')}</ThemedText>
            <ThemedText type="title" style={styles.pageTitle}>{t('databaseHub')}</ThemedText>
          </View>

          <View style={styles.headerRightActions}>
            <TouchableOpacity 
              style={styles.notificationBell} 
              onPress={() => setShowRequests(true)}
            >
              <IconSymbol name="bell.fill" size={22} color={stats.visitRequests > 0 ? '#F59E0B' : '#94A3B8'} />
              {stats.visitRequests > 0 && (
                <View style={styles.bellBadge}>
                  <ThemedText style={styles.bellBadgeText}>{stats.visitRequests}</ThemedText>
                </View>
              )}
            </TouchableOpacity>
            
            <TouchableOpacity style={styles.profileCircle} onPress={handleLogout}>
              <IconSymbol name="rectangle.portrait.and.arrow.right" size={20} color="#EF4444" />
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.quickStatsRow}>
          <View style={[styles.quickStatCard, { backgroundColor: Colors[colorScheme ?? 'light'].tint + '10' }]}>
            <ThemedText style={[styles.quickStatValue, { color: Colors[colorScheme ?? 'light'].tint }]}>{stats.total}</ThemedText>
            <ThemedText style={styles.quickStatLabel}>{t('totalFarmers')}</ThemedText>
          </View>
          <View style={[styles.quickStatCard, { backgroundColor: '#F0FDF4' }]}>
            <ThemedText style={[stats.mapped > 0 ? styles.quickStatValue : styles.quickStatValue, { color: '#16A34A' }]}>{stats.mapped}</ThemedText>
            <ThemedText style={styles.quickStatLabel}>{t('mapped')}</ThemedText>
          </View>
          <View style={[styles.quickStatCard, { backgroundColor: '#EEF2FF' }]}>
            <ThemedText style={[styles.quickStatValue, { color: '#4F46E5' }]}>{stats.offline}</ThemedText>
            <ThemedText style={styles.quickStatLabel}>{t('waitSync')}</ThemedText>
          </View>
          <View style={[styles.quickStatCard, { backgroundColor: '#FFF7ED' }]}>
            <ThemedText style={[styles.quickStatValue, { color: '#EA580C' }]}>{stats.myReg}</ThemedText>
            <ThemedText style={styles.quickStatLabel}>{t('myRegistrations')}</ThemedText>
          </View>
        </View>

        <View style={styles.headerActions}>
          <TouchableOpacity 
            style={[styles.premiumActionBtn, { backgroundColor: Colors[colorScheme ?? 'light'].tint }]} 
            onPress={() => router.push('/global-map')}
          >
            <IconSymbol name="map.fill" size={18} color="#fff" />
            <ThemedText style={styles.premiumActionText}>{t('exploreMaps')}</ThemedText>
          </TouchableOpacity>
          <TouchableOpacity 
            style={[styles.premiumActionBtn, { backgroundColor: '#334155' }]} 
            onPress={handleExport}
            disabled={exporting}
          >
            {exporting ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <>
                <IconSymbol name="square.and.arrow.up" size={18} color="#fff" />
                <ThemedText style={styles.premiumActionText}>{t('exportCSV')}</ThemedText>
              </>
            )}
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.searchSection}>
        <View style={[styles.searchBar, { borderColor: Colors[colorScheme ?? 'light'].border }]}>
          <IconSymbol name="magnifyingglass" size={18} color="#64748B" />
          <TextInput
            style={[styles.searchField, { color: Colors[colorScheme ?? 'light'].text }]}
            placeholder={t('searchPlaceholder')}
            placeholderTextColor="#94A3B8"
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
        </View>
        <View style={[styles.filterBar, { borderColor: Colors[colorScheme ?? 'light'].border }]}>
          <IconSymbol name="tag.fill" size={16} color="#64748B" />
          <TextInput
            style={[styles.searchField, { color: Colors[colorScheme ?? 'light'].text }]}
            placeholder="Filter by crop..."
            placeholderTextColor="#94A3B8"
            value={filterCrop}
            onChangeText={setFilterCrop}
          />
        </View>
      </View>

      <FlatList
        data={filteredFarmers}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={styles.listContainer}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={fetchFarmers} tintColor={Colors[colorScheme ?? 'light'].tint} />
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <IconSymbol name="doc.text.magnifyingglass" size={60} color="#E2E8F0" />
            <ThemedText style={styles.emptyText}>No matching records found.</ThemedText>
          </View>
        }
      />
      {renderVisitRequestsModal()}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  modernHeader: {
    paddingTop: 60,
    paddingHorizontal: 20,
    paddingBottom: 25,
    backgroundColor: 'transparent',
  },
  headerTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  welcomeLabel: {
    fontSize: 12,
    fontWeight: '800',
    color: '#94A3B8',
    textTransform: 'uppercase',
    letterSpacing: 1.5,
    marginBottom: 4,
    lineHeight: 18,
    paddingTop: 2,
  },
  pageTitle: {
    fontSize: 32,
    fontWeight: '900',
    lineHeight: 40,
    paddingTop: 4,
  },
  profileCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 5,
    elevation: 2,
  },
  langToggle: {
    position: 'absolute',
    top: -20,
    right: 0,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    zIndex: 10,
  },
  langToggleText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#64748B',
    lineHeight: 18,
    paddingTop: 2,
  },
  quickStatsRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 20,
  },
  quickStatCard: {
    flex: 1,
    padding: 10,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickStatValue: {
    fontSize: 18,
    fontWeight: '900',
    marginBottom: 2,
  },
  quickStatLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: '#64748B',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  headerActions: {
    flexDirection: 'row',
    gap: 12,
  },
  premiumActionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 16,
    gap: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 10,
    elevation: 4,
  },
  premiumActionText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '800',
  },
  searchSection: {
    paddingHorizontal: 20,
    paddingBottom: 20,
    gap: 12,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 16,
    paddingHorizontal: 16,
    height: 54,
    gap: 12,
    borderWidth: 1.5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 10,
    elevation: 2,
  },
  filterBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 14,
    paddingHorizontal: 16,
    height: 46,
    gap: 10,
    borderWidth: 1.5,
    borderStyle: 'dashed',
  },
  searchField: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
  },
  listContainer: {
    paddingHorizontal: 20,
    paddingBottom: 40,
    gap: 16,
  },
  card: {
    padding: 20,
    borderRadius: 28,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.05,
    shadowRadius: 20,
    elevation: 4,
    borderWidth: 1,
    borderColor: 'rgba(226, 232, 240, 0.8)',
  },
  cardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 18,
  },
  avatarWrapper: {
    marginRight: 15,
  },
  avatarBorder: {
    width: 58,
    height: 58,
    borderRadius: 24,
    borderWidth: 2,
    padding: 3,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarImage: {
    width: '100%',
    height: '100%',
    borderRadius: 18,
    resizeMode: 'cover',
  },
  avatarPlaceholder: {
    width: '100%',
    height: '100%',
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarInitial: {
    fontSize: 20,
    fontWeight: '900',
  },
  headerInfo: {
    flex: 1,
  },
  farmerNameText: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 4,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 2,
    flexWrap: 'wrap',
  },
  phoneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  villageBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  villageText: {
    fontSize: 11,
    color: '#64748B',
    fontWeight: '700',
  },
  phoneText: {
    fontSize: 12,
    color: '#94A3B8',
    fontWeight: '600',
  },
  statusBadgeContainer: {
    alignItems: 'flex-end',
  },
  glassBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    gap: 6,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  badgeLabel: {
    fontSize: 11,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  badgeSuccess: {
    backgroundColor: '#F0FDF4',
  },
  badgeWarning: {
    backgroundColor: '#FFFBEB',
  },
  badgeOffline: {
    backgroundColor: '#EEF2FF',
  },
  badgeError: {
    backgroundColor: '#FEF2F2',
  },
  cardSeparator: {
    height: 1,
    backgroundColor: '#F1F5F9',
    marginBottom: 18,
  },
  statsGrid: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statBox: {
    flex: 1,
  },
  statLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: '#94A3B8',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  statValueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  statValue: {
    fontSize: 14,
    fontWeight: '700',
    color: '#334155',
  },
  statDivider: {
    width: 1,
    height: 30,
    backgroundColor: '#F1F5F9',
    marginHorizontal: 15,
  },
  mapHintBox: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#F8FAFC',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  emptyContainer: {
    alignItems: 'center',
    marginTop: 80,
    opacity: 0.6,
  },
  emptyText: {
    color: '#94A3B8',
    marginTop: 15,
    fontSize: 16,
    fontWeight: '700',
  },
  headerRightActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  notificationBell: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 5,
    elevation: 2,
    position: 'relative',
  },
  bellBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: '#EF4444',
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 4,
    borderWidth: 1.5,
    borderColor: '#fff',
  },
  bellBadgeText: {
    color: '#fff',
    fontSize: 8,
    fontWeight: '900',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.6)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    maxHeight: '80%',
    paddingBottom: 40,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 24,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#0F172A',
  },
  closeButton: {
    padding: 4,
  },
  requestList: {
    padding: 16,
  },
  requestItem: {
    backgroundColor: '#F8FAFC',
    borderRadius: 20,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  requestItemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  requestFarmerName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0F172A',
  },
  requestDate: {
    fontSize: 12,
    color: '#94A3B8',
    fontWeight: '600',
  },
  requestText: {
    fontSize: 14,
    color: '#475569',
    lineHeight: 20,
    marginBottom: 12,
  },
  requestFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  requestPhoneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  requestPhone: {
    fontSize: 13,
    color: '#64748B',
    fontWeight: '600',
  },
  completeActionBtn: {
    backgroundColor: '#10B981',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
  },
  completeActionText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '800',
  },
});
