import React, { useState, useEffect } from 'react';
import { StyleSheet, View, ScrollView, ActivityIndicator, Alert, TouchableOpacity, useColorScheme, Image, Linking, Platform, TextInput } from 'react-native';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { useActionSheet } from '@expo/react-native-action-sheet';
import { useTranslation } from '@/context/language-context';
import MapView, { Polygon, Overlay, UrlTile, PROVIDER_GOOGLE } from 'react-native-maps';
import { supabase } from '@/lib/supabase';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors } from '@/constants/theme';
import * as ImagePicker from 'expo-image-picker';
import { 
  getFarmerLocalById, 
  deleteLocalRecordGeneric, 
  getFieldNotesByFarmerId, 
  getSoilHealthByFarmerId, 
  getVisitLogsByFarmerId, 
  saveVisitLogOffline, 
  getTreatmentLogsByFarmerId, 
  getActiveSchedulesByFarmerId, 
  updateScheduleStatus, 
  saveTreatmentLogOffline, 
  getPrescriptionsByFarmerId, 
  savePrescriptionOffline 
} from '@/lib/offline-db';
import { syncOfflineData } from '@/lib/sync-engine';
import { useAuth } from '@/context/auth-context';
import { FieldNotesModal } from '@/components/FieldNotesModal';
import { SoilHealthModal } from '@/components/SoilHealthModal';
import { AiAdvisorModal } from '@/components/AiAdvisorModal';
import { TreatmentModal } from '@/components/TreatmentModal';
import { ScheduleModal } from '@/components/ScheduleModal';
import { PrescriptionModal } from '@/components/PrescriptionModal';
import { fetchAndCacheWeather, parseWeatherData } from '@/lib/weather-service';
import { getVariety } from '@/constants/crops';
import { predictiveRiskAnalysis } from '@/lib/ai-advisor-service';

