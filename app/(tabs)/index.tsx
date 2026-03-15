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

export default function FarmerFormScreen() {
  const colorScheme = useColorScheme();
  const router = useRouter();
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    phone_number: '',
    land_area: '',
    crop_type: '',
    crop_duration: '',
  });
  const [focusedInput, setFocusedInput] = useState<string | null>(null);
  const [isOffline, setIsOffline] = useState(false);

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
              crop_type: formData.crop_type,
              crop_duration: formData.crop_duration,
            },
          ])
          .select('id, name')
          .single();

        if (farmerError) throw farmerError;

        // 2. Navigation
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
      <ThemedView style={styles.heroSection}>
        <View style={styles.logoRow}>
          <Image 
            source={require('@/assets/images/logo.png')} 
            style={styles.brandLogo} 
            resizeMode="contain"
          />
          <View>
            <ThemedText type="title" style={[styles.heroTitle, { color: Colors[colorScheme ?? 'light'].tint }]}>Farmer Hub</ThemedText>
            <ThemedText type="default" style={styles.heroSubtitle}>Register & Map Success</ThemedText>
          </View>
        </View>
      </ThemedView>

      <View style={styles.photoContainer}>
        <TouchableOpacity style={styles.photoIconButton} onPress={pickImage}>
          {image ? (
            <Image source={{ uri: image }} style={styles.profilePreview} />
          ) : (
            <View style={styles.photoPlaceholder}>
              <IconSymbol name="camera.fill" size={32} color="#15803D" />
              <ThemedText style={styles.photoText}>Farmer Photo</ThemedText>
            </View>
          )}
        </TouchableOpacity>
      </View>

      <ThemedView style={styles.formContainer}>
        <ThemedView style={styles.inputGroup}>
          <ThemedText style={styles.label}>Full Name *</ThemedText>
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
          <ThemedText style={styles.label}>Phone Number</ThemedText>
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

        <View style={styles.row}>
          <ThemedView style={[styles.inputGroup, { flex: 1 }]}>
            <ThemedText style={styles.label}>Land (Acres)</ThemedText>
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
            <ThemedText style={styles.label}>Crop Type</ThemedText>
            <TextInput
              style={getInputStyle('crop')}
              placeholder="e.g. Cotton"
              placeholderTextColor="#94A3B8"
              value={formData.crop_type}
              onFocus={() => setFocusedInput('crop')}
              onBlur={() => setFocusedInput(null)}
              onChangeText={(text) => setFormData({ ...formData, crop_type: text })}
            />
          </ThemedView>
        </View>

        <ThemedView style={styles.inputGroup}>
          <ThemedText style={styles.label}>Duration</ThemedText>
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

        <TouchableOpacity
          style={[styles.primaryButton, { backgroundColor: Colors[colorScheme ?? 'light'].tint }, loading && styles.buttonDisabled]}
          onPress={handleSaveAndMap}
          disabled={loading}>
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <ThemedText style={styles.buttonText}>Save & Start GIS Mapping</ThemedText>
          )}
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
  heroSection: {
    paddingTop: 80,
    paddingHorizontal: 25,
    paddingBottom: 10,
    backgroundColor: 'transparent',
  },
  heroTitle: {
    fontSize: 34,
    fontWeight: '900',
    color: '#22C55E', // Match the new Spring Green
    letterSpacing: -1,
  },
  heroSubtitle: {
    fontSize: 16,
    marginTop: 2,
    color: '#64748B',
    lineHeight: 24,
  },
  logoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 15,
  },
  brandLogo: {
    width: 60,
    height: 60,
    borderRadius: 15,
  },
  photoContainer: {
    alignItems: 'center',
    marginTop: 10,
  },
  photoIconButton: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: '#F1F5F9',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#E2E8F0',
    borderStyle: 'dashed',
    overflow: 'hidden',
  },
  photoPlaceholder: {
    alignItems: 'center',
    gap: 8,
  },
  profilePreview: {
    width: '100%',
    height: '100%',
  },
  photoText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#15803D',
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
    fontWeight: '700',
    color: '#334155',
    marginLeft: 2,
    letterSpacing: 0.3,
  },
  input: {
    borderWidth: 1.5,
    borderRadius: 16,
    padding: 16,
    fontSize: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 10,
    elevation: 2,
  },
  inputFocused: {
    shadowOpacity: 0.1,
    shadowRadius: 15,
    elevation: 4,
  },
  primaryButton: {
    padding: 20,
    borderRadius: 20,
    alignItems: 'center',
    marginTop: 20,
    shadowColor: '#15803D',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 10,
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  buttonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
});
