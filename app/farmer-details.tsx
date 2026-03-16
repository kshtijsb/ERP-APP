import React, { useState, useEffect } from 'react';
import { StyleSheet, View, ScrollView, ActivityIndicator, Alert, TouchableOpacity, useColorScheme, Image, Linking, Platform } from 'react-native';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { ActionSheetProvider, useActionSheet } from '@expo/react-native-action-sheet';
import { useTranslation } from '@/context/language-context';
import MapView, { Polygon, Overlay } from 'react-native-maps';
import { supabase } from '@/lib/supabase';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors } from '@/constants/theme';
import { fetchNDVIOverlay, getHealthColor } from '@/lib/satellite-service';
import { getFarmerLocalById, deleteLocalRecordGeneric, getFieldNotesByFarmerId, getSoilHealthByFarmerId, getVisitLogsByFarmerId, saveVisitLogOffline, getTreatmentLogsByFarmerId, getActiveSchedulesByFarmerId } from '@/lib/offline-db';
import { useAuth } from '@/context/auth-context';
import { FieldNotesModal } from '@/components/FieldNotesModal';
import { SoilHealthModal } from '@/components/SoilHealthModal';
import { AiAdvisorModal } from '@/components/AiAdvisorModal';
import { TreatmentModal } from '@/components/TreatmentModal';
import { ScheduleModal } from '@/components/ScheduleModal';
import { fetchAndCacheWeather, parseWeatherData } from '@/lib/weather-service';
import { getVariety } from '@/constants/crops';