export default function FarmerDetailsScreen() {
  const { id } = useLocalSearchParams();
  const { t, locale } = useTranslation();
  const router = useRouter();
  const colorScheme = useColorScheme();
  const { role } = useAuth();
  const { showActionSheetWithOptions } = useActionSheet();
  const [farmer, setFarmer] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [isNotesModalVisible, setIsNotesModalVisible] = useState(false);
  const [isSoilModalVisible, setIsSoilModalVisible] = useState(false);
  const [isAiModalVisible, setIsAiModalVisible] = useState(false);
  const [isTreatmentModalVisible, setIsTreatmentModalVisible] = useState(false);
  const [isScheduleModalVisible, setIsScheduleModalVisible] = useState(false);
  const [isPrescriptionModalVisible, setIsPrescriptionModalVisible] = useState(false);
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
              id, name, phone_number, land_area, crop_type, variety, crop_duration, avatar_url, village, address,
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
      const farmerId = Array.isArray(id) ? id[0] : (id ?? '');
      
      // 1. Fetch Local Activities
      const localNotes = await getFieldNotesByFarmerId(farmerId);
      const localSoilHealth = await getSoilHealthByFarmerId(farmerId);
      const localVisits = await getVisitLogsByFarmerId(farmerId);
      const localTreatmentLogs = await getTreatmentLogsByFarmerId(farmerId);
      const localSchedules = await getActiveSchedulesByFarmerId(farmerId);
      const localPrescriptions = await getPrescriptionsByFarmerId(farmerId);

      let allNotes = [...localNotes];
      let allSoil = [...localSoilHealth];
      let allVisits = [...localVisits];
      let allTreatments = [...localTreatmentLogs];
      let allSchedules = [...localSchedules];
      let allPrescriptions = [...localPrescriptions];

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

        const { data: remotePrescriptions } = await supabase.from('prescriptions').select('*').eq('farmer_id', farmerId);
        if (remotePrescriptions) {
          const keys = new Set(allPrescriptions.map(p => `${p.prescription_text}_${p.created_at}`));
          remotePrescriptions.forEach(rp => { if (!keys.has(`${rp.prescription_text}_${rp.created_at}`)) allPrescriptions.push(rp); });
        }

        const { data: remoteVisitRequests } = await supabase.from('visit_requests').select('*').eq('farmer_id', farmerId);
        if (remoteVisitRequests) {
          allVisits = [...allVisits, ...remoteVisitRequests.map(vr => ({ ...vr, type: 'visit_request' }))];
        }
      }

      const combined = [
        ...allNotes.map(n => ({ ...n, type: (n as any).type || 'note' as const })),
        ...allSoil.map(s => ({ ...s, type: (s as any).type || 'soil' as const })),
        ...allVisits.map(v => ({ ...v, type: (v as any).type || 'visit' as const })),
        ...allTreatments.map(t => ({ ...t, type: (t as any).type || 'treatment' as const })),
        ...allSchedules.map(s => ({ ...s, type: (s as any).type || 'schedule' as const })),
        ...allPrescriptions.map(p => ({ ...p, type: (p as any).type || 'prescription' as const }))
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

  const activeTasks = activities.filter(a => a.type === 'schedule' && a.status === 'active');

  const completeTask = async (activity: any) => {
    Alert.alert(
      'Mark Task Done',
      `Did you complete "${activity.title}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Complete', 
          onPress: async () => {
            try {
              setLoading(true);
              if (typeof activity.id === 'string' && !activity.id.startsWith('local_')) {
                await supabase.from('schedules').update({ status: 'completed' }).eq('id', activity.id);
              } else {
                const localId = typeof activity.id === 'string' ? parseInt(activity.id.replace('local_', '')) : activity.id;
                await updateScheduleStatus(localId, 'completed');
              }

              const isSpray = activity.title.toLowerCase().includes('spray') || activity.title.toLowerCase().includes('treatment');
              if (isSpray) {
                await saveTreatmentLogOffline({
                  farmer_id: typeof id === 'string' ? id : '',
                  product_name: activity.title,
                  quantity: 'As Scheduled',
                  application_date: new Date().toISOString()
                });
              } else {
                await saveVisitLogOffline({
                  farmer_id: typeof id === 'string' ? id : '',
                  purpose: `Completed: ${activity.title}`
                });
              }
              syncOfflineData();
              fetchActivities();
              Alert.alert('Success', 'Task marked as done!');
            } catch (e) {
              console.error(e);
              Alert.alert('Error', 'Failed to complete task');
            } finally {
              setLoading(false);
            }
          }
        }
      ]
    );
  };

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

  const handleOpenMenu = () => {
    const options = [t('shareDigitalPrescription'), t('logQuickVisit'), t('deleteProfile'), t('cancel')];
    const destructiveButtonIndex = 2;
    const cancelButtonIndex = 3;

    showActionSheetWithOptions(
      {
        options,
        cancelButtonIndex,
        destructiveButtonIndex,
        title: farmer?.name,
        message: 'Manage farmer record',
        userInterfaceStyle: colorScheme === 'dark' ? 'dark' : 'light',
      },
      (selectedIndex?: number) => {
        switch (selectedIndex) {
          case 0:
            handleSharePrescription();
            break;
          case 1:
            handleQuickVisit();
            break;
          case 2:
            handleDeleteProfile();
            break;
        }
      }
    );
  };

  return (
    <ScrollView 
      style={[styles.container, { backgroundColor: Colors[colorScheme ?? 'light'].background }]}
      contentContainerStyle={styles.contentContainer}
    >
      <Stack.Screen 
        options={{ 
          title: 'Farmer Profile', 
          headerShadowVisible: false,
          headerRight: () => (
            <TouchableOpacity onPress={handleOpenMenu} style={{ marginRight: 15 }}>
              <IconSymbol name="ellipsis.circle.fill" size={24} color={Colors[colorScheme ?? 'light'].tint} />
            </TouchableOpacity>
          )
        }} 
      />
      
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
          <View style={styles.metaItem}>
            <IconSymbol name="phone.fill" size={12} color="#94A3B8" />
            <ThemedText style={styles.profileMeta}>{farmer.phone_number || 'No contact'}</ThemedText>
          </View>
          {farmer.village && (
            <View style={[styles.metaItem, styles.villageBadge]}>
              <IconSymbol name="house.fill" size={12} color="#64748B" />
              <ThemedText style={styles.villageText}>{farmer.village}</ThemedText>
            </View>
          )}
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

      {weather && farmer && farmer.crop_type && (() => {
        const riskAnalysis = predictiveRiskAnalysis(weather, farmer.crop_type);
        if (riskAnalysis.risks.length === 0 && riskAnalysis.alerts.length === 0) return null;
        
        return (
          <View style={styles.section}>
            <ThemedText style={styles.sectionTitle}>⚠️ Smart Advisory Alerts</ThemedText>
            {riskAnalysis.alerts.map((alert, idx) => (
              <View key={`alert-${idx}`} style={[styles.riskCard, { backgroundColor: '#FEF2F2', borderColor: '#F87171' }]}>
                  <IconSymbol name="exclamationmark.triangle.fill" size={20} color="#DC2626" />
                  <ThemedText style={styles.riskText}>{alert}</ThemedText>
              </View>
            ))}
            {riskAnalysis.risks.map((risk, idx) => (
              <View key={`risk-${idx}`} style={[styles.riskCard, { backgroundColor: risk.riskLevel === 'high' ? '#FEF2F2' : '#FFFBEB', borderColor: risk.riskLevel === 'high' ? '#F87171' : '#FBBF24' }]}>
                  <View style={{ flex: 1 }}>
                    <ThemedText style={[styles.riskTitle, { color: risk.riskLevel === 'high' ? '#DC2626' : '#D97706' }]}>
                      {risk.type} Risk
                    </ThemedText>
                    <ThemedText style={styles.riskText}>{risk.description}</ThemedText>
                    <ThemedText style={styles.riskRec}>Idea: {risk.recommendation}</ThemedText>
                  </View>
              </View>
            ))}
          </View>
        );
      })()}

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
              provider={PROVIDER_GOOGLE}
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
          <InfoCard label={t('cycleDuration')} value={farmer.crop_duration || 'Unknown'} icon="calendar" color="#8B5CF6" />
        </View>

        {/* Multi-Crop List */}
        <View style={styles.cropListContainer}>
          <ThemedText style={styles.cropListTitle}>Registered Crops</ThemedText>
          <View style={styles.cropBadgeRow}>
            {farmer.crop_type?.split(', ').map((crop: string, idx: number) => {
              const varieties = farmer.variety?.split(', ') || [];
              const variety = varieties[idx] || 'General';
              return (
                <View key={idx} style={[styles.modernCropBadge, { backgroundColor: Colors[colorScheme ?? 'light'].tint + '10', borderColor: Colors[colorScheme ?? 'light'].tint + '30' }]}>
                  <IconSymbol name="leaf.fill" size={14} color={Colors[colorScheme ?? 'light'].tint} />
                  <ThemedText style={[styles.modernCropText, { color: colorScheme === 'dark' ? '#fff' : '#1E293B' }]}>
                    {crop} <ThemedText style={styles.modernVarietyText}>({variety})</ThemedText>
                  </ThemedText>
                </View>
              );
            })}
          </View>
        </View>
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
          <ThemedText style={styles.sectionTitle}>Today's Actionable Tasks</ThemedText>
        </View>
        {activeTasks.length > 0 ? (
          activeTasks.map((task, idx) => (
            <View key={idx} style={[styles.taskCard, { backgroundColor: Colors[colorScheme ?? 'light'].card, borderColor: Colors[colorScheme ?? 'light'].border }]}>
              <View style={styles.taskCardLeft}>
                <View style={[styles.taskIconBg, { backgroundColor: task.type === 'irrigation' ? '#3B82F615' : '#10B98115' }]}>
                  <IconSymbol name={task.type === 'irrigation' ? 'drop.fill' : 'bubbles.and.sparkles.fill'} size={18} color={task.type === 'irrigation' ? '#3B82F6' : '#10B981'} />
                </View>
                <View>
                  <ThemedText style={styles.taskTitle}>{task.title}</ThemedText>
                  <ThemedText style={styles.taskSub}>{task.frequency} • {task.type}</ThemedText>
                </View>
              </View>
              <TouchableOpacity style={styles.markDoneBtn} onPress={() => completeTask(task)}>
                <IconSymbol name="checkmark.circle.fill" size={24} color="#22C55E" />
              </TouchableOpacity>
            </View>
          ))
        ) : (
          <View style={[styles.emptyTaskCard, { backgroundColor: colorScheme === 'dark' ? '#1E293B' : '#F8FAFC' }]}>
            <IconSymbol name="checkmark.shield.fill" size={24} color="#94A3B8" />
            <ThemedText style={styles.emptyTaskText}>No pending tasks for today.</ThemedText>
          </View>
        )}
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
        currentWeather={weather}
      />

      <PrescriptionModal
        isVisible={isPrescriptionModalVisible}
        onClose={() => setIsPrescriptionModalVisible(false)}
        farmerId={typeof id === 'string' ? id : ''}
        onSave={fetchActivities}
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
      case 'prescription': return 'pills.fill';
      case 'visit_request': return 'megaphone.fill';
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
      case 'prescription': return '#6366F1';
      case 'visit_request': return '#F59E0B';
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
        <View style={[styles.activityIcon, { backgroundColor: activity.type === 'prescription' ? '#6366F1' : getColor() + '15' }]}>
          <IconSymbol name={getIcon() as any} size={14} color={activity.type === 'prescription' ? '#fff' : getColor()} />
        </View>
        {!isLast && <View style={styles.activityLine} />}
      </View>
      <View style={styles.activityRight}>
        <ThemedText style={styles.activityDate}>{formattedDate}</ThemedText>
        {activity.type === 'prescription' && (
          <View style={[styles.prescriptionBadge, { marginBottom: 6 }]}>
            <ThemedText style={styles.prescriptionBadgeText}>Expert Prescription</ThemedText>
          </View>
        )}
        <ThemedText style={styles.activityContent}>
          {activity.type === 'note' && activity.note}
          {activity.type === 'soil' && `Soil Test: pH ${activity.ph}, N: ${activity.nitrogen}, P: ${activity.phosphorus}, K: ${activity.potassium}`}
          {activity.type === 'visit' && (activity.purpose || 'Field Visit Conducted')}
          {activity.type === 'treatment' && `Applied: ${activity.product_name} (${activity.quantity})`}
          {activity.type === 'schedule' && `Task: ${activity.title} (${activity.type})`}
          {activity.type === 'prescription' && activity.prescription_text}
          {activity.type === 'visit_request' && (
            <View>
              <ThemedText style={{ fontWeight: '700', color: '#B45309' }}>Requested Field Visit</ThemedText>
              <ThemedText style={{ marginTop: 4 }}>Reason: {activity.request_text || 'No reason provided'}</ThemedText>
              <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4 }}>
                <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#F59E0B', marginRight: 6 }} />
                <ThemedText style={{ fontSize: 12, color: '#92400E', fontWeight: '600' }}>Status: {activity.status}</ThemedText>
              </View>
            </View>
          )}
          {activity.type === 'visit' && activity.purpose}
          {activity.type === 'treatment' && `Input Application: ${activity.product_name} (${activity.quantity || 'Quantity not specified'})`}
          {activity.type === 'schedule' && `New Schedule: ${activity.title} (${activity.frequency})`}
          {activity.type === 'prescription' && activity.prescription_text}
        </ThemedText>
        {(activity.image_uri || activity.image_url) && (
          <Image source={{ uri: activity.image_uri || activity.image_url }} style={styles.activityImage} />
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
        <ThemedText style={styles.cardLabel} numberOfLines={1}>{label}</ThemedText>
        <ThemedText type="defaultSemiBold" style={styles.cardValue} numberOfLines={1} adjustsFontSizeToFit>{value}</ThemedText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  taskCard: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  taskCardLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  taskIconBg: {
    width: 40,
    height: 40,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  taskTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#334155',
  },
  taskSub: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },
  markDoneBtn: {
    padding: 8,
  },
  emptyTaskCard: {
    padding: 24,
    borderRadius: 16,
    borderStyle: 'dashed',
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  emptyTaskText: {
    fontSize: 14,
    color: '#64748B',
    fontWeight: '600',
  },
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
    lineHeight: 54,
    paddingTop: 6,
  },
  profileName: {
    fontSize: 32,
    fontWeight: '900',
    color: '#0F172A',
    textAlign: 'center',
    lineHeight: 40,
    paddingTop: 4,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 8,
    flexWrap: 'wrap',
    justifyContent: 'center',
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  villageBadge: {
    backgroundColor: 'rgba(100, 116, 139, 0.1)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
  },
  villageText: {
    fontSize: 13,
    color: '#64748B',
    fontWeight: '800',
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
    gap: 12,
  },
  financeButton: {
    flexDirection: 'row',
    padding: 18,
    borderRadius: 20,
    borderWidth: 1.5,
    marginBottom: 16,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
  },
  financeButtonText: {
    fontSize: 16,
    fontWeight: '800',
  },
  aiIconBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
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
  riskCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 12,
    gap: 12,
  },
  riskTitle: {
    fontSize: 16,
    fontWeight: '800',
    marginBottom: 4,
  },
  riskText: {
    fontSize: 14,
    color: '#334155',
    lineHeight: 20,
    marginBottom: 4,
  },
  riskRec: {
    fontSize: 13,
    fontWeight: '600',
    color: '#475569',
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
  cropListContainer: {
    marginTop: 15,
    paddingTop: 15,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  cropListTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#64748B',
    marginBottom: 10,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  cropBadgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  modernCropBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    gap: 6,
  },
  modernCropText: {
    fontSize: 13,
    fontWeight: '700',
  },
  modernVarietyText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#64748B',
  },
  addPrescriptionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 16,
    backgroundColor: '#EEF2FF',
    borderWidth: 1.5,
    borderColor: '#6366F1',
    gap: 10,
    marginBottom: 15,
  },
  addPrescriptionText: {
    color: '#6366F1',
    fontSize: 15,
    fontWeight: '800',
  },
  prescriptionBadge: {
    backgroundColor: '#6366F1',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    marginBottom: 4,
    alignSelf: 'flex-start',
  },
  prescriptionBadgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  modalContainer: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    padding: 24,
    maxHeight: '90%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '900',
  },
  prescriptionInput: {
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    borderRadius: 16,
    padding: 16,
    fontSize: 16,
    minHeight: 120,
    textAlignVertical: 'top',
    marginBottom: 20,
  },
  photoSelector: {
    height: 200,
    borderRadius: 20,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: '#CBD5E1',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
    overflow: 'hidden',
  },
  previewImage: {
    width: '100%',
    height: '100%',
  },
  photoSelectorText: {
    marginTop: 8,
    fontSize: 14,
    color: '#64748B',
    fontWeight: '600',
  },
  submitButton: {
    height: 56,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  submitButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '800',
  },
  label: {
    fontSize: 12,
    fontWeight: '800',
    color: '#64748B',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
});
