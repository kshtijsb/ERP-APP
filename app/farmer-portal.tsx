import React, { useState, useEffect } from 'react';
import { StyleSheet, View, ScrollView, TextInput, TouchableOpacity, Alert, ActivityIndicator, useColorScheme, Platform, RefreshControl } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Stack, useRouter } from 'expo-router';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors } from '@/constants/theme';
import * as Location from 'expo-location';
import { 
  getFarmerLocalById, 
  getFieldNotesByFarmerId, 
  getSoilHealthByFarmerId, 
  getVisitLogsByFarmerId, 
  getFarmerLocalByPhone, 
  TreatmentLog, 
  getTreatmentLogsByFarmerId,
  getActiveSchedulesByFarmerId,
  Schedule
} from '@/lib/offline-db';
import { supabase } from '@/lib/supabase';
import { fetchAndCacheWeather } from '@/lib/weather-service';
import { predictiveRiskAnalysis, PredictiveRisk } from '@/lib/ai-advisor-service';
import { RiskCard } from '@/components/RiskCard';
import { FinanceModal } from '@/components/FinanceModal';
import { useTranslation } from '@/context/language-context';

export default function FarmerPortalScreen() {
  const { t, locale, setLocale } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const colorScheme = useColorScheme();
  const [phone, setPhone] = useState('');
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loading, setLoading] = useState(false);
  const [farmer, setFarmer] = useState<any>(null);
  const [activities, setActivities] = useState<any[]>([]);
  const [risks, setRisks] = useState<PredictiveRisk[]>([]);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [weather, setWeather] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<'insights' | 'plan' | 'history'>('insights');
  const [refreshing, setRefreshing] = useState(false);
  const [isFinanceModalVisible, setIsFinanceModalVisible] = useState(false);

  const handleLogin = async () => {
    const cleanPhone = phone.replace(/\D/g, '');
    if (cleanPhone.length < 10) {
      Alert.alert('Invalid Phone', 'Please enter a valid 10-digit phone number.');
      return;
    }

    const last10Digits = cleanPhone.slice(-10);

    setLoading(true);
    try {
      // 1. Try Online lookup with flexible matching (last 10 digits)
      const { data: onlineFarmers, error } = await supabase
        .from('farmers')
        .select('*')
        .ilike('phone_number', `%${last10Digits}`);

      if (onlineFarmers && onlineFarmers.length > 0) {
        const onlineFarmer = onlineFarmers[0]; // Take latest or first match
        setFarmer(onlineFarmer);
        await fetchFarmerData(onlineFarmer.id, onlineFarmer.crop_type);
        setIsAuthenticated(true);
      } else {
        // 2. Try Local lookup (Offline/Pending)
        // We'll update getFarmerLocalByPhone to be more flexible too if needed, 
        // but for now let's try the direct cleanPhone first
        const localFarmer = await getFarmerLocalByPhone(last10Digits);
        if (localFarmer) {
          const id = `local_${localFarmer.id}`;
          setFarmer({ ...localFarmer, id });
          await fetchFarmerData(id, localFarmer.crop_type);
          setIsAuthenticated(true);
        } else {
          Alert.alert('Farmer Not Found', `No farm record found ending in ...${last10Digits}. Please contact KK Sathi staff.`);
        }
      }
    } catch (e) {
      console.error('Farmer Access Error:', e);
      // Fallback to local
      const localFarmer = await getFarmerLocalByPhone(last10Digits);
      if (localFarmer) {
        const id = `local_${localFarmer.id}`;
        setFarmer({ ...localFarmer, id });
        await fetchFarmerData(id, localFarmer.crop_type);
        setIsAuthenticated(true);
      } else {
        Alert.alert('Error', 'Could not verify farmer record. Please check your internet connection.');
      }
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = async () => {
    if (!farmer) return;
    setRefreshing(true);
    await fetchFarmerData(farmer.id, farmer.crop_type);
    setRefreshing(false);
  };

  const fetchFarmerData = async (farmerId: string, cropType: string) => {
    try {
      // 1. Get Real-time Location/Coordinates
      let lat: number | undefined;
      let lon: number | undefined;

      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status === 'granted') {
          const location = await Location.getCurrentPositionAsync({});
          lat = location.coords.latitude;
          lon = location.coords.longitude;
        }
      } catch (locError) {
        console.warn('Location access failed, using default coordinates');
      }

      // 2. Fetch Weather using precise coordinates
      const realTimeWeather = await fetchAndCacheWeather(farmerId, lat, lon);
      setWeather(realTimeWeather);

      // 3. Fetch Activities (Local + Remote Fallback)
      let allNotes: any[] = [];
      let allSoil: any[] = [];
      let allVisits: any[] = [];
      let allTreatments: any[] = [];

      // A. Try Online Fetch for activities if possible
      if (!farmerId.startsWith('local_')) {
        const { data: remoteNotes } = await supabase.from('field_notes').select('*').eq('farmer_id', farmerId);
        if (remoteNotes) allNotes = [...remoteNotes];
        
        const { data: remoteSoil } = await supabase.from('soil_health').select('*').eq('farmer_id', farmerId);
        if (remoteSoil) allSoil = [...remoteSoil];

        const { data: remoteVisits } = await supabase.from('visit_logs').select('*').eq('farmer_id', farmerId);
        if (remoteVisits) allVisits = [...remoteVisits];

        const { data: remoteTreatments } = await supabase.from('treatment_logs').select('*').eq('farmer_id', farmerId);
        if (remoteTreatments) allTreatments = [...remoteTreatments];
      }

      // B. Fetch Local Activities
      const localNotes = await getFieldNotesByFarmerId(farmerId);
      const localSoil = await getSoilHealthByFarmerId(farmerId);
      const localVisits = await getVisitLogsByFarmerId(farmerId);
      const localTreatments = await getTreatmentLogsByFarmerId(farmerId);
      
      // Merge unique records (heuristic: combine note text/date or product/date)
      const noteKeys = new Set(allNotes.map(n => `${n.note}_${n.created_at}`));
      localNotes.forEach(ln => { if (!noteKeys.has(`${ln.note}_${ln.created_at}`)) allNotes.push(ln); });

      const soilKeys = new Set(allSoil.map(s => `${s.ph}_${s.created_at}`));
      localSoil.forEach(ls => { if (!soilKeys.has(`${ls.ph}_${ls.created_at}`)) allSoil.push(ls); });

      const visitKeys = new Set(allVisits.map(v => `${v.purpose}_${v.visit_date}`));
      localVisits.forEach(lv => { if (!visitKeys.has(`${lv.purpose}_${lv.visit_date}`)) allVisits.push(lv); });

      const treatmentKeys = new Set(allTreatments.map(t => `${t.product_name}_${t.application_date}`));
      localTreatments.forEach(lt => { if (!treatmentKeys.has(`${lt.product_name}_${lt.application_date}`)) allTreatments.push(lt); });

      // C. Safe Merge & Sort
      const combined = [
        ...allNotes.map(n => ({ ...n, type: 'note' as const })),
        ...allSoil.map(s => ({ ...s, type: 'soil' as const })),
        ...allVisits.map(v => ({ ...v, type: 'visit' as const })),
        ...allTreatments.map(t => ({ ...t, type: 'treatment' as const }))
      ].sort((a: any, b: any) => {
        const dateA = new Date(a.created_at || a.visit_date || a.application_date).getTime();
        const dateB = new Date(b.created_at || b.visit_date || b.application_date).getTime();
        return dateB - dateA;
      });

      setActivities(combined);

      // 3. Robust Schedule Fetching
      let allSchedules: Schedule[] = [];
      
      // A. Try Online Fetch if possible
      if (!farmerId.startsWith('local_')) {
        const { data: onlineSchedules } = await supabase
          .from('schedules')
          .select('*')
          .eq('farmer_id', farmerId)
          .eq('status', 'active');
        if (onlineSchedules) allSchedules = [...onlineSchedules];
      }

      // B. Fetch Local Schedules
      const localSchedules = await getActiveSchedulesByFarmerId(farmerId);
      
      // Merge and avoid duplicates by title/date
      const currentKeys = new Set(allSchedules.map(s => `${s.title}_${s.start_date}`));
      localSchedules.forEach(ls => {
        if (!currentKeys.has(`${ls.title}_${ls.start_date}`)) {
          allSchedules.push(ls);
        }
      });
      
      // C. ID Fallback forSynced farmers looking for "pre-sync" local schedules
      if (!farmerId.startsWith('local_') && farmer?.phone_number) {
        const localRecord = await getFarmerLocalByPhone(farmer.phone_number);
        if (localRecord) {
          const preSyncSchedules = await getActiveSchedulesByFarmerId(`local_${localRecord.id}`);
          preSyncSchedules.forEach(ls => {
            if (!currentKeys.has(`${ls.title}_${ls.start_date}`)) {
              allSchedules.push(ls);
            }
          });
        }
      }

      console.log(`Fetched ${allSchedules.length} schedules total for ${farmerId}`);
      setSchedules(allSchedules);

      // Run Predictive AI
      const analysis = predictiveRiskAnalysis(realTimeWeather, cropType || 'Tomato');
      setRisks(analysis.risks);

    } catch (e) {
      console.error('Data Fetch Error:', e);
    }
  };

  if (!isAuthenticated) {
    return (
      <ThemedView style={styles.loginContainer}>
        <TouchableOpacity 
          style={styles.floatingLangToggle}
          onPress={() => setLocale(locale === 'en' ? 'mr' : 'en')}
        >
          <ThemedText style={styles.langToggleText}>
            {locale === 'en' ? 'मराठी' : 'English'}
          </ThemedText>
        </TouchableOpacity>
        <Stack.Screen options={{ title: 'Farmer Access', headerShown: false }} />
        <View style={styles.loginHeader}>
          <IconSymbol name="leaf.fill" size={60} color={Colors[colorScheme ?? 'light'].tint} />
          <ThemedText type="title" style={styles.loginTitle}>{t('myFarmPortal')}</ThemedText>
          <ThemedText style={styles.loginSub}>{t('farmerLoginSub')}</ThemedText>
        </View>

        <View style={styles.inputCard}>
          <ThemedText style={styles.label}>{t('phone')}</ThemedText>
          <TextInput
            style={[styles.input, { color: Colors[colorScheme ?? 'light'].text, borderColor: Colors[colorScheme ?? 'light'].border }]}
            placeholder="e.g. 9876543210"
            placeholderTextColor="#94A3B8"
            keyboardType="phone-pad"
            value={phone}
            onChangeText={setPhone}
          />
          <TouchableOpacity 
            style={[styles.loginButton, { backgroundColor: Colors[colorScheme ?? 'light'].tint }]} 
            onPress={handleLogin}
            disabled={loading}
          >
            {loading ? <ActivityIndicator color="#fff" /> : <ThemedText style={styles.loginButtonText}>{t('accessMyFarm')}</ThemedText>}
          </TouchableOpacity>
        </View>
        
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <ThemedText style={{ color: '#94A3B8' }}>{t('returnToShop')}</ThemedText>
        </TouchableOpacity>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={[styles.container, { paddingTop: insets.top + (Platform.OS === 'android' ? 10 : 0) }]}>
      <StatusBar style={colorScheme === 'dark' ? 'light' : 'dark'} />
      <Stack.Screen options={{ 
        headerShown: false,
      }} />

      {/* Modern Compact Header with Logout */}
      <View style={styles.premiumHeader}>
        <View>
          <ThemedText style={styles.welcomeText}>{t('goodDay')},</ThemedText>
          <ThemedText style={styles.farmerNameText}>{farmer?.name?.split(' ')[0] || 'User'}</ThemedText>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <TouchableOpacity 
            style={styles.pillLangToggle}
            onPress={() => setLocale(locale === 'en' ? 'mr' : 'en')}
          >
            <ThemedText style={styles.langToggleText}>
              {locale === 'en' ? 'मराठी' : 'EN'}
            </ThemedText>
          </TouchableOpacity>
          <TouchableOpacity style={styles.logoutBtn} onPress={() => setIsAuthenticated(false)}>
            <IconSymbol name="rectangle.portrait.and.arrow.right" size={20} color="#EF4444" />
          </TouchableOpacity>
        </View>
      </View>

      {/* Premium Pill-Style Tab Bar */}
      <View style={styles.tabBarContainer}>
        <View style={styles.tabBar}>
          <TouchableOpacity 
            style={[styles.tab, activeTab === 'insights' && styles.activeTab]} 
            onPress={() => setActiveTab('insights')}
          >
            <IconSymbol name="sparkles" size={16} color={activeTab === 'insights' ? '#fff' : '#64748B'} />
            <ThemedText style={[styles.tabText, activeTab === 'insights' && styles.activeTabText]}>{t('insights')}</ThemedText>
          </TouchableOpacity>
          <TouchableOpacity 
            style={[styles.tab, activeTab === 'plan' && styles.activeTab]} 
            onPress={() => setActiveTab('plan')}
          >
            <IconSymbol name="calendar" size={16} color={activeTab === 'plan' ? '#fff' : '#64748B'} />
            <ThemedText style={[styles.tabText, activeTab === 'plan' && styles.activeTabText]}>{t('plan')}</ThemedText>
          </TouchableOpacity>
          <TouchableOpacity 
            style={[styles.tab, activeTab === 'history' && styles.activeTab]} 
            onPress={() => setActiveTab('history')}
          >
            <IconSymbol name="clock.arrow.circlepath" size={16} color={activeTab === 'history' ? '#fff' : '#64748B'} />
            <ThemedText style={[styles.tabText, activeTab === 'history' && styles.activeTabText]}>{t('history')}</ThemedText>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView 
        style={styles.contentScroll} 
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors[colorScheme ?? 'light'].tint} />
        }
      >
        {activeTab === 'insights' && (
          <View style={styles.tabContent}>
            {/* Weather & Risks */}
            {weather && (
              <ThemedView style={styles.weatherDashboard}>
                <View style={styles.weatherMain}>
                  <View style={styles.tempContainer}>
                    <ThemedText style={styles.weatherDate}>{new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}</ThemedText>
                    <ThemedText style={styles.weatherTempLarge}>{weather.temp}°</ThemedText>
                  </View>
                  <IconSymbol name="cloud.sun.fill" size={60} color="#fff" style={styles.weatherIcon} />
                </View>
                <View style={styles.weatherStats}>
                  <View style={styles.statItem}>
                    <IconSymbol name="humidity.fill" size={14} color="rgba(255,255,255,0.7)" />
                    <ThemedText style={styles.statLabel}>{t('humidityLabel')}</ThemedText>
                    <ThemedText style={styles.statValue}>{weather.humidity}%</ThemedText>
                  </View>
                  <View style={styles.statDivider} />
                  <View style={styles.statItem}>
                    <IconSymbol name="wind" size={14} color="rgba(255,255,255,0.7)" />
                    <ThemedText style={styles.statLabel}>{t('conditionLabel')}</ThemedText>
                    <ThemedText style={styles.statValue}>{weather.condition}</ThemedText>
                  </View>
                </View>
                {weather.humidity > 80 && (
                  <View style={styles.alertBar}>
                    <IconSymbol name="exclamationmark.shield.fill" size={12} color="#fff" />
                    <ThemedText style={styles.alertText}>{t('pestVulnerability')}</ThemedText>
                  </View>
                )}
              </ThemedView>
            )}

            <View style={{ paddingHorizontal: 20, marginBottom: 16 }}>
              <TouchableOpacity 
                style={[styles.financeButton, { backgroundColor: '#FEF2F2', borderColor: '#EF4444' }]}
                onPress={() => setIsFinanceModalVisible(true)}
              >
                <IconSymbol name="indianrupeesign.circle.fill" size={24} color="#EF4444" />
                <View style={{ flex: 1 }}>
                  <ThemedText style={[styles.financeButtonText, { color: '#EF4444' }]}>Farm Finances (ROI)</ThemedText>
                  <ThemedText style={{ fontSize: 13, color: '#DC2626', marginTop: 2 }}>Log & track your treatment expenses</ThemedText>
                </View>
                <IconSymbol name="chevron.right" size={20} color="#EF4444" />
              </TouchableOpacity>
            </View>

            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <ThemedText style={styles.sectionTitle}>{t('aiRiskAnalysis')}</ThemedText>
                <View style={styles.aiBadge}>
                  <ThemedText style={styles.aiBadgeText}>LIVE SCAN</ThemedText>
                </View>
              </View>
              {risks.length > 0 ? (
                risks.map((risk, idx) => (
                  <RiskCard key={idx} risk={risk} />
                ))
              ) : (
                <View style={styles.noRisks}>
                  <IconSymbol name="checkmark.seal.fill" size={40} color="#10B981" />
                  <ThemedText style={styles.noRisksText}>{t('noRisksFound')}</ThemedText>
                </View>
              )}
            </View>
          </View>
        )}

        {activeTab === 'plan' && (
          <View style={styles.tabContent}>
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <ThemedText style={styles.sectionTitle}>{t('activeSchedules')}</ThemedText>
                <IconSymbol name="calendar.badge.clock" size={20} color={Colors[colorScheme ?? 'light'].tint} />
              </View>
              {schedules.length > 0 ? (
                schedules.map((schedule, idx) => (
                  <ThemedView key={idx} style={[styles.scheduleCard, { borderLeftColor: schedule.type === 'irrigation' ? '#3B82F6' : '#10B981' }]}>
                    <View style={styles.scheduleHeader}>
                      <View style={[styles.typeBadge, { backgroundColor: schedule.type === 'irrigation' ? '#EFF6FF' : '#F0FDF4' }]}>
                        <ThemedText style={[styles.typeBadgeText, { color: schedule.type === 'irrigation' ? '#3B82F6' : '#10B981' }]}>
                          {schedule.type.toUpperCase()}
                        </ThemedText>
                      </View>
                      <View style={styles.freqBadgeContainer}>
                        <IconSymbol name="repeat" size={10} color="#94A3B8" />
                        <ThemedText style={styles.freqBadge}>{schedule.frequency}</ThemedText>
                      </View>
                    </View>
                    <ThemedText style={styles.scheduleTitle}>{schedule.title}</ThemedText>
                    {schedule.description ? <ThemedText style={styles.scheduleDesc}>{schedule.description}</ThemedText> : null}
                    <View style={styles.scheduleFooter}>
                    <IconSymbol name="calendar" size={12} color="#94A3B8" />
                      <ThemedText style={styles.schedulePeriod}>
                        Starts: {new Date(schedule.start_date).toLocaleDateString()}
                      </ThemedText>
                      <View style={styles.dot} />
                      <ThemedText style={styles.schedulePeriod}>
                        Active for {Math.ceil((new Date(schedule.end_date).getTime() - new Date(schedule.start_date).getTime()) / (1000 * 60 * 60 * 24))} days
                      </ThemedText>
                    </View>
                  </ThemedView>
                ))
              ) : (
                <View style={styles.emptyCard}>
                  <IconSymbol name="calendar.badge.exclamationmark" size={48} color="#E2E8F0" />
                  <ThemedText style={styles.emptyText}>{t('noActivities')}</ThemedText>
                  <ThemedText style={styles.emptySubText}>{t('staffNotice')}</ThemedText>
                </View>
              )}
            </View>
          </View>
        )}

        {activeTab === 'history' && (
          <View style={styles.tabContent}>
            <View style={styles.section}>
              <ThemedText style={styles.sectionTitle}>{t('farmActivityHistory')}</ThemedText>
              {activities.length > 0 ? (
                activities.map((activity, idx) => (
                  <ThemedView key={idx} style={styles.historyCard}>
                    <View style={styles.historyHeader}>
                      <View style={styles.historyTypeContainer}>
                        <View style={[styles.historyDot, { backgroundColor: activity.type === 'note' ? '#3B82F6' : activity.type === 'soil' ? '#10B981' : '#22C55E' }]} />
                        <ThemedText style={styles.historyType}>
                          {activity.type === 'note' ? t('observation') : 
                           activity.type === 'soil' ? t('soilStatus') : 
                           activity.type === 'treatment' ? t('treatment') : t('visit')}
                        </ThemedText>
                      </View>
                      <ThemedText style={styles.historyDate}>
                        {new Date(activity.created_at || activity.visit_date || activity.application_date).toLocaleDateString()}
                      </ThemedText>
                    </View>
                    <ThemedText style={styles.historyContent}>
                      {activity.type === 'note' ? activity.note : 
                       activity.type === 'soil' ? `${t('checkedSoil')} (pH: ${activity.ph}, N: ${activity.nitrogen})` : 
                       activity.type === 'treatment' ? `${t('applied')} ${activity.product_name} (${activity.quantity})` : activity.purpose}
                    </ThemedText>
                  </ThemedView>
                ))
              ) : (
                <View style={styles.emptyCard}>
                  <IconSymbol name="doc.text.magnifyingglass" size={48} color="#E2E8F0" />
                  <ThemedText style={styles.emptyText}>{t('noHistory')}</ThemedText>
                </View>
              )}
            </View>
          </View>
        )}
      </ScrollView>

      <FinanceModal
        isVisible={isFinanceModalVisible}
        onClose={() => setIsFinanceModalVisible(false)}
        farmerId={farmer?.id || ''}
        landArea={farmer?.land_area?.toString() || '1'}
        cropType={farmer?.crop_type || 'General'}
      />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  floatingLangToggle: {
    position: 'absolute',
    top: 50,
    right: 30,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    zIndex: 100,
  },
  pillLangToggle: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  langToggleText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#64748B',
  },
  loginContainer: {
    flex: 1,
    padding: 30,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loginHeader: {
    alignItems: 'center',
    marginBottom: 40,
  },
  loginTitle: {
    fontSize: 28,
    fontWeight: '900',
    marginTop: 20,
    marginBottom: 10,
  },
  loginSub: {
    textAlign: 'center',
    color: '#64748B',
    lineHeight: 22,
  },
  inputCard: {
    width: '100%',
    padding: 24,
    borderRadius: 24,
    backgroundColor: '#fff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.05,
    shadowRadius: 20,
    elevation: 5,
  },
  label: {
    fontSize: 14,
    fontWeight: '700',
    color: '#64748B',
    marginBottom: 8,
  },
  input: {
    height: 60,
    borderWidth: 1.5,
    borderRadius: 16,
    paddingHorizontal: 16,
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 20,
  },
  loginButton: {
    height: 60,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loginButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '800',
  },
  backBtn: {
    marginTop: 30,
  },
  premiumHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 28,
    paddingTop: 10,
    marginBottom: 0,
  },
  welcomeText: {
    fontSize: 14,
    color: '#94A3B8',
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  farmerNameText: {
    fontSize: 28,
    fontWeight: '900',
    color: '#0F172A',
    letterSpacing: -1,
  },
  logoutBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#FFF5F5',
    justifyContent: 'center',
    alignItems: 'center',
  },
  // Tab Bar Styles
  tabBarContainer: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    backgroundColor: 'transparent',
  },
  tabBar: {
    flexDirection: 'row',
    height: 52,
    borderRadius: 26,
    backgroundColor: '#F1F5F9',
    padding: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 3,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  activeTab: {
    backgroundColor: '#0F172A',
  },
  tabText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#64748B',
  },
  activeTabText: {
    color: '#fff',
  },
  contentScroll: {
    flex: 1,
  },
  tabContent: {
    paddingTop: 0,
  },
  weatherDashboard: {
    margin: 20,
    backgroundColor: '#0F172A',
    borderRadius: 36,
    padding: 32,
    overflow: 'visible', // CRITICAL: Allow large text to breathe
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 20 },
    shadowOpacity: 0.3,
    shadowRadius: 30,
    elevation: 15,
  },
  weatherMain: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
  },
  tempContainer: {
    flex: 1,
    minHeight: 110, // Increased to comfortably fit 90px line height + padding
    justifyContent: 'center',
    paddingVertical: 5,
  },
  weatherIcon: {
    marginTop: -20, // Offset icon slightly for better balance
  },
  weatherDate: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 13,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 4,
  },
  weatherTempLarge: {
    fontSize: 84, // Even larger and clearer
    fontWeight: '900',
    color: '#fff',
    lineHeight: 90, // Significant line height to prevent clipping
    letterSpacing: -2,
  },
  weatherStats: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 24,
    padding: 20, // More internal padding
    alignItems: 'center',
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
    gap: 6, // More gap between icon/label/value
  },
  statDivider: {
    width: 1,
    height: 24,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  statLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: 'rgba(255,255,255,0.4)',
    textTransform: 'uppercase',
  },
  statValue: {
    fontSize: 16,
    fontWeight: '800',
    color: '#fff',
  },
  alertBar: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 20,
    paddingVertical: 10,
    paddingHorizontal: 16,
    backgroundColor: 'rgba(59, 130, 246, 0.15)',
    borderRadius: 12,
    gap: 8,
  },
  alertText: {
    color: '#93C5FD',
    fontSize: 12,
    fontWeight: '600',
    flex: 1,
  },
  financeButton: {
    flexDirection: 'row',
    padding: 20,
    borderRadius: 24,
    borderWidth: 1.5,
    alignItems: 'center',
    gap: 16,
  },
  financeButtonText: {
    fontSize: 18,
    fontWeight: '900',
    letterSpacing: -0.5,
  },
  section: {
    paddingHorizontal: 20,
    marginBottom: 32,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 22,
    fontWeight: '900',
    letterSpacing: -0.8,
    color: '#0F172A',
  },
  aiBadge: {
    backgroundColor: '#F8FAFC',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  aiBadgeText: {
    fontSize: 11,
    fontWeight: '900',
    color: '#64748B',
    letterSpacing: 0.5,
  },
  noRisks: {
    padding: 40,
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 32,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 16,
    elevation: 2,
  },
  noRisksText: {
    textAlign: 'center',
    fontSize: 15,
    fontWeight: '700',
    color: '#64748B',
    marginTop: 16,
    lineHeight: 22,
  },
  // History Card Styles
  historyCard: {
    padding: 20,
    borderRadius: 24,
    marginBottom: 16,
    backgroundColor: '#fff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 12,
    elevation: 2,
  },
  historyHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  historyTypeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  historyDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  historyType: {
    fontSize: 12,
    fontWeight: '800',
    color: '#94A3B8',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  historyDate: {
    fontSize: 12,
    color: '#94A3B8',
    fontWeight: '700',
  },
  historyContent: {
    fontSize: 17,
    fontWeight: '700',
    lineHeight: 26,
    color: '#1E293B',
  },
  emptyCard: {
    padding: 60,
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 32,
    borderStyle: 'dashed',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  emptyText: {
    marginTop: 16,
    fontSize: 16,
    fontWeight: '800',
    color: '#64748B',
  },
  emptySubText: {
    fontSize: 13,
    color: '#94A3B8',
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 18,
  },
  // Schedule Card Styles
  scheduleCard: {
    borderRadius: 28,
    borderLeftWidth: 8,
    padding: 24,
    marginBottom: 16,
    backgroundColor: '#fff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.05,
    shadowRadius: 15,
    elevation: 4,
  },
  scheduleHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  typeBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
  },
  typeBadgeText: {
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1,
  },
  freqBadgeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  freqBadge: {
    fontSize: 13,
    fontWeight: '800',
    color: '#64748B',
  },
  scheduleTitle: {
    fontSize: 20,
    fontWeight: '900',
    color: '#0F172A',
    marginBottom: 8,
    letterSpacing: -0.5,
  },
  scheduleDesc: {
    fontSize: 15,
    color: '#64748B',
    lineHeight: 22,
    marginBottom: 20,
  },
  scheduleFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
    paddingTop: 16,
  },
  schedulePeriod: {
    fontSize: 13,
    color: '#64748B',
    fontWeight: '700',
  },
  dot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#E2E8F0',
  },
});
