import React, { useState, useEffect } from 'react';
import { StyleSheet, View, FlatList, RefreshControl, TouchableOpacity, Image, useColorScheme, ActivityIndicator, Alert, Modal, TextInput, ScrollView } from 'react-native';
import { Stack } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors } from '@/constants/theme';
import { useAuth } from '@/context/auth-context';

interface Update {
  id: string;
  title: string;
  content: string;
  image_url: string | null;
  category: string;
  created_at: string;
}

export default function UpdatesScreen() {
  const colorScheme = useColorScheme();
  const { role, signOut } = useAuth();
  const [updates, setUpdates] = useState<Update[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [newUpdate, setNewUpdate] = useState({ title: '', content: '', category: 'Product', image_url: '' });
  const [saving, setSaving] = useState(false);

  const fetchUpdates = async () => {
    try {
      const { data, error } = await supabase
        .from('updates')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      
      if (data && data.length > 0) {
        setUpdates(data);
      } else {
        // Mock data if DB is empty
        setUpdates([
          {
            id: '1',
            title: 'New Bio-Enhancer Seeds Arrived!',
            content: 'Our latest batch of high-yield cotton seeds treated with bio-enhancers is now available. Visit the nearest center to collect your quota.',
            image_url: 'https://images.unsplash.com/photo-1598971861713-54ad16a7e718?q=80&w=500&auto=format&fit=crop',
            category: 'Product',
            created_at: new Date().toISOString()
          },
          {
            id: '2',
            title: 'Monsoon Alert: Preparedness Guide',
            content: 'Heavy rainfall expected next week. Ensure proper drainage in your fields. Check the app for specific soil treatment recommendations.',
            image_url: 'https://images.unsplash.com/photo-1515694346937-94d85e41e6f0?q=80&w=500&auto=format&fit=crop',
            category: 'Alert',
            created_at: new Date(Date.now() - 86400000).toISOString()
          }
        ]);
      }
    } catch (error: any) {
      console.error('Error fetching updates:', error.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUpdates();
  }, []);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchUpdates();
    setRefreshing(false);
  };

  const handleSaveUpdate = async () => {
    if (!newUpdate.title || !newUpdate.content) {
      Alert.alert('Details Missing', 'Please provide at least a title and some content for the broadcast.');
      return;
    }

    setSaving(true);
    try {
      const { error } = await supabase
        .from('updates')
        .insert([newUpdate]);

      if (error) throw error;

      Alert.alert('Broadcast Live!', 'Your update has been shared with all users.');
      setModalVisible(false);
      setNewUpdate({ title: '', content: '', category: 'Product', image_url: '' });
      fetchUpdates();
    } catch (error: any) {
      Alert.alert('Error', error.message);
    } finally {
      setSaving(false);
    }
  };

  const handleLogout = () => {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign Out', style: 'destructive', onPress: signOut }
    ]);
  };

  const renderItem = ({ item }: { item: Update }) => (
    <ThemedView style={[styles.card, { backgroundColor: Colors[colorScheme ?? 'light'].card, borderColor: Colors[colorScheme ?? 'light'].border }]}>
      {item.image_url && (
        <Image source={{ uri: item.image_url }} style={styles.cardImage} />
      )}
      <View style={styles.cardContent}>
        <View style={styles.categoryBadge}>
          <ThemedText style={styles.categoryText}>{item.category}</ThemedText>
        </View>
        <ThemedText type="defaultSemiBold" style={styles.title}>{item.title}</ThemedText>
        <ThemedText style={styles.content}>{item.content}</ThemedText>
        <ThemedText style={styles.date}>{new Date(item.created_at).toLocaleDateString()}</ThemedText>
      </View>
    </ThemedView>
  );

  return (
    <View style={[styles.container, { backgroundColor: Colors[colorScheme ?? 'light'].background }]}>
      <View style={styles.header}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <View style={{ flex: 1 }}>
            <ThemedText type="title" style={[styles.headerTitle, { color: Colors[colorScheme ?? 'light'].tint }]}>Marketing Hub</ThemedText>
            <ThemedText style={styles.headerSubtitle}>Broadcast updates & new products</ThemedText>
          </View>
          <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}>
            <IconSymbol name="rectangle.portrait.and.arrow.right" size={22} color="#EF4444" />
          </TouchableOpacity>
        </View>
      </View>

      <FlatList
        data={updates}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={styles.listContainer}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors[colorScheme ?? 'light'].tint} />
        }
        ListEmptyComponent={
          loading ? (
            <ActivityIndicator size="large" color={Colors[colorScheme ?? 'light'].tint} style={{ marginTop: 50 }} />
          ) : (
            <View style={styles.emptyContainer}>
              <IconSymbol name="newspaper" size={60} color="#CBD5E1" />
              <ThemedText style={styles.emptyText}>No updates yet. Check back later!</ThemedText>
            </View>
          )
        }
      />

      {(role === 'superadmin' || role === 'expert') && (
        <TouchableOpacity 
          style={[styles.fab, { backgroundColor: Colors[colorScheme ?? 'light'].tint }]}
          onPress={() => setModalVisible(true)}
        >
          <IconSymbol name="plus" size={24} color="#fff" />
        </TouchableOpacity>
      )}

      <Modal
        visible={modalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <ThemedView style={[styles.modalContent, { backgroundColor: Colors[colorScheme ?? 'light'].background }]}>
            <View style={styles.modalHeader}>
              <ThemedText type="title">Create Broadcast</ThemedText>
              <TouchableOpacity onPress={() => setModalVisible(false)}>
                <IconSymbol name="xmark.circle.fill" size={24} color="#94A3B8" />
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={styles.modalScroll}>
              <ThemedText style={styles.inputLabel}>Title</ThemedText>
              <TextInput
                style={[styles.input, { color: Colors[colorScheme ?? 'light'].text, borderColor: Colors[colorScheme ?? 'light'].border }]}
                placeholder="Ex: New High-Yield Seeds"
                placeholderTextColor="#94A3B8"
                value={newUpdate.title}
                onChangeText={(text) => setNewUpdate({ ...newUpdate, title: text })}
              />

              <ThemedText style={styles.inputLabel}>Category</ThemedText>
              <View style={styles.categoryRow}>
                {['Product', 'Alert', 'Education'].map((cat) => (
                  <TouchableOpacity
                    key={cat}
                    style={[
                      styles.categoryBtn,
                      newUpdate.category === cat && { backgroundColor: Colors[colorScheme ?? 'light'].tint }
                    ]}
                    onPress={() => setNewUpdate({ ...newUpdate, category: cat })}
                  >
                    <ThemedText style={[styles.categoryBtnText, newUpdate.category === cat && { color: '#fff' }]}>{cat}</ThemedText>
                  </TouchableOpacity>
                ))}
              </View>

              <ThemedText style={styles.inputLabel}>Image URL (Optional)</ThemedText>
              <TextInput
                style={[styles.input, { color: Colors[colorScheme ?? 'light'].text, borderColor: Colors[colorScheme ?? 'light'].border }]}
                placeholder="https://example.com/image.jpg"
                placeholderTextColor="#94A3B8"
                value={newUpdate.image_url}
                onChangeText={(text) => setNewUpdate({ ...newUpdate, image_url: text })}
              />

              <ThemedText style={styles.inputLabel}>Broadcast Content</ThemedText>
              <TextInput
                style={[styles.input, styles.textArea, { color: Colors[colorScheme ?? 'light'].text, borderColor: Colors[colorScheme ?? 'light'].border }]}
                placeholder="Write your update here..."
                placeholderTextColor="#94A3B8"
                multiline
                numberOfLines={4}
                value={newUpdate.content}
                onChangeText={(text) => setNewUpdate({ ...newUpdate, content: text })}
              />

              <TouchableOpacity
                style={[styles.broadcastBtn, { backgroundColor: Colors[colorScheme ?? 'light'].tint }, saving && { opacity: 0.7 }]}
                onPress={handleSaveUpdate}
                disabled={saving}
              >
                {saving ? <ActivityIndicator color="#fff" /> : <ThemedText style={styles.broadcastBtnText}>Go Live</ThemedText>}
              </TouchableOpacity>
            </ScrollView>
          </ThemedView>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    paddingTop: 60,
    paddingHorizontal: 25,
    paddingBottom: 20,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: '900',
  },
  headerSubtitle: {
    fontSize: 14,
    color: '#64748B',
    marginTop: 4,
  },
  listContainer: {
    paddingHorizontal: 20,
    paddingBottom: 100,
    gap: 20,
  },
  card: {
    borderRadius: 24,
    borderWidth: 1.5,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 2,
  },
  cardImage: {
    width: '100%',
    height: 180,
    resizeMode: 'cover',
  },
  cardContent: {
    padding: 16,
  },
  categoryBadge: {
    backgroundColor: '#F0FDF4',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    alignSelf: 'flex-start',
    marginBottom: 8,
  },
  categoryText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#15803D',
    textTransform: 'uppercase',
  },
  title: {
    fontSize: 18,
    marginBottom: 8,
  },
  content: {
    fontSize: 14,
    color: '#64748B',
    lineHeight: 20,
    marginBottom: 12,
  },
  date: {
    fontSize: 12,
    color: '#94A3B8',
    fontWeight: '600',
  },
  fab: {
    position: 'absolute',
    bottom: 30,
    right: 30,
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
  },
  emptyContainer: {
    alignItems: 'center',
    marginTop: 100,
    gap: 15,
  },
  emptyText: {
    color: '#94A3B8',
    fontSize: 15,
    fontWeight: '600',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    padding: 25,
    maxHeight: '85%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  modalScroll: {
    paddingBottom: 40,
  },
  inputLabel: {
    fontSize: 13,
    fontWeight: '800',
    color: '#64748B',
    marginBottom: 8,
    marginTop: 15,
    textTransform: 'uppercase',
  },
  input: {
    borderWidth: 1.5,
    borderRadius: 12,
    paddingHorizontal: 15,
    paddingVertical: 12,
    fontSize: 16,
  },
  textArea: {
    height: 120,
    textAlignVertical: 'top',
  },
  categoryRow: {
    flexDirection: 'row',
    gap: 10,
  },
  categoryBtn: {
    paddingHorizontal: 15,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
  },
  categoryBtnText: {
    fontSize: 12,
    fontWeight: '700',
  },
  broadcastBtn: {
    marginTop: 30,
    paddingVertical: 18,
    borderRadius: 15,
    alignItems: 'center',
  },
  broadcastBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '800',
  },
  logoutBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#FFF5F5',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#FEE2E2',
  },
});
