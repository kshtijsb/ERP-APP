import React, { useState, useEffect, useCallback } from 'react';
import { StyleSheet, FlatList, RefreshControl, View, TextInput, TouchableOpacity, useColorScheme, Alert, ActivityIndicator, Image } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { getPendingFarmersWithFarms } from '@/lib/offline-db';
import { syncOfflineData } from '@/lib/sync-engine';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors } from '@/constants/theme';
import { useAuth } from '@/context/auth-context';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';

export default function FarmerDashboard() {
  const router = useRouter();
  const colorScheme = useColorScheme();
  const { signOut, user } = useAuth();
  const [farmers, setFarmers] = useState<any[]>([]);
  const [filteredFarmers, setFilteredFarmers] = useState<any[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterCrop, setFilterCrop] = useState('');
  const [exporting, setExporting] = useState(false);

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
          id, name, phone_number, land_area, crop_type, crop_duration,
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
        sync_status: rec.sync_status,
        is_offline: true
      }));

      const merged = [...formattedOffline, ...(onlineData || [])];
      setFarmers(merged);
      applyFilters(merged, searchQuery, filterCrop);
    } catch (error: any) {
      console.error('Error fetching farmers:', error.message);
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
      const fileName = `Krushikanchan_Data_${new Date().toISOString().split('T')[0]}.csv`;
      const fileUri = `${FileSystem.documentDirectory}${fileName}`;

      await FileSystem.writeAsStringAsync(fileUri, csvContent, { encoding: FileSystem.EncodingType.UTF8 });
      
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(fileUri, { mimeType: 'text/csv', dialogTitle: 'Export Krushikanchan Data' });
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
    
    return (
      <TouchableOpacity 
        style={[styles.card, { backgroundColor: Colors[colorScheme ?? 'light'].card, borderColor: Colors[colorScheme ?? 'light'].border }]}
        onPress={() => {
          console.log('Navigating to details for ID:', item.id);
          router.push({ pathname: '/farmer-details', params: { id: item.id } });
        }}
        activeOpacity={0.7}
      >
        <View style={styles.cardHeader}>
          <View style={styles.farmerInfo}>
            <View style={styles.initialCircle}>
              <View style={[styles.initialCircleInner, { backgroundColor: Colors[colorScheme ?? 'light'].tint + '15' }]}>
                <ThemedText style={[styles.initialText, { color: Colors[colorScheme ?? 'light'].tint }]}>
                  {item.name[0].toUpperCase()}
                </ThemedText>
              </View>
            </View>
            <View>
              <ThemedText type="defaultSemiBold" style={styles.farmerName}>{item.name}</ThemedText>
              <ThemedText type="default" style={styles.subText}>{item.phone_number || 'No contact info'}</ThemedText>
            </View>
          </View>
          <View style={styles.badgeColumn}>
            <ThemedView style={[
              styles.statusBadge, 
              item.is_offline ? styles.badgeOffline : (isMapped ? styles.badgeSuccess : styles.badgeWarning)
            ]}>
              <IconSymbol 
                name={item.is_offline ? 'arrow.triangle.2.circlepath' : (isMapped ? 'checkmark.seal.fill' : 'exclamationmark.triangle.fill')} 
                size={12} 
                color={item.is_offline ? '#6366F1' : (isMapped ? Colors[colorScheme ?? 'light'].success : Colors[colorScheme ?? 'light'].warning)} 
              />
              <ThemedText style={[
                styles.badgeText, 
                { color: item.is_offline ? '#6366F1' : (isMapped ? Colors[colorScheme ?? 'light'].success : Colors[colorScheme ?? 'light'].warning) }
              ]}>
                {item.is_offline ? (item.sync_status === 'syncing' ? 'Syncing...' : 'Offline') : (isMapped ? 'Mapped' : 'Pending')}
              </ThemedText>
            </ThemedView>
            {isMapped && !item.is_offline && (
              <View style={styles.mapIconHint}>
                <IconSymbol name="map.fill" size={14} color={Colors[colorScheme ?? 'light'].tint} />
                <ThemedText style={[styles.mapHintText, { color: Colors[colorScheme ?? 'light'].tint }]}>View Map</ThemedText>
              </View>
            )}
          </View>
        </View>
        
        <View style={styles.detailsGrid}>
          <View style={styles.gridItem}>
            <IconSymbol name="leaf.fill" size={14} color="#64748B" />
            <ThemedText style={styles.detailText}>{item.crop_type || 'N/A'}</ThemedText>
          </View>
          <View style={styles.gridItem}>
            <IconSymbol name="calendar" size={14} color="#64748B" />
            <ThemedText style={styles.detailText}>{item.crop_duration || 'N/A'}</ThemedText>
          </View>
          <View style={styles.gridItem}>
            <IconSymbol name="square.dashed" size={14} color="#64748B" />
            <ThemedText style={styles.detailText}>{item.land_area ? `${item.land_area} Ac` : 'N/A'}</ThemedText>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <ThemedView style={[styles.container, { backgroundColor: Colors[colorScheme ?? 'light'].background }]}>
      <ThemedView style={styles.heroSection}>
        <View style={styles.heroTop}>
          <View>
            <ThemedText type="title" style={[styles.heroTitle, { color: Colors[colorScheme ?? 'light'].tint }]}>Database Hub</ThemedText>
            <ThemedText type="default" style={styles.heroSubtitle}>Managing {farmers.length} Farmer Records</ThemedText>
          </View>
          <View style={styles.actionRow}>
            <TouchableOpacity 
              style={[styles.actionButton, { backgroundColor: Colors[colorScheme ?? 'light'].tint }]} 
              onPress={() => router.push('/global-map')}
            >
              <IconSymbol name="map.fill" size={16} color="#fff" />
              <ThemedText style={styles.actionButtonText}>Maps</ThemedText>
            </TouchableOpacity>
            <TouchableOpacity 
              style={[styles.actionButton, { backgroundColor: '#334155' }]} 
              onPress={handleExport}
              disabled={exporting}
            >
              {exporting ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <>
                  <IconSymbol name="square.and.arrow.up" size={16} color="#fff" />
                  <ThemedText style={styles.actionButtonText}>Export</ThemedText>
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </ThemedView>

      <View style={styles.searchSection}>
        <View style={[styles.searchBar, { borderColor: Colors[colorScheme ?? 'light'].border }]}>
          <IconSymbol name="magnifyingglass" size={18} color="#64748B" />
          <TextInput
            style={[styles.searchField, { color: Colors[colorScheme ?? 'light'].text }]}
            placeholder="Search name or phone..."
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
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  heroSection: {
    paddingTop: 60,
    paddingHorizontal: 25,
    paddingBottom: 25,
  },
  headerTitleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  logoutBtn: {
    padding: 10,
    borderRadius: 12,
    borderWidth: 1.5,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 34,
    fontWeight: '900',
    letterSpacing: -1,
  },
  headerSubtitle: {
    fontSize: 15,
    color: '#64748B',
    marginTop: 4,
    fontWeight: '500',
  },
  heroTitle: {
    fontSize: 34,
    fontWeight: '900',
    color: '#22C55E', // Match the new lighter Spring Green
    letterSpacing: -1,
  },
  heroSubtitle: {
    fontSize: 15,
    color: '#64748B',
    marginTop: 4,
    fontWeight: '500',
  },
  heroTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    flexWrap: 'wrap',
    gap: 10,
  },
  actionRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 5,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 14,
    gap: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 4,
  },
  actionButtonText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 13,
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
    fontSize: 16,
    fontWeight: '500',
  },
  listContainer: {
    paddingHorizontal: 20,
    paddingBottom: 40,
    gap: 16,
  },
  card: {
    padding: 20,
    borderRadius: 24,
    borderWidth: 1.5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.04,
    shadowRadius: 12,
    elevation: 3,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  farmerInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  initialCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    overflow: 'hidden',
  },
  initialCircleInner: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarImage: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  initialText: {
    fontSize: 20,
    fontWeight: '800',
  },
  farmerName: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0F172A',
  },
  subText: {
    fontSize: 14,
    color: '#64748B',
    marginTop: 2,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
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
  badgeText: {
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  badgeColumn: {
    alignItems: 'flex-end',
    gap: 8,
  },
  mapIconHint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    opacity: 0.8,
  },
  mapHintText: {
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  detailsGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: '#F8FAFC',
    borderRadius: 16,
    padding: 12,
  },
  gridItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  detailText: {
    fontSize: 13,
    color: '#334155',
    fontWeight: '700',
  },
  emptyContainer: {
    alignItems: 'center',
    marginTop: 100,
    opacity: 0.8,
  },
  emptyText: {
    color: '#94A3B8',
    marginTop: 15,
    fontSize: 16,
    fontWeight: '600',
  },
});
