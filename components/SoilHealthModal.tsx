import React, { useState } from 'react';
import { Modal, StyleSheet, TextInput, View, TouchableOpacity, ScrollView, Alert, useColorScheme } from 'react-native';
import { ThemedText } from './themed-text';
import { ThemedView } from './themed-view';
import { IconSymbol } from './ui/icon-symbol';
import { Colors } from '@/constants/theme';
import { saveSoilHealthOffline } from '@/lib/offline-db';
import { syncOfflineData } from '@/lib/sync-engine';

interface SoilHealthModalProps {
  isVisible: boolean;
  onClose: () => void;
  farmerId: string;
  onSave: () => void;
}

export function SoilHealthModal({ isVisible, onClose, farmerId, onSave }: SoilHealthModalProps) {
  const colorScheme = useColorScheme();
  const [ph, setPh] = useState('');
  const [n, setN] = useState('');
  const [p, setP] = useState('');
  const [k, setK] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const handleSave = async () => {
    const phVal = parseFloat(ph);
    const nVal = parseFloat(n);
    const pVal = parseFloat(p);
    const kVal = parseFloat(k);

    if (isNaN(phVal) || isNaN(nVal) || isNaN(pVal) || isNaN(kVal)) {
      Alert.alert('Error', 'Please enter valid numbers for all fields');
      return;
    }

    setIsSaving(true);
    try {
      await saveSoilHealthOffline({
        farmer_id: farmerId,
        ph: phVal,
        nitrogen: nVal,
        phosphorus: pVal,
        potassium: kVal
      });
      
      syncOfflineData();
      
      setPh('');
      setN('');
      setP('');
      setK('');
      onSave();
      onClose();
    } catch (error) {
      console.error('Failed to save soil health:', error);
      Alert.alert('Error', 'Failed to save soil health record');
    } finally {
      setIsSaving(false);
    }
  };

  const renderInput = (label: string, value: string, setValue: (v: string) => void, placeholder: string, icon: any, color: string) => (
    <View style={styles.inputGroup}>
      <ThemedText style={styles.label}>{label}</ThemedText>
      <View style={[styles.inputWrapper, { borderColor: Colors[colorScheme ?? 'light'].border }]}>
        <View style={[styles.inputIcon, { backgroundColor: color + '15' }]}>
          <IconSymbol name={icon} size={16} color={color} />
        </View>
        <TextInput
          style={[styles.input, { color: colorScheme === 'dark' ? '#fff' : '#000' }]}
          placeholder={placeholder}
          placeholderTextColor="#999"
          keyboardType="numeric"
          value={value}
          onChangeText={setValue}
        />
      </View>
    </View>
  );

  return (
    <Modal visible={isVisible} animationType="slide" transparent>
      <View style={styles.modalOverlay}>
        <ThemedView style={styles.modalContent}>
          <View style={styles.header}>
            <ThemedText type="subtitle">Soil Health Record</ThemedText>
            <TouchableOpacity onPress={onClose} disabled={isSaving}>
              <IconSymbol name="xmark.circle.fill" size={24} color="#999" />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.form}>
            <ThemedText style={styles.description}>
              Record the latest soil test results to provide better agronomic advice.
            </ThemedText>

            {renderInput('Soil pH Level', ph, setPh, 'e.g., 6.5', 'drop.fill', '#3B82F6')}
            
            <ThemedText style={styles.sectionTitle}>Macronutrients (mg/kg)</ThemedText>
            
            <View style={styles.row}>
              {renderInput('Nitrogen (N)', n, setN, 'N', 'leaf.fill', '#10B981')}
              {renderInput('Phosphorus (P)', p, setP, 'P', 'flame.fill', '#F59E0B')}
            </View>
            
            {renderInput('Potassium (K)', k, setK, 'K value', 'star.fill', '#8B5CF6')}
          </ScrollView>

          <TouchableOpacity 
            style={[styles.saveButton, { backgroundColor: Colors[colorScheme ?? 'light'].tint }]}
            onPress={handleSave}
            disabled={isSaving}
          >
            <ThemedText style={styles.saveButtonText}>
              {isSaving ? 'Saving...' : 'Save Soil Record'}
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
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    height: '65%',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  form: {
    flex: 1,
  },
  description: {
    fontSize: 14,
    color: '#64748B',
    marginBottom: 20,
    lineHeight: 20,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '800',
    marginTop: 24,
    marginBottom: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    opacity: 0.6,
  },
  inputGroup: {
    marginBottom: 16,
    flex: 1,
  },
  label: {
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 8,
    opacity: 0.8,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderRadius: 14,
    height: 54,
    overflow: 'hidden',
  },
  inputIcon: {
    width: 44,
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    borderRightWidth: 1,
    borderRightColor: '#f1f5f9',
  },
  input: {
    flex: 1,
    paddingHorizontal: 16,
    fontSize: 16,
    fontWeight: '600',
  },
  row: {
    flexDirection: 'row',
    gap: 12,
  },
  saveButton: {
    padding: 16,
    borderRadius: 16,
    alignItems: 'center',
    marginTop: 20,
  },
  saveButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
  },
});