export default function FarmerDetailsScreen() {
  const { id } = useLocalSearchParams();
  const { t, locale } = useTranslation();
  const router = useRouter();
  const colorScheme = useColorScheme();
  const { role } = useAuth();
  const [farmer, setFarmer] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [healthData, setHealthData] = useState<any>(null);
  const [isNotesModalVisible, setIsNotesModalVisible] = useState(false);
  const [isSoilModalVisible, setIsSoilModalVisible] = useState(false);
  const [isAiModalVisible, setIsAiModalVisible] = useState(false);
  const [isTreatmentModalVisible, setIsTreatmentModalVisible] = useState(false);
  const [isScheduleModalVisible, setIsScheduleModalVisible] = useState(false);
  const [activities, setActivities] = useState<any[]>([]);
  const [weather, setWeather] = useState<any>(null);
  const [fetchingWeather, setFetchingWeather] = useState(false);
  const [refreshingActivities, setRefreshingActivities] = useState(false);

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
              id, name, phone_number, land_area, crop_type, variety, crop_duration, avatar_url,
              farms (*)
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

  const fetchActivities = async () => {
    if (!id) return;
    setRefreshingActivities(true);
    try {
      const farmerId = typeof id === 'string' ? id : '';
      
      // 1. Fetch Local Activities
      const localNotes = await getFieldNotesByFarmerId(farmerId);
      const localSoilHealth = await getSoilHealthByFarmerId(farmerId);
      const localVisits = await getVisitLogsByFarmerId(farmerId);
      const localTreatmentLogs = await getTreatmentLogsByFarmerId(farmerId);
      const localSchedules = await getActiveSchedulesByFarmerId(farmerId);

      let allNotes = [...localNotes];
      let allSoil = [...localSoilHealth];
      let allVisits = [...localVisits];
      let allTreatments = [...localTreatmentLogs];
      let allSchedules = [...localSchedules];

      // 2. Fetch Online Activities (if not local ID)
      if (!farmerId.startsWith('local_')) {
        const { data: remoteNotes } = await supabase.from('field_notes').select('*').eq('farmer_id', farmerId);
        if (remoteNotes) {
          const keys = new Set(allNotes.map(n => `${n.note}_${n.created_at}`));
          remoteNotes.forEach(rn => { if (!keys.has(`${rn.note}_${rn.created_at}`)) allNotes.push(rn); });
        }

        const { data: remoteSoil } = await supabase.from('soil_health').select('*').eq('farmer_id', farmerId);
        if (remoteSoil) {
          const keys = new Set(allSoil.map(s => `${s.ph}_${s.created_at}`));
          remoteSoil.forEach(rs => { if (!keys.has(`${rs.ph}_${rs.created_at}`)) allSoil.push(rs); });
        }

        const { data: remoteVisits } = await supabase.from('visit_logs').select('*').eq('farmer_id', farmerId);
        if (remoteVisits) {
          const keys = new Set(allVisits.map(v => `${v.purpose}_${v.visit_date}`));
          remoteVisits.forEach(rv => { if (!keys.has(`${rv.purpose}_${rv.visit_date}`)) allVisits.push(rv); });
        }

        const { data: remoteTreatments } = await supabase.from('treatment_logs').select('*').eq('farmer_id', farmerId);
        if (remoteTreatments) {
          const keys = new Set(allTreatments.map(t => `${t.product_name}_${t.application_date}`));
          remoteTreatments.forEach(rt => { if (!keys.has(`${rt.product_name}_${rt.application_date}`)) allTreatments.push(rt); });
        }

        const { data: remoteSchedules } = await supabase.from('schedules').select('*').eq('farmer_id', farmerId);
        if (remoteSchedules) {
          const keys = new Set(allSchedules.map(s => `${s.title}_${s.start_date}`));
          remoteSchedules.forEach(rs => { if (!keys.has(`${rs.title}_${rs.start_date}`)) allSchedules.push(rs); });
        }
      }

      const combined = [
        ...allNotes.map(n => ({ ...n, type: 'note' as const })),
        ...allSoil.map(s => ({ ...s, type: 'soil' as const })),
        ...allVisits.map(v => ({ ...v, type: 'visit' as const })),
        ...allTreatments.map(t => ({ ...t, type: 'treatment' as const })),
        ...allSchedules.map(s => ({ ...s, type: 'schedule' as const }))
      ].sort((a: any, b: any) => {
        const dateA = new Date(a.created_at || a.visit_date || a.application_date || a.start_date).getTime();
        const dateB = new Date(b.created_at || b.visit_date || b.application_date || b.start_date).getTime();
        return dateB - dateA;
      });

      setActivities(combined);
    } catch (e) {
      console.error('Failed to fetch activities:', e);
    } finally {
      setRefreshingActivities(false);
    }
  };

  useEffect(() => {
    fetchActivities();
  }, [id]);

  useEffect(() => {
    if (farmer && farm?.boundary) {
      const parsed = getParsedBoundary(farm.boundary);
      if (parsed.length > 0) {
        const { latitude, longitude } = parsed[0];
        // Only fetch if no cached weather or it's older than 4 hours
        const cachedWeather = parseWeatherData(farmer.weather_data);
        const lastFetch = farmer.last_weather_fetch ? new Date(farmer.last_weather_fetch).getTime() : 0;
        const now = Date.now();
        
        if (!cachedWeather || (now - lastFetch > 4 * 60 * 60 * 1000)) {
          handleRefreshWeather(latitude, longitude);
        } else {
          setWeather(cachedWeather);
        }
      }
    }
  }, [farmer]);

  const handleRefreshWeather = async (lat?: number, lon?: number) => {
    if (!farmer) return;
    let latitude = lat;
    let longitude = lon;

    if (!latitude || !longitude) {
      const parsed = getParsedBoundary(farm?.boundary);
      if (parsed.length > 0) {
        latitude = parsed[0].latitude;
        longitude = parsed[0].longitude;
      }
    }

    if (!latitude || !longitude) return;

    setFetchingWeather(true);
    try {
      const data = await fetchAndCacheWeather(farmer.id.toString(), latitude, longitude);
      setWeather(data);
    } catch (e) {
      console.error('Weather fetch fail:', e);
    } finally {
      setFetchingWeather(false);
    }
  };

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

    const message = `🌱 *${t('healthReportTitle')}* 🌱\n\n` +
      `*${t('farmerLabel')}:* ${farmer.name}\n` +
      `*${t('plotID')}:* ${farmer.id.toString().slice(0, 8).toUpperCase()}\n` +
      `*${t('vegIndex')}:* ${healthData.status} (${Math.round(healthData.healthScore * 100)}%)\n` +
      `*${t('statusLabel')}:* ${healthData.isProduction ? (locale === 'en' ? 'Live Satellite Verified' : 'थेट सॅटेलाइट द्वारे सत्यापित') : (locale === 'en' ? 'Field Analysis Done' : 'क्षेत्र विश्लेषण पूर्ण झाले')}\n` +
      `*${t('lastScan')}:* ${healthData.lastUpdated}\n\n` +
      `_${t('downloadAppNotice')}_`;

    const whatsappUrl = `whatsapp://send?phone=${farmer.phone_number}&text=${encodeURIComponent(message)}`;
    
    Linking.canOpenURL(whatsappUrl).then(supported => {
      if (supported) {
        Linking.openURL(whatsappUrl);
      } else {
        Alert.alert('Error', 'WhatsApp is not installed on this device.');
      }
    });
  };

  const handleSharePrescription = async () => {
    if (!farmer) return;

    const latestNote = activities.find(a => a.type === 'note')?.note || 'No specific notes recorded today.';
    const soilSummary = activities.find(a => a.type === 'soil') 
      ? `Soil pH: ${activities.find(a => a.type === 'soil').ph}, NPK levels recorded.` 
      : 'Soil tests pending.';

    const varietyConfig = farmer.variety ? getVariety(farmer.crop_type, farmer.variety) : null;
    const varietyAdvice = varietyConfig?.advice ? `\n💡 *Note for ${farmer.variety}*: ${varietyConfig.advice}` : '';

    const message = `*${t('digitalPrescriptionTitle')}*\n\n` +
      `${locale === 'en' ? 'Hello' : 'नमस्कार'} ${farmer.name},\n` +
      `${locale === 'en' ? 'Advice for your' : 'तुमच्या'} *${farmer.crop_type}* ${farmer.variety ? `(${farmer.variety})` : ''} ${locale === 'en' ? 'plot' : 'प्लॉटसाठी सल्ला'}:\n\n` +
      `📌 *${t('observationLabel')}*: ${latestNote}\n` +
      `🧪 *${t('soilStatusLabel')}*: ${soilSummary}\n` +
      `${varietyAdvice}\n\n` +
      `✅ *${t('recommendation')}*: ${t('visitShopNotice')}\n\n` +
      `${t('happyFarming')} 🚜`;

    const url = `whatsapp://send?phone=${farmer.phone_number?.replace(/\D/g, '')}&text=${encodeURIComponent(message)}`;

    try {
      const supported = await Linking.canOpenURL(url);
      if (supported) {
        await Linking.openURL(url);
      } else {
        Alert.alert('Sharing Failed', 'WhatsApp is not installed on this device.');
      }
    } catch (e) {
      Alert.alert('Error', 'Could not open WhatsApp.');
    }
  };

  const handleQuickVisit = () => {
    Alert.alert(
      'Log Quick Visit',
      'This will record a farm visit for today without any additional notes or soil tests.',
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Log Visit', 
          onPress: async () => {
            try {
              await saveVisitLogOffline({
                farmer_id: typeof id === 'string' ? id : '',
                purpose: 'Routine Check-in'
              });
              Alert.alert('Success', 'Visit logged successfully');
              fetchActivities();
            } catch (e) {
              Alert.alert('Error', 'Failed to log visit');
            }
          }
        }
      ]
    );
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
                await deleteLocalRecordGeneric('pending_farmers', localId);
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
        <View style={styles.avatarWrapperContainer}>
          <View style={[styles.avatarContainer, { borderColor: Colors[colorScheme ?? 'light'].tint + '20' }]}>
            {farmer.avatar_url || farmer.avatar_uri ? (
              <Image 
                source={{ uri: farmer.avatar_url || farmer.avatar_uri }} 
                style={styles.avatarImage} 
              />
            ) : (
              <View style={[styles.avatarPlaceholder, { backgroundColor: Colors[colorScheme ?? 'light'].tint + '10' }]}>
                <ThemedText style={[styles.avatarText, { color: Colors[colorScheme ?? 'light'].tint }]}>
                  {farmer.name[0].toUpperCase()}
                </ThemedText>
              </View>
            )}
          </View>
          <View style={[styles.badgeOverlay, { backgroundColor: '#22C55E' }]}>
            <IconSymbol name="checkmark.seal.fill" size={14} color="#fff" />
          </View>
        </View>

        <ThemedText type="title" style={styles.profileName}>{farmer.name}</ThemedText>
        <View style={styles.metaRow}>
          <IconSymbol name="phone.fill" size={12} color="#94A3B8" />
          <ThemedText style={styles.profileMeta}>{farmer.phone_number || 'No contact info'}</ThemedText>
        </View>

        {weather && (
          <View style={styles.weatherBadge}>
            <IconSymbol 
              name={weather.condition.includes('Sunny') ? 'sun.max.fill' : 'cloud.fill'} 
              size={14} 
              color="#F59E0B" 
            />
            <ThemedText style={styles.weatherText}>
              {weather.temp}°C • {weather.condition}
            </ThemedText>
            <TouchableOpacity onPress={() => handleRefreshWeather()} disabled={fetchingWeather}>
              {fetchingWeather ? (
                <ActivityIndicator size="small" color="#F59E0B" />
              ) : (
                <IconSymbol name="arrow.clockwise" size={12} color="#94A3B8" />
              )}
            </TouchableOpacity>
          </View>
        )}
      </ThemedView>

      <View style={styles.section}>
        <ThemedText style={styles.sectionTitle}>{t('farmBoundary')}</ThemedText>
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
                {typeof id === 'string' && id.startsWith('local_') ? t('offlineRecord') : t('syncedLive')}
              </ThemedText>
            </View>
            <View style={styles.tapToExpand}>
              <IconSymbol name="plus.magnifyingglass" size={12} color="#fff" />
              <ThemedText style={styles.tapToExpandText}>{t('tapToViewMap')}</ThemedText>
            </View>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity 
            style={[styles.emptyMapContainer, { backgroundColor: colorScheme === 'dark' ? '#1E293B' : '#F1F5F9' }]}
            onPress={() => router.push({ 
              pathname: '/map', 
              params: { 
                farmerId: farmer.id, 
                farmerName: farmer.name,
                isOffline: typeof id === 'string' && id.startsWith('local_') ? 'true' : 'false'
              } 
            })}
          >
            <IconSymbol name="map.fill" size={32} color="#94A3B8" />
            <ThemedText style={styles.emptyMapText}>{t('noBoundary')}</ThemedText>
            <ThemedText style={styles.emptyMapAction}>{t('tapToMap')}</ThemedText>
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <ThemedText style={styles.sectionTitle}>{t('infoDetails')}</ThemedText>
        </View>
        <View style={styles.grid}>
          <InfoCard label={t('contactNumber')} value={farmer.phone_number || 'Not provided'} icon="phone.fill" color="#3B82F6" />
          <InfoCard label={t('landArea')} value={farmer.land_area ? `${farmer.land_area} Acres` : 'Not specified'} icon="square.dashed" color="#F59E0B" />
          <InfoCard label={t('selectCrop')} value={farmer.variety ? `${farmer.crop_type} (${farmer.variety})` : (farmer.crop_type || 'Direct entry pending')} icon="leaf.fill" color="#10B981" />
          <InfoCard label={t('cycleDuration')} value={farmer.crop_duration || 'Unknown'} icon="calendar" color="#8B5CF6" />
        </View>
      </View>

      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <ThemedText style={styles.sectionTitle}>{t('satelliteHealth')}</ThemedText>
          {analyzing && <ActivityIndicator size="small" color={Colors[colorScheme ?? 'light'].tint} />}
        </View>
        
        {healthData ? (
          <ThemedView style={[styles.healthCard, { backgroundColor: Colors[colorScheme ?? 'light'].card }]}>
            <View style={styles.healthRow}>
              <View style={[styles.healthIndicator, { backgroundColor: getHealthColor(healthData.healthScore) }]} />
              <View style={styles.healthTextCol}>
                <View style={styles.healthHeaderRow}>
                  <ThemedText style={styles.healthStatusLabel}>
                    {t('vegIndex')}: <ThemedText style={{ color: getHealthColor(healthData.healthScore), fontWeight: '900' }}>{healthData.status}</ThemedText>
                  </ThemedText>
                  <View style={[styles.liveBadge, { backgroundColor: healthData.isProduction ? '#10B98120' : '#64748B20' }]}>
                    <ThemedText style={[styles.liveBadgeText, { color: healthData.isProduction ? '#10B981' : '#64748B' }]}>
                      {healthData.isProduction ? 'LIVE SAT' : 'MOCK'}
                    </ThemedText>
                  </View>
                </View>
                <ThemedText style={styles.healthSub}>{t('lastScan')}: {healthData.lastUpdated}</ThemedText>
              </View>
              <ThemedText style={styles.healthPercentage}>{Math.round(healthData.healthScore * 100)}%</ThemedText>
            </View>
            <ThemedText style={styles.healthDescription}>
              {t('satelliteAnalysis')}
              {healthData.isProduction 
                ? ` ${t('realTimeNotice')}`
                : ' (Simulation mode based on seeded geographic data)'}
            </ThemedText>
          </ThemedView>
        ) : (
          <View style={styles.pendingAnalysis}>
            <IconSymbol name="eye.fill" size={24} color="#94A3B8" />
            <ThemedText style={styles.pendingText}>{analyzing ? t('scanningSatellite') : t('mapToEnable')}</ThemedText>
          </View>
        )}
      </View>

      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <ThemedText style={styles.sectionTitle}>{t('marketingSharing')}</ThemedText>
        </View>
        <TouchableOpacity 
          style={[styles.shareCard, { backgroundColor: '#25D366' + '15', borderColor: '#25D366' }]}
          onPress={handleShareReport}
        >
          <IconSymbol name="paperplane.fill" size={24} color="#128C7E" />
          <View style={{ flex: 1 }}>
            <ThemedText style={styles.shareTitle}>{t('shareWithFarmer')}</ThemedText>
            <ThemedText style={styles.shareSub}>{t('sendWhatsApp')}</ThemedText>
          </View>
          <IconSymbol name="chevron.right" size={16} color="#128C7E" />
        </TouchableOpacity>
      </View>

      <View style={styles.actionSection}>
        <TouchableOpacity 
          style={[styles.remapButton, { borderColor: Colors[colorScheme ?? 'light'].tint }]}
          onPress={() => router.push({ 
            pathname: '/map', 
            params: { 
              farmerId: farmer.id, 
              farmerName: farmer.name,
              isOffline: typeof id === 'string' && id.startsWith('local_') ? 'true' : 'false'
            } 
          })}
        >
          <IconSymbol name="arrow.triangle.2.circlepath" size={18} color={Colors[colorScheme ?? 'light'].tint} />
          <ThemedText style={[styles.remapButtonText, { color: Colors[colorScheme ?? 'light'].tint }]}>
            {hasMap ? t('updateBoundary') : t('mapFarmBoundary')}
          </ThemedText>
        </TouchableOpacity>

        <TouchableOpacity 
          style={[styles.addNoteButton, { backgroundColor: Colors[colorScheme ?? 'light'].tint + '10', borderColor: Colors[colorScheme ?? 'light'].tint }]}
          onPress={() => setIsNotesModalVisible(true)}
        >
          <IconSymbol name="plus.circle.fill" size={18} color={Colors[colorScheme ?? 'light'].tint} />
          <ThemedText style={[styles.addNoteButtonText, { color: Colors[colorScheme ?? 'light'].tint }]}>
            {t('addFieldObservation')}
          </ThemedText>
        </TouchableOpacity>

        <TouchableOpacity 
          style={[styles.addSoilButton, { backgroundColor: Colors[colorScheme ?? 'light'].tint + '10', borderColor: Colors[colorScheme ?? 'light'].tint }]}
          onPress={() => setIsSoilModalVisible(true)}
        >
          <IconSymbol name="testtube.2" size={18} color={Colors[colorScheme ?? 'light'].tint} />
          <ThemedText style={[styles.addSoilButtonText, { color: Colors[colorScheme ?? 'light'].tint }]}>
            {t('addSoilTest')}
          </ThemedText>
        </TouchableOpacity>

        <TouchableOpacity 
          style={[styles.quickVisitButton, { borderColor: '#6366F1' }]}
          onPress={handleQuickVisit}
        >
          <IconSymbol name="person.fill.checkmark" size={18} color="#6366F1" />
          <ThemedText style={[styles.quickVisitButtonText, { color: '#6366F1' }]}>
            {t('logQuickVisit')}
          </ThemedText>
        </TouchableOpacity>

        <TouchableOpacity 
          style={[styles.aiAdvisorButton, { backgroundColor: '#F0F9FF', borderColor: Colors[colorScheme ?? 'light'].tint }]}
          onPress={() => setIsAiModalVisible(true)}
        >
          <View style={[styles.aiIconBadge, { backgroundColor: Colors[colorScheme ?? 'light'].tint }]}>
            <ThemedText style={styles.aiIconText}>AI</ThemedText>
          </View>
          <ThemedText style={[styles.aiAdvisorButtonText, { color: Colors[colorScheme ?? 'light'].tint }]}>
            {t('consultAI')}
          </ThemedText>
        </TouchableOpacity>

        <View style={styles.actionRowSplit}>
          <TouchableOpacity 
            style={[styles.splitButton, { backgroundColor: '#E0F2FE', borderColor: '#0EA5E9' }]}
            onPress={handleSharePrescription}
          >
            <IconSymbol name="paperplane.fill" size={16} color="#0EA5E9" />
            <ThemedText style={[styles.splitButtonText, { color: '#0EA5E9' }]}>
              {t('sharePrescription')}
            </ThemedText>
          </TouchableOpacity>

          <TouchableOpacity 
            style={[styles.splitButton, { backgroundColor: '#F0FDF4', borderColor: '#22C55E' }]}
            onPress={() => setIsTreatmentModalVisible(true)}
          >
            <IconSymbol name="pencil" size={16} color="#22C55E" />
            <ThemedText style={[styles.splitButtonText, { color: '#22C55E' }]}>
              {t('recordInput')}
            </ThemedText>
          </TouchableOpacity>

          <TouchableOpacity 
            style={[styles.splitButton, { backgroundColor: '#EEF2FF', borderColor: '#6366F1' }]}
            onPress={() => setIsScheduleModalVisible(true)}
          >
            <IconSymbol name="calendar.badge.plus" size={16} color="#6366F1" />
            <ThemedText style={[styles.splitButtonText, { color: '#6366F1' }]}>
              {t('planSchedule')}
            </ThemedText>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <ThemedText style={styles.sectionTitle}>Field Activity Timeline</ThemedText>
          {refreshingActivities && <ActivityIndicator size="small" color={Colors[colorScheme ?? 'light'].tint} />}
        </View>

        {activities.length > 0 ? (
          <View style={styles.timeline}>
            {activities.map((activity, index) => (
              <ActivityItem key={index} activity={activity} isLast={index === activities.length - 1} />
            ))}
          </View>
        ) : (
          <View style={styles.emptyTimeline}>
            <IconSymbol name="list.bullet.indent" size={24} color="#94A3B8" />
            <ThemedText style={styles.emptyTimelineText}>No recent field activities logged.</ThemedText>
          </View>
        )}
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
      <FieldNotesModal 
        isVisible={isNotesModalVisible}
        onClose={() => setIsNotesModalVisible(false)}
        farmerId={typeof id === 'string' ? id : ''}
        onSave={fetchActivities}
      />

      <SoilHealthModal 
        isVisible={isSoilModalVisible}
        onClose={() => setIsSoilModalVisible(false)}
        farmerId={typeof id === 'string' ? id : ''}
        onSave={fetchActivities}
      />

      <AiAdvisorModal
        isVisible={isAiModalVisible}
        onClose={() => setIsAiModalVisible(false)}
        soilData={activities.find(a => a.type === 'soil') || null}
        notes={activities.filter(a => a.type === 'note').map(a => a.note)}
        cropType={farmer.crop_type || 'General'}
      />

      <TreatmentModal
        isVisible={isTreatmentModalVisible}
        onClose={() => setIsTreatmentModalVisible(false)}
        farmerId={typeof id === 'string' ? id : ''}
        onSave={fetchActivities}
      />

      <ScheduleModal
        visible={isScheduleModalVisible}
        onClose={() => setIsScheduleModalVisible(false)}
        farmerId={typeof id === 'string' ? id : ''}
        onSuccess={fetchActivities}
      />
    </ScrollView>
  );
}

