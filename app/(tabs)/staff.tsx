import React, { useState, useEffect } from 'react';
import { StyleSheet, View, FlatList, TouchableOpacity, Alert, ActivityIndicator, useColorScheme, RefreshControl } from 'react-native';
import { Stack } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Colors } from '@/constants/theme';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useAuth } from '@/context/auth-context';

interface StaffProfile {
  id: string;
  email: string;
  role: 'superadmin' | 'expert' | 'staff';
  full_name: string | null;
  registrationCount?: number;
}

export default function StaffManagementScreen() {
  const colorScheme = useColorScheme();
  const { signOut } = useAuth();
  const [staff, setStaff] = useState<StaffProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchData = async () => {
    try {
      // 1. Fetch profiles
      const { data: profiles, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .order('role', { ascending: true });

      if (profileError) throw profileError;

      // 2. Fetch registration counts for each staff
      const { data: counts, error: countError } = await supabase
        .from('farmers')
        .select('created_by');

      if (countError) throw countError;

      const profileList = profiles.map(p => {
        const count = counts.filter(c => c.created_by === p.id).length;
        return { ...p, registrationCount: count };
      });

      setStaff(profileList);
    } catch (error: any) {
      Alert.alert('Error', error.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const changeRole = (staffMember: StaffProfile) => {
    Alert.alert(
      'Update Role',
      `Change role for ${staffMember.full_name || staffMember.email}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Staff', onPress: () => updateRole(staffMember.id, 'staff') },
        { text: 'Expert', onPress: () => updateRole(staffMember.id, 'expert') },
        { text: 'Superadmin', style: 'destructive', onPress: () => updateRole(staffMember.id, 'superadmin') },
      ]
    );
  };

  const updateRole = async (userId: string, newRole: string) => {
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ role: newRole })
        .eq('id', userId);

      if (error) throw error;
      Alert.alert('Success', 'Role updated successfully.');
      fetchData();
    } catch (error: any) {
      Alert.alert('Update Failed', error.message);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    fetchData();
  };

  const handleLogout = () => {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign Out', style: 'destructive', onPress: signOut }
    ]);
  };

  const renderItem = ({ item }: { item: StaffProfile }) => (
    <ThemedView style={[styles.card, { backgroundColor: Colors[colorScheme ?? 'light'].card, borderColor: Colors[colorScheme ?? 'light'].border }]}>
      <View style={styles.cardInfo}>
        <View style={[styles.avatarCircle, { backgroundColor: Colors[colorScheme ?? 'light'].tint + '15' }]}>
          <ThemedText style={[styles.avatarText, { color: Colors[colorScheme ?? 'light'].tint }]}>
            {(item.full_name || item.email)[0].toUpperCase()}
          </ThemedText>
        </View>
        <View style={{ flex: 1 }}>
          <ThemedText style={styles.staffName}>{item.full_name || 'Unnamed Staff'}</ThemedText>
          <ThemedText style={styles.staffEmail}>{item.email}</ThemedText>
          <View style={styles.statsRow}>
            <View style={[styles.roleBadge, { backgroundColor: item.role === 'superadmin' ? '#FEE2E2' : item.role === 'expert' ? '#E0F2FE' : '#F1F5F9' }]}>
              <ThemedText style={[styles.roleText, { color: item.role === 'superadmin' ? '#B91C1C' : item.role === 'expert' ? '#0369A1' : '#475569' }]}>
                {item.role.toUpperCase()}
              </ThemedText>
            </View>
            <ThemedText style={styles.statCount}>📦 {item.registrationCount} Registered</ThemedText>
          </View>
        </View>
        <TouchableOpacity style={styles.editBtn} onPress={() => changeRole(item)}>
          <IconSymbol name="ellipsis.circle.fill" size={24} color="#94A3B8" />
        </TouchableOpacity>
      </View>
    </ThemedView>
  );

  return (
    <ThemedView style={[styles.container, { backgroundColor: Colors[colorScheme ?? 'light'].background }]}>
      <Stack.Screen options={{ title: 'Staff Admin', headerShown: true }} />
      <View style={styles.header}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <View style={{ flex: 1 }}>
            <ThemedText type="title" style={[styles.headerTitle, { color: Colors[colorScheme ?? 'light'].tint }]}>Staff Hub</ThemedText>
            <ThemedText style={styles.headerSubtitle}>Manage access & monitor performance</ThemedText>
          </View>
          <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}>
            <IconSymbol name="rectangle.portrait.and.arrow.right" size={22} color="#EF4444" />
          </TouchableOpacity>
        </View>
      </View>

      {loading ? (
        <ActivityIndicator size="large" color={Colors[colorScheme ?? 'light'].tint} style={{ marginTop: 50 }} />
      ) : (
        <FlatList
          data={staff}
          renderItem={renderItem}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <IconSymbol name="person.crop.circle.badge.exclamationmark" size={48} color="#94A3B8" />
              <ThemedText style={styles.emptyText}>No staff members found.</ThemedText>
            </View>
          }
        />
      )}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    paddingTop: 20,
    paddingHorizontal: 25,
    paddingBottom: 15,
  },
  headerTitle: {
    fontSize: 32,
    fontWeight: '900',
    letterSpacing: -1,
  },
  headerSubtitle: {
    fontSize: 15,
    color: '#64748B',
    marginTop: 4,
    fontWeight: '500',
  },
  list: {
    padding: 20,
    gap: 16,
  },
  card: {
    padding: 16,
    borderRadius: 20,
    borderWidth: 1.5,
  },
  cardInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 15,
  },
  avatarCircle: {
    width: 50,
    height: 50,
    borderRadius: 25,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    fontSize: 20,
    fontWeight: '800',
  },
  staffName: {
    fontSize: 17,
    fontWeight: '800',
  },
  staffEmail: {
    fontSize: 13,
    color: '#64748B',
    marginTop: 2,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    gap: 12,
  },
  roleBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  roleText: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  statCount: {
    fontSize: 12,
    fontWeight: '700',
    color: '#64748B',
  },
  editBtn: {
    padding: 4,
  },
  emptyContainer: {
    alignItems: 'center',
    marginTop: 100,
    gap: 15,
  },
  emptyText: {
    color: '#94A3B8',
    fontSize: 16,
    fontWeight: '600',
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
