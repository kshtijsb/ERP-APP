import React, { useState } from 'react';
import { StyleSheet, View, TextInput, TouchableOpacity, Modal, ScrollView, Alert, ActivityIndicator, useColorScheme } from 'react-native';
import { ThemedText } from './themed-text';
import { ThemedView } from './themed-view';
import { IconSymbol } from './ui/icon-symbol';
import { Colors } from '@/constants/theme';
import { saveScheduleOffline } from '@/lib/offline-db';
import { syncOfflineData } from '@/lib/sync-engine';

interface ScheduleModalProps {
  visible: boolean;
  onClose: () => void;
  farmerId: string;
  onSuccess: () => void;
}

export function ScheduleModal({ visible, onClose, farmerId, onSuccess }: ScheduleModalProps) {
  const colorScheme = useColorScheme();
  const [loading, setLoading] = useState(false);
  const [type, setType] = useState<'irrigation' | 'spray'>('irrigation');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [frequency, setFrequency] = useState<'daily' | 'weekly' | 'bi-weekly' | 'custom'>('daily');
  const [days, setDays] = useState('7');

  const handleSubmit = async () => {
    if (!title) {
      Alert.alert('Error', 'Please enter a title for the schedule');
      return;
    }

    setLoading(true);
    try {
      const startDate = new Date().toISOString();
      const endDate = new Date(Date.now() + parseInt(days) * 24 * 60 * 60 * 1000).toISOString();

      await saveScheduleOffline({
        farmer_id: farmerId,
        type,
        title,
        description,
        start_date: startDate,
        end_date: endDate,
        frequency,
        status: 'active',
      });

      // Trigger sync immediately to push to cloud
      syncOfflineData();

      Alert.alert('Success', `${type === 'irrigation' ? 'Irrigation' : 'Spray'} schedule created successfully!`);
      onSuccess();
      onClose();
      // Reset form
      setTitle('');
      setDescription('');
    } catch (e) {
      console.error('Save Schedule Error:', e);
      Alert.alert('Error', 'Failed to save schedule');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={styles.modalOverlay}>
        <ThemedView style={styles.modalContent}>
          <View style={styles.header}>
            <ThemedText type="title">Create Schedule</ThemedText>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <IconSymbol name="xmark.circle.fill" size={24} color="#94A3B8" />
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false}>
            {/* Type Selector */}
            <View style={styles.typeSelector}>
              <TouchableOpacity 
                style={[styles.typeBtn, type === 'irrigation' && { backgroundColor: '#3B82F6' }]}
                onPress={() => setType('irrigation')}
              >
                <IconSymbol name="drop.fill" size={16} color={type === 'irrigation' ? '#fff' : '#64748B'} />
                <ThemedText style={[styles.typeText, type === 'irrigation' && { color: '#fff' }]}>Irrigation</ThemedText>
              </TouchableOpacity>
              <TouchableOpacity 
                style={[styles.typeBtn, type === 'spray' && { backgroundColor: '#10B981' }]}
                onPress={() => setType('spray')}
              >
                <IconSymbol name="bubbles.and.sparkles.fill" size={16} color={type === 'spray' ? '#fff' : '#64748B'} />
                <ThemedText style={[styles.typeText, type === 'spray' && { color: '#fff' }]}>Spray</ThemedText>
              </TouchableOpacity>
            </View>

            <View style={styles.inputGroup}>
              <ThemedText style={styles.label}>Schedule Title</ThemedText>
              <TextInput
                style={[styles.input, { color: Colors[colorScheme ?? 'light'].text, borderColor: Colors[colorScheme ?? 'light'].border }]}
                placeholder={type === 'irrigation' ? 'e.g. Drip - Morning Cycle' : 'e.g. Neem Oil Spraying'}
                placeholderTextColor="#94A3B8"
                value={title}
                onChangeText={setTitle}
              />
            </View>

            <View style={styles.inputGroup}>
              <ThemedText style={styles.label}>Frequency</ThemedText>
              <View style={styles.freqContainer}>
                {(['daily', 'weekly', 'bi-weekly'] as const).map((f) => (
                  <TouchableOpacity 
                    key={f}
                    style={[styles.freqBtn, frequency === f && styles.freqBtnActive]}
                    onPress={() => setFrequency(f)}
                  >
                    <ThemedText style={[styles.freqText, frequency === f && styles.freqTextActive]}>
                      {f.charAt(0).toUpperCase() + f.slice(1)}
                    </ThemedText>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <View style={styles.inputGroup}>
              <ThemedText style={styles.label}>Duration (Days)</ThemedText>
              <TextInput
                style={[styles.input, { color: Colors[colorScheme ?? 'light'].text, borderColor: Colors[colorScheme ?? 'light'].border }]}
                keyboardType="numeric"
                value={days}
                onChangeText={setDays}
              />
            </View>

            <View style={styles.inputGroup}>
              <ThemedText style={styles.label}>Notes / Description</ThemedText>
              <TextInput
                style={[styles.input, styles.textArea, { color: Colors[colorScheme ?? 'light'].text, borderColor: Colors[colorScheme ?? 'light'].border }]}
                placeholder="Specific instructions for the farmer..."
                placeholderTextColor="#94A3B8"
                multiline
                numberOfLines={4}
                value={description}
                onChangeText={setDescription}
              />
            </View>

            <TouchableOpacity 
              style={[styles.submitBtn, { backgroundColor: type === 'irrigation' ? '#3B82F6' : '#10B981' }]} 
              onPress={handleSubmit}
              disabled={loading}
            >
              {loading ? <ActivityIndicator color="#fff" /> : <ThemedText style={styles.submitText}>Activate Schedule</ThemedText>}
            </TouchableOpacity>
          </ScrollView>
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
    height: '80%',
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
  typeSelector: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 24,
  },
  typeBtn: {
    flex: 1,
    height: 48,
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#F1F5F9',
  },
  typeText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#64748B',
  },
  inputGroup: {
    marginBottom: 20,
  },
  label: {
    fontSize: 14,
    fontWeight: '700',
    color: '#64748B',
    marginBottom: 8,
    marginLeft: 4,
  },
  input: {
    height: 56,
    borderWidth: 1.5,
    borderRadius: 16,
    paddingHorizontal: 16,
    fontSize: 16,
    fontWeight: '600',
  },
  textArea: {
    height: 100,
    paddingTop: 16,
    textAlignVertical: 'top',
  },
  freqContainer: {
    flexDirection: 'row',
    gap: 8,
  },
  freqBtn: {
    flex: 1,
    height: 40,
    borderRadius: 10,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  freqBtnActive: {
    backgroundColor: '#334155',
  },
  freqText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#64748B',
  },
  freqTextActive: {
    color: '#fff',
  },
  submitBtn: {
    height: 60,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 10,
    marginBottom: 30,
  },
  submitText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '800',
  },
});
