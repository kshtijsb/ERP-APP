import React, { useState, useEffect } from 'react';
import { StyleSheet, View, ScrollView, ActivityIndicator, Alert, TouchableOpacity, useColorScheme, Image, Linking } from 'react-native';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import MapView, { Polygon, Overlay } from 'react-native-maps';
import { supabase } from '@/lib/supabase';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors } from '@/constants/theme';
import { fetchNDVIOverlay, getHealthColor } from '@/lib/satellite-service';
import { getFarmerLocalById, deleteLocalRecord } from '@/lib/offline-db';
import { useAuth } from '@/context/auth-context';

export default function FarmerDetailsScreen() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const colorScheme = useColorScheme();
  const { role } = useAuth();
  const [farmer, setFarmer] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [healthData, setHealthData] = useState<any>(null);

  useEffect(() => {
    const fetchFarmerDetails = async () => {
      try {
        if (typeof id === 'string' && id.startsWith('local_')) {
          // Fetch from SQLite for offline records
          const localId = parseInt(id.replace('local_', ''));
          const data = await getFarmerLocalById(localId);
          if (!data) throw new Error('Offline record not found');
          setFarmer(data);
        } else {
          // Fetch from Supabase for online records
          const { data, error } = await supabase
            .from('farmers')
            .select(`
              *,
              farms (*),
              registrar:profiles!farmers_created_by_fkey(full_name, email)
            `)
            .eq('id', id)
            .single();

          if (error) throw error;
          setFarmer(data);
        }
      } catch (error: any) {
        Alert.alert('Error', 'Failed to load farmer details: ' + error.message);
        router.back();
      } finally {
        setLoading(false);
      }
    };

    fetchFarmerDetails();
  }, [id]);

  // Derived properties for farm mapping
  const farm = farmer ? (Array.isArray(farmer.farms) ? farmer.farms[0] : farmer.farms) : null;
  
  // Helper to get formatted boundary (handles string or object)
  const getParsedBoundary = (boundary: any) => {
    if (!boundary) return [];
    if (typeof boundary === 'string') {
      try {
        return JSON.parse(boundary);
      } catch (e) {
        console.error('Failed to parse boundary string:', e);
        return [];
      }
    }
    return boundary;
  };

  const parsedBoundary = getParsedBoundary(farm?.boundary);
  const hasMap = parsedBoundary && parsedBoundary.length > 0;

  const runHealthAnalysis = async () => {
    if (!hasMap) return;
    setAnalyzing(true);
    try {
      const data = await fetchNDVIOverlay(parsedBoundary, farmer.id);
      setHealthData(data);
    } catch (e) {
      console.error('Analysis error:', e);
    } finally {
      setAnalyzing(false);
    }
  };

  useEffect(() => {
    if (farmer && hasMap) {
      runHealthAnalysis();
    }
  }, [farmer, hasMap]);

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: Colors[colorScheme ?? 'light'].background }]}>
        <ActivityIndicator size="large" color={Colors[colorScheme ?? 'light'].tint} />
        <ThemedText>Optimizing view...</ThemedText>
      </View>
    );
  }

  if (!farmer) return null;


  const initialRegion = hasMap 
    ? {
        latitude: parsedBoundary[0].latitude,
        longitude: parsedBoundary[0].longitude,
        latitudeDelta: 0.005,
        longitudeDelta: 0.005,
      }
    : null;

  const handleShareReport = () => {
    if (!farmer || !healthData) return;

    const message = `🌱 *Krushikanchan Health Report* 🌱\n\n` +
      `*Farmer:* ${farmer.name}\n` +
      `*Plot ID:* ${farmer.id.toString().slice(0, 8).toUpperCase()}\n` +
      `*Vegetation Index:* ${healthData.status} (${Math.round(healthData.healthScore * 100)}%)\n` +
      `*Status:* ${healthData.isProduction ? 'Live Satellite Verified' : 'Field Analysis Done'}\n` +
      `*Last Scan:* ${healthData.lastUpdated}\n\n` +
      `_Download Krushikanchan to view your farm overlay!_`;

    const whatsappUrl = `whatsapp://send?phone=${farmer.phone_number}&text=${encodeURIComponent(message)}`;
    
    Linking.canOpenURL(whatsappUrl).then(supported => {
      if (supported) {
        Linking.openURL(whatsappUrl);
      } else {
        Alert.alert('Error', 'WhatsApp is not installed on this device.');
      }
    });
  };

  const handleDeleteProfile = () => {
    Alert.alert(
      'Delete Profile',
      'Are you sure you want to permanently remove this farmer and all their GIS data? This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Delete Permanently', 
          style: 'destructive',
          onPress: async () => {
            try {
              setLoading(true);
              if (typeof id === 'string' && id.startsWith('local_')) {
                const localId = parseInt(id.replace('local_', ''));
                await deleteLocalRecord(localId);
              } else {
                const { error } = await supabase
                  .from('farmers')
                  .delete()
                  .eq('id', id);
                if (error) throw error;
              }
              Alert.alert('Deleted', 'Farmer profile successfully removed.');
              router.replace('/(tabs)/explore');
            } catch (error: any) {
              Alert.alert('Error', 'Failed to delete profile: ' + error.message);
            } finally {
              setLoading(false);
            }
          }
        }
      ]
    );
  };

  return (
    <ScrollView 
      style={[styles.container, { backgroundColor: Colors[colorScheme ?? 'light'].background }]}
      contentContainerStyle={styles.contentContainer}
    >
      <Stack.Screen options={{ title: 'Farmer Profile', headerShadowVisible: false }} />
      
      <ThemedView style={styles.profileHero}>
        <View style={styles.avatarContainer}>
          {farmer.avatar_url ? (
            <Image source={{ uri: farmer.avatar_url }} style={styles.avatarImage} />
          ) : (
            <View style={[styles.avatarPlaceholder, { backgroundColor: Colors[colorScheme ?? 'light'].tint + '15' }]}>
              <ThemedText style={[styles.avatarText, { color: Colors[colorScheme ?? 'light'].tint }]}>
                {farmer.name[0].toUpperCase()}
              </ThemedText>
            </View>
          )}
        </View>
        <ThemedText type="title" style={styles.profileName}>{farmer.name}</ThemedText>
        <ThemedText style={styles.profileMeta}>ID: {farmer.id.toString().slice(0, 8).toUpperCase()}</ThemedText>
      </ThemedView>

      <View style={styles.section}>
        <ThemedText style={styles.sectionTitle}>Farm Boundary</ThemedText>
        {hasMap ? (
          <TouchableOpacity 
            style={styles.mapWrapper}
            onPress={() => router.push({ 
              pathname: '/map', 
              params: { 
                farmerId: farmer.id, 
                farmerName: farmer.name,
                initialBoundary: JSON.stringify(parsedBoundary),
                isOffline: typeof id === 'string' && id.startsWith('local_') ? 'true' : 'false'
              } 
            })}
          >
            <MapView
              style={styles.map}
              initialRegion={initialRegion!}
              mapType="hybrid"
              scrollEnabled={false}
              zoomEnabled={false}
            >
              <Polygon
                coordinates={parsedBoundary}
                fillColor="rgba(34, 197, 94, 0.4)"
                strokeColor="#22C55E"
                strokeWidth={3}
              />
              {healthData?.overlay?.image && (
                <Overlay 
                  image={{ uri: healthData.overlay.image }}
                  bounds={healthData.overlay.bounds}
                  opacity={0.6}
                />
              )}
            </MapView>
            <View style={styles.mapBadge}>
              <IconSymbol 
                name={typeof id === 'string' && id.startsWith('local_') ? 'clock.fill' : 'checkmark.seal.fill'} 
                size={12} 
                color="#fff" 
              />
              <ThemedText style={styles.mapBadgeText}>
                {typeof id === 'string' && id.startsWith('local_') ? 'Offline Record' : 'Synced & Live'}
              </ThemedText>
            </View>
            <View style={styles.tapToExpand}>
              <IconSymbol name="plus.magnifyingglass" size={12} color="#fff" />
              <ThemedText style={styles.tapToExpandText}>Tap to View Full Map</ThemedText>
            </View>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity 
            style={[styles.emptyMapContainer, { backgroundColor: colorScheme === 'dark' ? '#1E293B' : '#F1F5F9' }]}
            onPress={() => router.push({ pathname: '/map', params: { farmerId: farmer.id, farmerName: farmer.name } })}
          >
            <IconSymbol name="map.fill" size={32} color="#94A3B8" />
            <ThemedText style={styles.emptyMapText}>No boundary mapped yet.</ThemedText>
            <ThemedText style={styles.emptyMapAction}>Tap to Start Mapping</ThemedText>
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <ThemedText style={styles.sectionTitle}>Information Details</ThemedText>
        </View>
        <View style={styles.grid}>
          <InfoCard label="Contact Number" value={farmer.phone_number || 'Not provided'} icon="phone.fill" color="#3B82F6" />
          <InfoCard label="Land Area" value={farmer.land_area ? `${farmer.land_area} Acres` : 'Not specified'} icon="square.dashed" color="#F59E0B" />
          <InfoCard label="Main Crop" value={farmer.crop_type || 'Direct entry pending'} icon="leaf.fill" color="#10B981" />
          <InfoCard label="Cycle Duration" value={farmer.crop_duration || 'Unknown'} icon="calendar" color="#8B5CF6" />
          <InfoCard 
            label="Registered By" 
            value={farmer.registrar ? (farmer.registrar.full_name || farmer.registrar.email) : 'System Migrated'} 
            icon="person.badge.shield.checkmark.fill" 
            color="#6366F1" 
          />
        </View>
      </View>

      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <ThemedText style={styles.sectionTitle}>Satellite Crop Health (NDVI)</ThemedText>
          {analyzing && <ActivityIndicator size="small" color={Colors[colorScheme ?? 'light'].tint} />}
        </View>
        
        {healthData ? (
          <ThemedView style={[styles.healthCard, { backgroundColor: Colors[colorScheme ?? 'light'].card }]}>
            <View style={styles.healthRow}>
              <View style={[styles.healthIndicator, { backgroundColor: getHealthColor(healthData.healthScore) }]} />
              <View style={styles.healthTextCol}>
                <View style={styles.healthHeaderRow}>
                  <ThemedText style={styles.healthStatusLabel}>
                    Vegetation Index: <ThemedText style={{ color: getHealthColor(healthData.healthScore), fontWeight: '900' }}>{healthData.status}</ThemedText>
                  </ThemedText>
                  <View style={[styles.liveBadge, { backgroundColor: healthData.isProduction ? '#10B98120' : '#64748B20' }]}>
                    <ThemedText style={[styles.liveBadgeText, { color: healthData.isProduction ? '#10B981' : '#64748B' }]}>
                      {healthData.isProduction ? 'LIVE SAT' : 'MOCK'}
                    </ThemedText>
                  </View>
                </View>
                <ThemedText style={styles.healthSub}>Last Scan: {healthData.lastUpdated}</ThemedText>
              </View>
              <ThemedText style={styles.healthPercentage}>{Math.round(healthData.healthScore * 100)}%</ThemedText>
            </View>
            <ThemedText style={styles.healthDescription}>
              Satellite data shows {healthData.status.toLowerCase()} vegetation growth across the mapped perimeter. 
              {healthData.isProduction 
                ? ' This analysis is fetched in real-time from Sentinel-Hub imagery.'
                : ' (Simulation mode based on seeded geographic data)'}
            </ThemedText>
          </ThemedView>
        ) : (
          <View style={styles.pendingAnalysis}>
            <IconSymbol name="eye.fill" size={24} color="#94A3B8" />
            <ThemedText style={styles.pendingText}>{analyzing ? 'Scanning Satellite Data...' : 'Map boundary to enable health index.'}</ThemedText>
          </View>
        )}
      </View>

      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <ThemedText style={styles.sectionTitle}>Marketing & Sharing</ThemedText>
        </View>
        <TouchableOpacity 
          style={[styles.shareCard, { backgroundColor: '#25D366' + '15', borderColor: '#25D366' }]}
          onPress={handleShareReport}
        >
          <IconSymbol name="paperplane.fill" size={24} color="#128C7E" />
          <View style={{ flex: 1 }}>
            <ThemedText style={styles.shareTitle}>Share Analysis with Farmer</ThemedText>
            <ThemedText style={styles.shareSub}>Send professional health report via WhatsApp</ThemedText>
          </View>
          <IconSymbol name="chevron.right" size={16} color="#128C7E" />
        </TouchableOpacity>
      </View>

      <View style={styles.actionSection}>
        <TouchableOpacity 
          style={[styles.remapButton, { borderColor: Colors[colorScheme ?? 'light'].tint }]}
          onPress={() => router.push({ pathname: '/map', params: { farmerId: farmer.id, farmerName: farmer.name } })}
        >
          <IconSymbol name="arrow.triangle.2.circlepath" size={18} color={Colors[colorScheme ?? 'light'].tint} />
          <ThemedText style={[styles.remapButtonText, { color: Colors[colorScheme ?? 'light'].tint }]}>
            {hasMap ? 'Update Boundary' : 'Map Farm Boundary'}
          </ThemedText>
        </TouchableOpacity>
      </View>

      {role === 'superadmin' && (
        <View style={styles.dangerZone}>
          <ThemedText style={styles.dangerTitle}>Danger Zone</ThemedText>
          <TouchableOpacity 
            style={styles.deleteButton}
            onPress={handleDeleteProfile}
          >
            <IconSymbol name="trash.fill" size={18} color="#EF4444" />
            <ThemedText style={styles.deleteButtonText}>Permanently Delete Profile</ThemedText>
          </TouchableOpacity>
        </View>
      )}
    </ScrollView>
  );
}

function InfoCard({ label, value, icon, color }: { label: string; value: string; icon: any; color: string }) {
  const colorScheme = useColorScheme();
  return (
    <View style={[styles.infoCard, { backgroundColor: Colors[colorScheme ?? 'light'].card, borderColor: Colors[colorScheme ?? 'light'].border }]}>
      <View style={[styles.cardIcon, { backgroundColor: color + '15' }]}>
        <IconSymbol name={icon} size={18} color={color} />
      </View>
      <View style={styles.cardText}>
        <ThemedText style={styles.cardLabel}>{label}</ThemedText>
        <ThemedText type="defaultSemiBold" style={styles.cardValue}>{value}</ThemedText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  contentContainer: {
    paddingBottom: 40,
  },
  profileHero: {
    alignItems: 'center',
    paddingVertical: 35,
    paddingHorizontal: 20,
    backgroundColor: 'transparent',
  },
  avatarContainer: {
    width: 90,
    height: 90,
    borderRadius: 45,
    overflow: 'hidden',
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 3,
  },
  avatarPlaceholder: {
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
  avatarText: {
    fontSize: 40,
    fontWeight: '900',
  },
  profileName: {
    fontSize: 28,
    fontWeight: '900',
    color: '#0F172A',
    textAlign: 'center',
  },
  profileMeta: {
    fontSize: 13,
    color: '#94A3B8',
    marginTop: 6,
    fontWeight: '700',
    letterSpacing: 1,
  },
  section: {
    paddingHorizontal: 25,
    marginTop: 30,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#475569',
    letterSpacing: 0.2,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 15,
  },
  healthCard: {
    padding: 20,
    borderRadius: 24,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
  },
  healthRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 15,
    marginBottom: 12,
  },
  healthIndicator: {
    width: 45,
    height: 45,
    borderRadius: 22.5,
    borderWidth: 4,
    borderColor: '#F1F5F9',
  },
  healthTextCol: {
    flex: 1,
  },
  healthStatusLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: '#334155',
  },
  healthHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  liveBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  liveBadgeText: {
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  healthSub: {
    fontSize: 12,
    color: '#94A3B8',
    marginTop: 2,
  },
  healthPercentage: {
    fontSize: 22,
    fontWeight: '900',
    color: '#0F172A',
  },
  healthDescription: {
    fontSize: 13,
    color: '#64748B',
    lineHeight: 20,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  shareCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 20,
    borderRadius: 24,
    borderWidth: 1.5,
    gap: 15,
  },
  shareTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#064E3B',
  },
  shareSub: {
    fontSize: 12,
    color: '#15803D',
    marginTop: 2,
    fontWeight: '600',
  },
  pendingAnalysis: {
    padding: 30,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: 24,
    gap: 10,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    borderStyle: 'dashed',
  },
  pendingText: {
    fontSize: 14,
    color: '#94A3B8',
    fontWeight: '600',
  },
  mapWrapper: {
    height: 240,
    borderRadius: 24,
    overflow: 'hidden',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
  },
  map: {
    flex: 1,
  },
  mapBadge: {
    position: 'absolute',
    top: 15,
    right: 15,
    backgroundColor: 'rgba(15, 23, 42, 0.85)',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    gap: 6,
  },
  mapBadgeText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  emptyMapContainer: {
    height: 180,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: '#CBD5E1',
  },
  emptyMapText: {
    fontSize: 15,
    color: '#64748B',
    fontWeight: '600',
  },
  emptyMapAction: {
    fontSize: 14,
    color: '#15803D',
    fontWeight: '800',
  },
  grid: {
    gap: 12,
  },
  infoCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 20,
    borderWidth: 1.5,
    gap: 16,
  },
  cardIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cardText: {
    flex: 1,
  },
  cardLabel: {
    fontSize: 12,
    color: '#64748B',
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  cardValue: {
    fontSize: 17,
    color: '#0F172A',
    fontWeight: '800',
  },
  actionSection: {
    paddingHorizontal: 25,
    marginTop: 40,
  },
  remapButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 18,
    borderRadius: 20,
    borderWidth: 2,
    gap: 10,
    borderStyle: 'dashed',
  },
  remapButtonText: {
    fontSize: 16,
    fontWeight: '800',
  },
  dangerZone: {
    marginTop: 40,
    paddingHorizontal: 25,
    paddingTop: 20,
    borderTopWidth: 1,
    borderTopColor: '#FEE2E2',
  },
  dangerTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#EF4444',
    marginBottom: 12,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  deleteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 15,
    borderRadius: 15,
    backgroundColor: '#FEF2F2',
    borderWidth: 1.5,
    borderColor: '#FEE2E2',
    gap: 10,
  },
  deleteButtonText: {
    color: '#EF4444',
    fontSize: 14,
    fontWeight: '700',
  },
  tapToExpand: {
    position: 'absolute',
    bottom: 12,
    right: 12,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    gap: 4,
  },
  tapToExpandText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '700',
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 15,
  },
});
