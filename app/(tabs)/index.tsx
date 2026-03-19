import React, { useState } from 'react';
import { StyleSheet, TextInput, TouchableOpacity, ScrollView, Alert, View, useColorScheme, ActivityIndicator, Image } from 'react-native';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import NetInfo from '@react-native-community/netinfo';
import { supabase } from '@/lib/supabase';
import { initOfflineDB, saveFarmerOffline } from '@/lib/offline-db';
import { syncOfflineData } from '@/lib/sync-engine';
import { ThemedText } from '@/components/themed-text';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { ThemedView } from '@/components/themed-view';
import { Colors } from '@/constants/theme';
import { useEffect } from 'react';
import { useAuth } from '@/context/auth-context';
import { CROPS } from '@/constants/crops';
import { useTranslation } from '@/context/language-context';
import { Modal, FlatList } from 'react-native';

export default function FarmerFormScreen() {
  const { t, locale, setLocale } = useTranslation();
  const colorScheme = useColorScheme();
  const router = useRouter();
  const { user, signOut } = useAuth();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    phone_number: '',
    land_area: '',
    crop_duration: '',
  });
  const [selectedCrops, setSelectedCrops] = useState<{crop: string, variety: string}[]>([]);
  const [currentCrop, setCurrentCrop] = useState('');
  const [currentVariety, setCurrentVariety] = useState('');
  
  const [focusedInput, setFocusedInput] = useState<string | null>(null);
  const [isOffline, setIsOffline] = useState(false);
  const [varietyModalVisible, setVarietyModalVisible] = useState(false);

  useEffect(() => {
    initOfflineDB();
    
    const unsubscribe = NetInfo.addEventListener(state => {
      setIsOffline(!state.isConnected);
      if (state.isConnected) {
        syncOfflineData();
      }
    });

    return () => unsubscribe();
  }, []);

  const [image, setImage] = useState<string | null>(null);
  const [permission, requestPermission] = ImagePicker.useCameraPermissions();

  const addCrop = () => {
    if (!currentCrop) return;
    setSelectedCrops([...selectedCrops, { crop: currentCrop, variety: currentVariety || 'General' }]);
    setCurrentCrop('');
    setCurrentVariety('');
  };

  const removeCrop = (index: number) => {
    setSelectedCrops(selectedCrops.filter((_, i) => i !== index));
  };

  const pickImage = async () => {
    if (!permission) {
      // Camera permissions are still loading
      return;
    }

    if (!permission.granted) {
      const result = await requestPermission();
      if (!result.granted) {
        Alert.alert('Permission Required', 'We need camera access to capture farmer photos. Please enable it in settings.');
        return;
      }
    }

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.5,
    });

    if (!result.canceled) {
      setImage(result.assets[0].uri);
    }
  };

  const uploadAvatar = async (farmerId: string) => {
    if (!image) return null;

    try {
      const response = await fetch(image);
      const blob = await response.blob();
      const arrayBuffer = await new Response(blob).arrayBuffer();
      
      const fileName = `${farmerId}/${Date.now()}.jpg`;
      const { data, error } = await supabase.storage
        .from('avatars')
        .upload(fileName, arrayBuffer, {
          contentType: 'image/jpeg',
          upsert: true
        });

      if (error) throw error;
      
      const { data: { publicUrl } } = supabase.storage
        .from('avatars')
        .getPublicUrl(fileName);
        
      return publicUrl;
    } catch (error) {
      console.error('Error uploading avatar:', error);
      return null;
    }
  };

  const handleSaveAndMap = async () => {
    if (!formData.name) {
      Alert.alert('Error', 'Please enter farmer name');
      return;
    }

    if (selectedCrops.length === 0 && !currentCrop) {
      Alert.alert('Error', 'Please add at least one crop');
      return;
    }

    // Prepare final crop list
    const finalCrops = [...selectedCrops];
    if (currentCrop) {
      finalCrops.push({ crop: currentCrop, variety: currentVariety || 'General' });
    }

    const cropTypeJoined = finalCrops.map(c => c.crop).join(', ');
    const varietyJoined = finalCrops.map(c => c.variety).join(', ');

    setLoading(true);
    try {
      const state = await NetInfo.fetch();
      
      if (state.isConnected) {
        // 1. Online: Insert farmer to Supabase
        const { data: farmer, error: farmerError } = await supabase
          .from('farmers')
          .insert([
            {
              name: formData.name,
              phone_number: formData.phone_number,
              land_area: formData.land_area ? parseFloat(formData.land_area) : null,
              crop_type: cropTypeJoined,
              variety: varietyJoined,
              crop_duration: formData.crop_duration,
            },
          ])
          .select('id, name')
          .single();

        if (farmerError) throw farmerError;

        // 2. Upload Avatar if exists
        if (image && farmer) {
          const avatarUrl = await uploadAvatar(farmer.id);
          if (avatarUrl) {
            await supabase
              .from('farmers')
              .update({ avatar_url: avatarUrl })
              .eq('id', farmer.id);
          }
        }

        // 3. Navigation
        if (farmer) {
          router.push({
            pathname: '/map',
            params: { 
              farmerId: farmer.id, 
              farmerName: farmer.name,
              reportedArea: formData.land_area
            },
          });
        }
      } else {
        // 3. Offline: Save to SQLite
        const localId = await saveFarmerOffline({
          ...formData,
          crop_type: cropTypeJoined,
          variety: varietyJoined,
          avatar_uri: image,
          created_by: user?.id
        });

        Alert.alert(
          'Saved Offline',
          'No internet connection. Data saved locally and will sync once you are back online.',
          [{ text: 'Start Mapping', onPress: () => {
            router.push({
              pathname: '/map',
              params: { 
                farmerId: `local_${localId}`, 
                farmerName: formData.name, 
                isOffline: 'true',
                reportedArea: formData.land_area
              },
            });
          }}]
        );
      }
    } catch (error: any) {
      Alert.alert('Error saving farmer info', error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign Out', style: 'destructive', onPress: signOut }
    ]);
  };

  const getInputStyle = (name: string) => [
    styles.input,
    { 
      borderColor: focusedInput === name 
        ? Colors[colorScheme ?? 'light'].tint 
        : Colors[colorScheme ?? 'light'].border,
      color: Colors[colorScheme ?? 'light'].text
    },
    focusedInput === name && styles.inputFocused,
    { backgroundColor: colorScheme === 'dark' ? Colors.dark.card : '#FFFFFF' }
  ];

  return (
    <ScrollView 
      style={[styles.container, { backgroundColor: Colors[colorScheme ?? 'light'].background }]}
      contentContainerStyle={styles.contentContainer}
    >
      <ThemedView style={styles.modernTopSection}>
          <TouchableOpacity 
            style={styles.langToggle}
            onPress={() => setLocale(locale === 'en' ? 'mr' : 'en')}
          >
            <ThemedText style={styles.langToggleText}>
              {locale === 'en' ? 'मराठी' : 'English'}
            </ThemedText>
          </TouchableOpacity>

        <View style={styles.brandingRow}>
          <View style={styles.logoBox}>
            <Image 
              source={require('@/assets/images/logo.png')} 
              style={styles.logoImage} 
              resizeMode="contain"
            />
          </View>
          <View style={{ flex: 1 }}>
            <ThemedText style={styles.brandingLabel}>KK SATHI</ThemedText>
            <ThemedText type="title" style={styles.pageTitleText} numberOfLines={1} adjustsFontSizeToFit>{t('newRegistration')}</ThemedText>
          </View>
          <TouchableOpacity style={styles.navLogoutBtn} onPress={handleLogout}>
            <IconSymbol name="rectangle.portrait.and.arrow.right" size={20} color="#EF4444" />
          </TouchableOpacity>
        </View>
      </ThemedView>

      <View style={styles.avatarPickerSection}>
        <TouchableOpacity style={styles.avatarTouchArea} onPress={pickImage} activeOpacity={0.8}>
          <View style={[styles.avatarOuterRing, { borderColor: Colors[colorScheme ?? 'light'].tint + '20' }]}>
            {image ? (
              <Image source={{ uri: image }} style={styles.avatarFullPreview} />
            ) : (
              <View style={styles.avatarEmptyState}>
                <View style={[styles.cameraIconCircle, { backgroundColor: Colors[colorScheme ?? 'light'].tint + '10' }]}>
                  <IconSymbol name="camera.fill" size={28} color={Colors[colorScheme ?? 'light'].tint} />
                </View>
                <ThemedText style={styles.avatarInstruction}>Add Photo</ThemedText>
              </View>
            )}
          </View>
          {image && (
            <View style={[styles.editBadge, { backgroundColor: Colors[colorScheme ?? 'light'].tint }]}>
              <IconSymbol name="pencil" size={12} color="#fff" />
            </View>
          )}
        </TouchableOpacity>
      </View>

      <ThemedView style={styles.formContainer}>
        <ThemedView style={styles.inputGroup}>
          <ThemedText style={styles.label}>{t('fullName')} *</ThemedText>
          <TextInput
            style={getInputStyle('name')}
            placeholder="e.g. Rajesh Kumar"
            placeholderTextColor="#94A3B8"
            value={formData.name}
            onFocus={() => setFocusedInput('name')}
            onBlur={() => setFocusedInput(null)}
            onChangeText={(text) => setFormData({ ...formData, name: text })}
          />
        </ThemedView>

        <ThemedView style={styles.inputGroup}>
          <ThemedText style={styles.label}>{t('phone')}</ThemedText>
          <TextInput
            style={getInputStyle('phone')}
            placeholder="+91 00000 00000"
            placeholderTextColor="#94A3B8"
            keyboardType="phone-pad"
            value={formData.phone_number}
            onFocus={() => setFocusedInput('phone')}
            onBlur={() => setFocusedInput(null)}
            onChangeText={(text) => setFormData({ ...formData, phone_number: text })}
          />
        </ThemedView>

        <ThemedView style={styles.inputGroup}>
          <ThemedText style={styles.label}>{t('selectCrop')} *</ThemedText>
          
          {selectedCrops.length > 0 && (
            <View style={styles.selectedCropsContainer}>
              {selectedCrops.map((item, idx) => (
                <View key={idx} style={[styles.selectedCropBadge, { backgroundColor: Colors[colorScheme ?? 'light'].tint + '15' }]}>
                  <ThemedText style={[styles.selectedCropText, { color: Colors[colorScheme ?? 'light'].tint }]}>
                    {item.crop} ({item.variety})
                  </ThemedText>
                  <TouchableOpacity onPress={() => removeCrop(idx)}>
                    <IconSymbol name="xmark.circle.fill" size={16} color={Colors[colorScheme ?? 'light'].tint} />
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          )}

          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
            {CROPS.map(crop => (
              <TouchableOpacity 
                key={crop.id}
                style={[
                  styles.cropChip, 
                  currentCrop === crop.name && { backgroundColor: Colors[colorScheme ?? 'light'].tint, borderColor: Colors[colorScheme ?? 'light'].tint }
                ]}
                onPress={() => {
                  setCurrentCrop(crop.name);
                  setCurrentVariety('');
                }}
              >
                <ThemedText style={[styles.chipText, currentCrop === crop.name && { color: '#fff' }]}>
                  {crop.name}
                </ThemedText>
              </TouchableOpacity>
            ))}
            <TouchableOpacity 
              style={[
                styles.cropChip, 
                !CROPS.find(c => c.name === currentCrop) && currentCrop !== '' && { backgroundColor: Colors[colorScheme ?? 'light'].tint, borderColor: Colors[colorScheme ?? 'light'].tint }
              ]}
              onPress={() => Alert.prompt('Other Crop', 'Enter crop name', (text) => {
                setCurrentCrop(text);
                setCurrentVariety('General');
              })}
            >
              <ThemedText style={[styles.chipText, !CROPS.find(c => c.name === currentCrop) && currentCrop !== '' && { color: '#fff' }]}>
                {t('otherCrop')}
              </ThemedText>
            </TouchableOpacity>
          </ScrollView>
        </ThemedView>

        {currentCrop && CROPS.find(c => c.name === currentCrop)?.varieties.length! > 0 && (
          <ThemedView style={styles.inputGroup}>
            <ThemedText style={styles.label}>{t('selectVariety')} *</ThemedText>
            <TouchableOpacity 
              style={styles.dropdownTrigger}
              onPress={() => setVarietyModalVisible(true)}
            >
              <ThemedText style={[styles.dropdownValue, !currentVariety && { color: '#94A3B8' }, { flex: 1 }]} numberOfLines={1}>
                {currentVariety || t('selectVariety')}
              </ThemedText>
              <IconSymbol name="chevron.down" size={18} color="#64748B" />
            </TouchableOpacity>

            <Modal
              visible={varietyModalVisible}
              transparent={true}
              animationType="slide"
              onRequestClose={() => setVarietyModalVisible(false)}
            >
              <TouchableOpacity 
                style={styles.modalOverlay}
                activeOpacity={1}
                onPress={() => setVarietyModalVisible(false)}
              >
                <ThemedView style={styles.modalContent}>
                  <View style={styles.modalHeader}>
                    <ThemedText style={styles.modalTitle}>{t('chooseVariety')}</ThemedText>
                    <TouchableOpacity onPress={() => setVarietyModalVisible(false)}>
                      <IconSymbol name="xmark.circle.fill" size={24} color="#CBD5E1" />
                    </TouchableOpacity>
                  </View>
                  
                  <FlatList
                    data={CROPS.find(c => c.name === currentCrop)?.varieties}
                    keyExtractor={(item) => item.id}
                    renderItem={({ item }) => (
                      <TouchableOpacity 
                        style={[
                          styles.varietyOption,
                          currentVariety === item.name && styles.varietyOptionSelected
                        ]}
                        onPress={() => {
                          setCurrentVariety(item.name);
                          setVarietyModalVisible(false);
                        }}
                      >
                        <ThemedText style={[
                          styles.optionText,
                          currentVariety === item.name && { color: Colors[colorScheme ?? 'light'].tint, fontWeight: '800' }
                        ]}>
                          {item.name}
                        </ThemedText>
                        {currentVariety === item.name && (
                          <IconSymbol name="checkmark" size={18} color={Colors[colorScheme ?? 'light'].tint} />
                        )}
                      </TouchableOpacity>
                    )}
                    contentContainerStyle={{ paddingBottom: 30 }}
                  />
                </ThemedView>
              </TouchableOpacity>
            </Modal>
          </ThemedView>
        )}

        {currentCrop && (
          <TouchableOpacity 
            style={[styles.addCropBtn, { borderColor: Colors[colorScheme ?? 'light'].tint }]}
            onPress={addCrop}
          >
            <IconSymbol name="plus.circle.fill" size={18} color={Colors[colorScheme ?? 'light'].tint} />
            <ThemedText style={[styles.addCropBtnText, { color: Colors[colorScheme ?? 'light'].tint }]}>
              Confirm & Add {currentCrop}
            </ThemedText>
          </TouchableOpacity>
        )}

        <View style={styles.row}>
          <ThemedView style={[styles.inputGroup, { flex: 1 }]}>
            <ThemedText style={styles.label}>{t('landArea')}</ThemedText>
            <TextInput
              style={getInputStyle('land')}
              placeholder="0.0"
              placeholderTextColor="#94A3B8"
              keyboardType="numeric"
              value={formData.land_area}
              onFocus={() => setFocusedInput('land')}
              onBlur={() => setFocusedInput(null)}
              onChangeText={(text) => setFormData({ ...formData, land_area: text })}
            />
          </ThemedView>

          <ThemedView style={[styles.inputGroup, { flex: 1.5 }]}>
            <ThemedText style={styles.label}>Cycle Duration</ThemedText>
            <TextInput
              style={getInputStyle('duration')}
              placeholder="e.g. 5 Months"
              placeholderTextColor="#94A3B8"
              value={formData.crop_duration}
              onFocus={() => setFocusedInput('duration')}
              onBlur={() => setFocusedInput(null)}
              onChangeText={(text) => setFormData({ ...formData, crop_duration: text })}
            />
          </ThemedView>
        </View>

        <TouchableOpacity
          style={[styles.primaryButton, { backgroundColor: Colors[colorScheme ?? 'light'].tint }, loading && styles.buttonDisabled]}
          onPress={handleSaveAndMap}
          disabled={loading}>
          {loading ? <ActivityIndicator color="#fff" /> : <ThemedText style={styles.buttonText}>{t('registerFarmer')}</ThemedText>}
        </TouchableOpacity>
      </ThemedView>
      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  contentContainer: {
    paddingBottom: 40,
  },
  modernTopSection: {
    paddingTop: 80,
    paddingHorizontal: 25,
    paddingBottom: 15,
    backgroundColor: 'transparent',
  },
  brandingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 15,
  },
  logoBox: {
    width: 60,
    height: 60,
    borderRadius: 18,
    backgroundColor: '#fff',
    padding: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 2,
    borderWidth: 1,
    borderColor: '#F1F5F9',
  },
  logoImage: {
    width: '100%',
    height: '100%',
  },
  brandingLabel: {
    fontSize: 12,
    fontWeight: '800',
    color: '#64748B',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  langToggle: {
    position: 'absolute',
    top: 40,
    right: 25,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  langToggleText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#64748B',
  },
  pageTitleText: {
    fontSize: 32,
    fontWeight: '900',
    letterSpacing: -0.5,
  },
  navLogoutBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#FFF1F2',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#FEE2E2',
    shadowColor: '#EF4444',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 2,
  },
  avatarPickerSection: {
    alignItems: 'center',
    marginTop: 10,
    marginBottom: 10,
  },
  avatarTouchArea: {
    position: 'relative',
  },
  avatarOuterRing: {
    width: 130,
    height: 130,
    borderRadius: 65,
    borderWidth: 2,
    borderStyle: 'dashed',
    padding: 6,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarFullPreview: {
    width: '100%',
    height: '100%',
    borderRadius: 60,
  },
  avatarEmptyState: {
    width: '100%',
    height: '100%',
    borderRadius: 60,
    backgroundColor: '#F8FAFC',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
  },
  cameraIconCircle: {
    width: 54,
    height: 54,
    borderRadius: 27,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarInstruction: {
    fontSize: 12,
    fontWeight: '800',
    color: '#64748B',
    textTransform: 'uppercase',
  },
  editBadge: {
    position: 'absolute',
    bottom: 5,
    right: 5,
    width: 32,
    height: 32,
    borderRadius: 16,
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
  chipRow: {
    paddingVertical: 10,
    gap: 12,
  },
  cropChip: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: '#E2E8F0',
    backgroundColor: '#fff',
  },
  chipText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#64748B',
  },
  dropdownTrigger: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: '#E2E8F0',
    backgroundColor: '#fff',
  },
  dropdownValue: {
    fontSize: 16,
    fontWeight: '600',
    color: '#334155',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    paddingHorizontal: 20,
    paddingTop: 20,
    maxHeight: '80%',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20,
    paddingHorizontal: 10,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#1E293B',
  },
  varietyOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 18,
    paddingHorizontal: 16,
    borderRadius: 16,
    marginBottom: 8,
    backgroundColor: '#F8FAFC',
  },
  varietyOptionSelected: {
    backgroundColor: '#EEF2FF',
    borderWidth: 1,
    borderColor: '#6366F1',
  },
  optionText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#475569',
  },
  formContainer: {
    padding: 25,
    backgroundColor: 'transparent',
    gap: 24,
  },
  inputGroup: {
    gap: 10,
  },
  row: {
    flexDirection: 'row',
    gap: 18,
  },
  label: {
    fontSize: 14,
    fontWeight: '800',
    color: '#475569',
    marginLeft: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  input: {
    borderWidth: 2,
    borderRadius: 20,
    padding: 18,
    fontSize: 16,
    fontWeight: '600',
    backgroundColor: '#fff',
  },
  inputFocused: {
    shadowColor: '#10B981',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 4,
  },
  primaryButton: {
    paddingVertical: 20,
    borderRadius: 24,
    alignItems: 'center',
    marginTop: 20,
    shadowColor: '#10B981',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 15,
    elevation: 8,
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  buttonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  selectedCropsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 10,
  },
  selectedCropBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    gap: 8,
  },
  selectedCropText: {
    fontSize: 14,
    fontWeight: '700',
  },
  addCropBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 16,
    borderWidth: 2,
    borderStyle: 'dashed',
    gap: 10,
    marginTop: -10,
    marginBottom: 10,
  },
  addCropBtnText: {
    fontSize: 15,
    fontWeight: '800',
  },
});
