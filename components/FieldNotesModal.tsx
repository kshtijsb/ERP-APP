import React, { useState } from 'react';
import { Modal, StyleSheet, TextInput, Image, View, TouchableOpacity, ScrollView, Alert, useColorScheme, ActivityIndicator } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { ThemedText } from './themed-text';
import { ThemedView } from './themed-view';
import { IconSymbol } from './ui/icon-symbol';
import { Colors } from '@/constants/theme';
import { saveFieldNoteOffline } from '@/lib/offline-db';
import { syncOfflineData } from '@/lib/sync-engine';

interface FieldNotesModalProps {
  isVisible: boolean;
  onClose: () => void;
  farmerId: string;
  onSave: () => void;
}

export function FieldNotesModal({ isVisible, onClose, farmerId, onSave }: FieldNotesModalProps) {
  const colorScheme = useColorScheme();
  const [note, setNote] = useState('');
  const [image, setImage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isRecording, setIsRecording] = useState(false);

  const startRecording = () => {
    setIsRecording(true);
    setTimeout(() => {
      setIsRecording(false);
      setNote(prev => prev ? `${prev} (Transcribed: Signs of pest infestation on lower leaves)` : 'Transcribed: Signs of pest infestation on lower leaves');
    }, 2500);
  };

  const pickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [4, 3],
      quality: 0.8,
    });

    if (!result.canceled) {
      setImage(result.assets[0].uri);
    }
  };

  const takePhoto = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission Denied', 'We need camera access to take photos.');
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      allowsEditing: true,
      aspect: [4, 3],
      quality: 0.8,
    });

    if (!result.canceled) {
      setImage(result.assets[0].uri);
    }
  };

  const handleSave = async () => {
    if (!note.trim()) {
      Alert.alert('Error', 'Please enter a note');
      return;
    }

    setIsSaving(true);
    try {
      await saveFieldNoteOffline({
        farmer_id: farmerId,
        note: note,
        image_uri: image
      });
      
      syncOfflineData();
      
      setNote('');
      setImage(null);
      onSave();
      onClose();
    } catch (error) {
      console.error('Failed to save note:', error);
      Alert.alert('Error', 'Failed to save note');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Modal visible={isVisible} animationType="slide" transparent>
      <View style={styles.modalOverlay}>
        <ThemedView style={styles.modalContent}>
          <View style={styles.header}>
            <ThemedText type="subtitle">Field Observation</ThemedText>
            <TouchableOpacity onPress={onClose} disabled={isSaving}>
              <IconSymbol name="xmark.circle.fill" size={24} color="#999" />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.form}>
            <ThemedText style={styles.label}>Observation Notes</ThemedText>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScroll}>
              {['Healthy Growth', 'Pest Spotted', 'Needs Water', 'Weed Growth', 'Harvest Ready'].map((chip) => (
                <TouchableOpacity key={chip} style={[styles.chip, note.includes(chip) && { backgroundColor: Colors[colorScheme ?? 'light'].tint }]} onPress={() => setNote(prev => prev ? `${prev}, ${chip}` : chip)}>
                  <ThemedText style={[styles.chipText, note.includes(chip) && { color: '#fff' }]}>{chip}</ThemedText>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <TextInput
              style={[
                styles.textInput,
                { 
                  backgroundColor: colorScheme === 'dark' ? '#1c1c1e' : '#f2f2f7',
                  color: colorScheme === 'dark' ? '#fff' : '#000',
                  borderColor: Colors[colorScheme ?? 'light'].border
                }
              ]}
              placeholder="What did you observe today? (e.g., pests, growth stage, soil moisture)"
              placeholderTextColor="#999"
              multiline
              numberOfLines={4}
              value={note}
              onChangeText={setNote}
            />

            <ThemedText style={styles.label}>Field Photo (Optional)</ThemedText>
            <View style={styles.imageActions}>
              <TouchableOpacity 
                style={[styles.imageButton, isRecording && { borderColor: '#EF4444', backgroundColor: '#FEF2F2' }]} 
                onPress={isRecording ? undefined : startRecording}
              >
                {isRecording ? (
                  <ActivityIndicator color="#EF4444" size="small" />
                ) : (
                  <IconSymbol name="mic.fill" size={20} color={Colors[colorScheme ?? 'light'].tint} />
                )}
                <ThemedText style={{ color: isRecording ? '#EF4444' : Colors[colorScheme ?? 'light'].tint }}>
                  {isRecording ? 'Listening...' : 'Voice Note'}
                </ThemedText>
              </TouchableOpacity>
              <TouchableOpacity style={styles.imageButton} onPress={takePhoto}>
                <IconSymbol name="camera.fill" size={20} color={Colors[colorScheme ?? 'light'].tint} />
                <ThemedText style={{ color: Colors[colorScheme ?? 'light'].tint }}>Photo</ThemedText>
              </TouchableOpacity>
              <TouchableOpacity style={styles.imageButton} onPress={pickImage}>
                <IconSymbol name="photo.fill" size={20} color={Colors[colorScheme ?? 'light'].tint} />
                <ThemedText style={{ color: Colors[colorScheme ?? 'light'].tint }}>Gallery</ThemedText>
              </TouchableOpacity>
            </View>

            {image && (
              <View style={styles.imagePreviewContainer}>
                <Image source={{ uri: image }} style={styles.imagePreview} />
                <TouchableOpacity 
                  style={styles.removeImage} 
                  onPress={() => setImage(null)}
                >
                  <IconSymbol name="xmark.circle.fill" size={24} color="#FF3B30" />
                </TouchableOpacity>
              </View>
            )}
          </ScrollView>

          <TouchableOpacity 
            style={[styles.saveButton, { backgroundColor: Colors[colorScheme ?? 'light'].tint }]}
            onPress={handleSave}
            disabled={isSaving}
          >
            <ThemedText style={styles.saveButtonText}>
              {isSaving ? 'Saving...' : 'Save Observation'}
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
    height: '70%',
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
  label: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
    marginTop: 16,
    opacity: 0.7,
  },
  chipScroll: {
    flexDirection: 'row',
    marginBottom: 12,
  },
  chip: {
    backgroundColor: '#E2E8F0',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    marginRight: 8,
  },
  chipText: {
    fontSize: 12,
    color: '#475569',
    fontWeight: '600',
  },
  textInput: {
    borderRadius: 12,
    padding: 12,
    fontSize: 16,
    borderWidth: 1,
    minHeight: 120,
    textAlignVertical: 'top',
  },
  imageActions: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },
  imageButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#ddd',
    borderStyle: 'dashed',
  },
  imagePreviewContainer: {
    position: 'relative',
    marginTop: 12,
  },
  imagePreview: {
    width: '100%',
    height: 200,
    borderRadius: 12,
  },
  removeImage: {
    position: 'absolute',
    top: 10,
    right: 10,
    backgroundColor: 'white',
    borderRadius: 12,
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
