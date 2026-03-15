import React, { useState } from 'react';
import { Modal, StyleSheet, TextInput, TouchableOpacity, View, Alert, useColorScheme, Platform } from 'react-native';
import { ThemedText } from './themed-text';
import { ThemedView } from './themed-view';
import { IconSymbol } from './ui/icon-symbol';
import { Colors } from '@/constants/theme';
import { saveTreatmentLogOffline } from '@/lib/offline-db';
import { syncOfflineData } from '@/lib/sync-engine';

interface TreatmentModalProps {
  isVisible: boolean;
  onClose: () => void;
  farmerId: string;
  onSave: () => void;
}

export function TreatmentModal({ isVisible, onClose, farmerId, onSave }: TreatmentModalProps) {
  const colorScheme = useColorScheme();
  const [productName, setProductName] = useState('');
  const [quantity, setQuantity] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSave = async () => {
    if (!productName.trim()) {
      Alert.alert('Required Info', 'Please enter the product name used.');
      return;
    }

    setLoading(true);
    try {
      await saveTreatmentLogOffline({
        farmer_id: farmerId,
        product_name: productName.trim(),
        quantity: quantity.trim(),
        application_date: new Date().toISOString()
      });

      syncOfflineData();

      Alert.alert('Success', 'Farm treatment recorded successfully! The record will sync once online.');
      setProductName('');
      setQuantity('');
      onSave();
      onClose();
    } catch (error: any) {
      console.error('Treatment Save Error:', error);
      Alert.alert('Save Failed', 'Could not record treatment locally.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal visible={isVisible} animationType="slide" transparent>
      <View style={styles.modalOverlay}>
        <ThemedView style={styles.modalContent}>
          <View style={styles.header}>
            <ThemedText type="subtitle">Record Farm Input</ThemedText>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <IconSymbol name="xmark" size={20} color="#94A3B8" />
            </TouchableOpacity>
          </View>

          <View style={styles.field}>
            <ThemedText style={styles.label}>Product Name / Chemical</ThemedText>
            <TextInput
              style={[styles.input, { color: Colors[colorScheme ?? 'light'].text, borderColor: Colors[colorScheme ?? 'light'].border }]}
              placeholder="e.g. Urea, Neem Oil, Seed Variety..."
              placeholderTextColor="#94A3B8"
              value={productName}
              onChangeText={setProductName}
            />
          </View>

          <View style={styles.field}>
            <ThemedText style={styles.label}>Quantity / Dosage</ThemedText>
            <TextInput
              style={[styles.input, { color: Colors[colorScheme ?? 'light'].text, borderColor: Colors[colorScheme ?? 'light'].border }]}
              placeholder="e.g. 50kg, 2 Liters per Acre..."
              placeholderTextColor="#94A3B8"
              value={quantity}
              onChangeText={setQuantity}
            />
          </View>

          <TouchableOpacity 
            style={[styles.saveButton, { backgroundColor: Colors[colorScheme ?? 'light'].tint }, loading && styles.buttonDisabled]} 
            onPress={handleSave}
            disabled={loading}
          >
            <ThemedText style={styles.saveButtonText}>
              {loading ? 'Recording...' : 'Record Input Application'}
            </ThemedText>
          </TouchableOpacity>
        </ThemedView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    padding: 24,
    paddingBottom: Platform.OS === 'ios' ? 40 : 24,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
  },
  closeBtn: {
    padding: 4,
  },
  field: {
    marginBottom: 20,
  },
  label: {
    fontSize: 14,
    fontWeight: '700',
    color: '#64748B',
    marginBottom: 8,
  },
  input: {
    height: 56,
    borderWidth: 1.5,
    borderRadius: 16,
    paddingHorizontal: 16,
    fontSize: 16,
    backgroundColor: '#F8FAFC',
  },
  saveButton: {
    height: 56,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 10,
  },
  saveButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '800',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
});
