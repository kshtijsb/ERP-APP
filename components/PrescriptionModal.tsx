import React, { useState } from 'react';
import { StyleSheet, View, TextInput, TouchableOpacity, ActivityIndicator, Alert, Modal, Image, useColorScheme } from 'react-native';
import { ThemedText } from './themed-text';
import { ThemedView } from './themed-view';
import { IconSymbol } from './ui/icon-symbol';
import { Colors } from '@/constants/theme';
import * as ImagePicker from 'expo-image-picker';
import { savePrescriptionOffline } from '@/lib/offline-db';
import { syncOfflineData } from '@/lib/sync-engine';

interface PrescriptionModalProps {
  isVisible: boolean;
  onClose: () => void;
  farmerId: string;
  onSave: () => void;
}

export function PrescriptionModal({ isVisible, onClose, farmerId, onSave }: PrescriptionModalProps) {
  const colorScheme = useColorScheme();
  const [prescriptionText, setPrescriptionText] = useState('');
  const [prescriptionImage, setPrescriptionImage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const pickImage = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission Denied', 'Camera access is required to take a photo.');
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      allowsEditing: true,
      aspect: [4, 3],
      quality: 0.7,
    });

    if (!result.canceled) {
      setPrescriptionImage(result.assets[0].uri);
    }
  };

  const handleSave = async () => {
    if (!prescriptionText.trim()) {
      Alert.alert('Error', 'Please enter prescription text');
      return;
    }

    setSaving(true);
    try {
      await savePrescriptionOffline({
        farmer_id: farmerId,
        prescription_text: prescriptionText,
        image_uri: prescriptionImage
      });
      
      setPrescriptionText('');
      setPrescriptionImage(null);
      onSave();
      syncOfflineData();
      onClose();
      Alert.alert('Success', 'Prescription saved successfully');
    } catch (e) {
      console.error('Save Prescription Error:', e);
      Alert.alert('Error', 'Failed to save prescription');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      visible={isVisible}
      animationType="slide"
      transparent={true}
      onRequestClose={onClose}
    >
      <View style={styles.modalContainer}>
        <ThemedView style={styles.modalContent}>
          <View style={styles.modalHeader}>
            <ThemedText style={styles.modalTitle}>Issue Field Prescription</ThemedText>
            <TouchableOpacity onPress={onClose}>
              <IconSymbol name="xmark.circle.fill" size={24} color="#94A3B8" />
            </TouchableOpacity>
          </View>

          <ThemedText style={styles.label}>Prescription Details</ThemedText>
          <TextInput
            style={[styles.input, { color: Colors[colorScheme ?? 'light'].text, borderColor: Colors[colorScheme ?? 'light'].border }]}
            placeholder="Describe treatment or advice..."
            placeholderTextColor="#94A3B8"
            multiline
            value={prescriptionText}
            onChangeText={setPrescriptionText}
          />

          <ThemedText style={styles.label}>Evidence Photo (Optional)</ThemedText>
          <TouchableOpacity style={styles.photoSelector} onPress={pickImage}>
            {prescriptionImage ? (
              <Image source={{ uri: prescriptionImage }} style={styles.previewImage} />
            ) : (
              <>
                <IconSymbol name="camera.fill" size={32} color="#94A3B8" />
                <ThemedText style={styles.photoSelectorText}>Take Photo of Crop/Issue</ThemedText>
              </>
            )}
          </TouchableOpacity>

          <TouchableOpacity 
            style={[styles.submitButton, { backgroundColor: '#6366F1' }]} 
            onPress={handleSave}
            disabled={saving}
          >
            {saving ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <ThemedText style={styles.submitButtonText}>Save & Sync Prescription</ThemedText>
            )}
          </TouchableOpacity>
          
          <View style={{ height: 40 }} />
        </ThemedView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalContainer: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
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
  label: {
    fontSize: 12,
    fontWeight: '800',
    color: '#64748B',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  input: {
    borderWidth: 1.5,
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
});
