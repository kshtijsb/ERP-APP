import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors } from '@/constants/theme';
import { supabase } from '@/lib/supabase';
import * as Location from 'expo-location';
import { Stack, useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, TouchableOpacity, useColorScheme, View } from 'react-native';
import MapView, { Polygon } from 'react-native-maps';

export default function GlobalMapScreen() {
  const [farms, setFarms] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const colorScheme = useColorScheme();

  const fetchAllFarms = async () => {
    try {
      const { data, error } = await supabase
        .from('farms')
        .select(`
          *,
          farmers (
            id,
            name,
            crop_type
          )
        `);

      if (error) throw error;
      setFarms(data || []);
    } catch (error: any) {
      Alert.alert('Error', 'Failed to fetch farm data: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAllFarms();
    (async () => {
      let { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        console.warn('Location permission denied for global map');
      }
    })();
  }, []);

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: Colors[colorScheme ?? 'light'].background }]}>
        <ActivityIndicator size="large" color={Colors[colorScheme ?? 'light'].tint} />
        <ThemedText style={{ marginTop: 15, fontWeight: '600' }}>Synchronizing regional data...</ThemedText>
      </View>
    );
  }

  // Calculate center of all polygons if available, otherwise default to a general area
  const initialRegion = farms.length > 0 && farms[0].boundary.length > 0
    ? {
      latitude: farms[0].boundary[0].latitude,
      longitude: farms[0].boundary[0].longitude,
      latitudeDelta: 0.05,
      longitudeDelta: 0.05,
    }
    : {
      latitude: 18.5204, // Default to Pune/Maharashtra if no data
      longitude: 73.8567,
      latitudeDelta: 1,
      longitudeDelta: 1,
    };

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: 'Global Map', headerShadowVisible: false }} />

      <MapView
        style={styles.map}
        initialRegion={initialRegion}
        mapType="hybrid"
        showsUserLocation={true}
      >
        {farms.map((farm) => (
          <Polygon
            key={farm.id}
            coordinates={farm.boundary}
            fillColor="rgba(34, 197, 94, 0.4)"
            strokeColor="#22C55E"
            strokeWidth={2}
            tappable
            onPress={() => {
              router.push({ pathname: '/farmer-details', params: { id: farm.farmers?.id || farm.farmer_id } });
            }}
          />
        ))}
      </MapView>

      <ThemedView style={styles.floatingHeader}>
        <ThemedText style={styles.statsLabel}>Regional Overview: {farms.length} Active Farms</ThemedText>
      </ThemedView>

      <TouchableOpacity
        style={[styles.refreshButton, { backgroundColor: Colors[colorScheme ?? 'light'].tint }]}
        onPress={fetchAllFarms}
        disabled={loading}
      >
        {loading ? (
          <ActivityIndicator color="#fff" size="small" />
        ) : (
          <IconSymbol name="arrow.clockwise" size={24} color="#fff" />
        )}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  map: {
    flex: 1,
  },
  floatingHeader: {
    position: 'absolute',
    top: 60,
    alignSelf: 'center',
    backgroundColor: 'rgba(15, 23, 42, 0.85)',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 10,
    elevation: 8,
  },
  statsLabel: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  refreshButton: {
    position: 'absolute',
    bottom: 40,
    right: 25,
    width: 60,
    height: 60,
    borderRadius: 30,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 10,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