function ActivityItem({ activity, isLast }: { activity: any; isLast: boolean }) {
  const colorScheme = useColorScheme();
  
  const getIcon = () => {
    switch (activity.type) {
      case 'note': return 'text.bubble.fill';
      case 'soil': return 'testtube.2';
      case 'visit': return 'person.fill.checkmark';
      case 'treatment': return 'pencil';
      case 'schedule': return 'calendar';
      default: return 'circle.fill';
    }
  };

  const getColor = () => {
    switch (activity.type) {
      case 'note': return '#3B82F6';
      case 'soil': return '#10B981';
      case 'visit': return '#6366F1';
      case 'treatment': return '#22C55E';
      case 'schedule': return '#8B5CF6';
      default: return '#94A3B8';
    }
  };

  const formattedDate = new Date(activity.created_at || activity.visit_date || activity.application_date || activity.start_date).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });

  return (
    <View style={styles.activityItem}>
      <View style={styles.activityLeft}>
        <View style={[styles.activityIcon, { backgroundColor: getColor() + '15' }]}>
          <IconSymbol name={getIcon()} size={14} color={getColor()} />
        </View>
        {!isLast && <View style={styles.activityLine} />}
      </View>
      <View style={styles.activityRight}>
        <ThemedText style={styles.activityDate}>{formattedDate}</ThemedText>
        <ThemedText style={styles.activityContent}>
          {activity.type === 'note' && activity.note}
          {activity.type === 'soil' && `Soil Test: pH ${activity.ph}, N: ${activity.nitrogen}, P: ${activity.phosphorus}, K: ${activity.potassium}`}
          {activity.type === 'visit' && activity.purpose}
          {activity.type === 'treatment' && `Input Application: ${activity.product_name} (${activity.quantity || 'Quantity not specified'})`}
          {activity.type === 'schedule' && `New Schedule: ${activity.title} (${activity.frequency})`}
        </ThemedText>
        {activity.image_uri && (
          <Image source={{ uri: activity.image_uri }} style={styles.activityImage} />
        )}
      </View>
    </View>
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
    paddingVertical: 45,
    paddingHorizontal: 20,
    backgroundColor: 'transparent',
  },
  avatarWrapperContainer: {
    position: 'relative',
    marginBottom: 20,
  },
  avatarContainer: {
    width: 110,
    height: 110,
    borderRadius: 55,
    borderWidth: 3,
    padding: 6,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    backgroundColor: '#fff',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.1,
    shadowRadius: 15,
    elevation: 6,
  },
  badgeOverlay: {
    position: 'absolute',
    bottom: 0,
    right: 5,
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 3,
    borderColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4,
  },
  avatarPlaceholder: {
    width: '100%',
    height: '100%',
    borderRadius: 45,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarImage: {
    width: '100%',
    height: '100%',
    borderRadius: 45,
    resizeMode: 'cover',
  },
  avatarText: {
    fontSize: 44,
    fontWeight: '900',
  },
  profileName: {
    fontSize: 32,
    fontWeight: '900',
    color: '#0F172A',
    textAlign: 'center',
    letterSpacing: -0.5,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 8,
  },
  profileMeta: {
    fontSize: 14,
    color: '#64748B',
    fontWeight: '700',
  },
  weatherBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    marginTop: 12,
    gap: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  weatherText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#475569',
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
  addNoteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 18,
    borderRadius: 20,
    borderWidth: 2,
    gap: 10,
    marginTop: 12,
  },
  addNoteButtonText: {
    fontSize: 16,
    fontWeight: '800',
  },
  addSoilButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 18,
    borderRadius: 20,
    borderWidth: 2,
    gap: 10,
    marginTop: 12,
  },
  addSoilButtonText: {
    fontSize: 16,
    fontWeight: '800',
  },
  quickVisitButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 18,
    borderRadius: 20,
    borderWidth: 2,
    gap: 10,
    marginTop: 12,
    borderStyle: 'dashed',
  },
  quickVisitButtonText: {
    fontSize: 16,
    fontWeight: '800',
  },
  aiAdvisorButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 18,
    borderRadius: 20,
    borderWidth: 2,
    gap: 10,
    marginTop: 12,
  },
  aiIconBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  aiIconText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '900',
  },
  aiAdvisorButtonText: {
    fontSize: 16,
    fontWeight: '800',
  },
  actionRowSplit: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 12,
  },
  splitButton: {
    flex: 1,
    paddingVertical: 18,
    paddingHorizontal: 8,
    borderRadius: 20,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  splitButtonText: {
    fontSize: 11,
    fontWeight: '900',
    textAlign: 'center',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  timeline: {
    marginTop: 10,
    paddingLeft: 10,
  },
  activityItem: {
    flexDirection: 'row',
    gap: 15,
  },
  activityLeft: {
    alignItems: 'center',
  },
  activityIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1,
  },
  activityLine: {
    width: 2,
    flex: 1,
    backgroundColor: '#E2E8F0',
    marginVertical: 2,
  },
  activityRight: {
    flex: 1,
    paddingBottom: 25,
  },
  activityDate: {
    fontSize: 12,
    color: '#94A3B8',
    fontWeight: '700',
    marginBottom: 4,
  },
  activityContent: {
    fontSize: 14,
    color: '#334155',
    lineHeight: 20,
    fontWeight: '500',
  },
  activityImage: {
    width: '100%',
    height: 150,
    borderRadius: 12,
    marginTop: 10,
  },
  emptyTimeline: {
    padding: 30,
    alignItems: 'center',
    gap: 10,
    opacity: 0.5,
  },
  emptyTimelineText: {
    fontSize: 14,
    fontWeight: '600',
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
