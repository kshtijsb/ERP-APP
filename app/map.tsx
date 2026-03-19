import React, { useState, useEffect, useRef } from 'react';
import { StyleSheet, TouchableOpacity, View, Alert, ActivityIndicator, useColorScheme } from 'react-native';
import MapView, { Polygon, Marker, UrlTile, PROVIDER_GOOGLE } from 'react-native-maps';
import * as Location from 'expo-location';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { saveFarmOffline } from '@/lib/offline-db';
import NetInfo from '@react-native-community/netinfo';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors } from '@/constants/theme';
import { isSelfIntersecting, calculateAreaInAcres } from '@/lib/geo-validation';
const validateUuid = (uuid: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(uuid);

export default function MapScreen() {
  const { farmerId, farmerName, isOffline, reportedArea, initialBoundary } = useLocalSearchParams();
  const router = useRouter();
  const colorScheme = useColorScheme();
  const [location, setLocation] = useState<Location.LocationObject | null>(null);
  const [isAutoTracking, setIsAutoTracking] = useState(false);
  const trackingSubscription = useRef<Location.LocationSubscription | null>(null);
  
  // Parse initial boundary if provided
  const getInitialCoords = () => {
    if (!initialBoundary) return [];
    try {
      return JSON.parse(initialBoundary as string);
    } catch (e) {
      console.error('Failed to parse initial boundary:', e);
      return [];
    }
  };

  const [coordinates, setCoordinates] = useState<any[]>(getInitialCoords());
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    (async () => {
      let { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Denied', 'Location access is required for precision GIS mapping.');
        router.back();
        return;
      }

      let currentLocation = await Location.getCurrentPositionAsync({});
      setLocation(currentLocation);
    })();

    return () => {
      if (trackingSubscription.current) {
        trackingSubscription.current.remove();
      }
    };
  }, []);

  const toggleAutoTracking = async () => {
    if (isAutoTracking) {
      if (trackingSubscription.current) {
        trackingSubscription.current.remove();
        trackingSubscription.current = null;
      }
      setIsAutoTracking(false);
    } else {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Denied', 'Location access is required for auto-tracking.');
        return;
      }

      setIsAutoTracking(true);
      trackingSubscription.current = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.BestForNavigation,
          distanceInterval: 5, // 5 meters
        },
        (newLocation) => {
          const { latitude, longitude } = newLocation.coords;
          setCoordinates((prev) => {
            // Avoid adding same point twice or very close points
            if (prev.length > 0) {
              const last = prev[prev.length - 1];
              const dist = Math.sqrt(
                Math.pow(last.latitude - latitude, 2) + 
                Math.pow(last.longitude - longitude, 2)
              );
              if (dist < 0.00005) return prev; // Very rough ~5m check
            }
            return [...prev, { latitude, longitude }];
          });
        }
      );
    }
  };

  const handlePress = (e: any) => {
    const { latitude, longitude } = e.nativeEvent.coordinate;
    setCoordinates([...coordinates, { latitude, longitude }]);
  };

  const handleClear = () => {
    setCoordinates([]);
  };

  const handleSave = async () => {
    if (coordinates.length < 3) {
      Alert.alert('Incomplete Boundary', 'Please define at least 3 points to form a valid farm perimeter.');
      return;
    }

    if (!farmerId) {
      Alert.alert('Data Error', 'Farmer ID is missing. Please restart the mapping process from the Database hub.');
      return;
    }

    console.log('Final Save - Farmer ID:', farmerId);
    console.log('Final Save - Points:', coordinates.length);

    setLoading(true);
    try {
      // 0. Smart Validation
      if (isSelfIntersecting(coordinates)) {
        Alert.alert('Invalid Shape', 'The boundary crosses itself. Please reset and draw a clean perimeter.');
        setLoading(false);
        return;
      }

      const calculatedArea = calculateAreaInAcres(coordinates);
      const reported = reportedArea ? parseFloat(reportedArea.toString()) : 0;

      if (reported > 0) {
        const diff = Math.abs(calculatedArea - reported);
        const diffPercent = (diff / reported) * 100;

        if (diffPercent > 20) {
          const proceed = await new Promise((resolve) => {
            Alert.alert(
              'Area Discrepancy',
              `The drawn map is ${calculatedArea} acres, but the farmer reported ${reported} acres. That's a ${Math.round(diffPercent)}% difference. Save anyway?`,
              [
                { text: 'Redraw', onPress: () => resolve(false), style: 'cancel' },
                { text: 'Save Anyway', onPress: () => resolve(true) }
              ]
            );
          });
          if (!proceed) {
            setLoading(false);
            return;
          }
        }
      }

      if (isOffline === 'true' || (farmerId && typeof farmerId === 'string' && farmerId.startsWith('local_'))) {
        // 1. Offline Save
        const idString = farmerId.toString();
        const localId = parseInt(idString.startsWith('local_') ? idString.replace('local_', '') : idString);
        await saveFarmOffline(localId, coordinates);
        
        Alert.alert('Offline Success', 'Farm boundary saved locally! It will sync once you are back online.', [
          { text: 'Return to Hub', onPress: () => router.replace('/(tabs)/index' as any) },
        ]);
      } else {
        // 2. Online Save (Supabase)
        // Safety Check: Ensure farmerId is a valid UUID
        if (!validateUuid(farmerId as string)) {
          console.error('Save aborted: farmerId is not a valid UUID:', farmerId);
          Alert.alert(
            'Sync Protection', 
            'This record seems to be offline but the sync flag was lost. Saving locally to prevent database error.',
            [{ 
              text: 'Save Locally', 
              onPress: async () => {
                const localId = parseInt(farmerId!.toString().replace('local_', ''));
                await saveFarmOffline(localId, coordinates);
                router.replace('/(tabs)/index' as any);
              } 
            }]
          );
          setLoading(false);
          return;
        }

        const { data, error } = await supabase
          .from('farms')
          .upsert({
            farmer_id: farmerId,
            boundary: coordinates,
          }, { onConflict: 'farmer_id' })
          .select();

        if (error) throw error;

        Alert.alert('Branding Success', 'Farm boundary synchronized with KK Sathi database!', [
          { text: 'View Dashboard', onPress: () => router.replace('/(tabs)/explore') },
        ]);
      }
    } catch (error: any) {
      console.error('GIS Save Error:', error);
      Alert.alert('Save Failed', error.message);
    } finally {
      setLoading(false);
    }
  };

  if (!location) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: Colors[colorScheme ?? 'light'].background }]}>
        <ActivityIndicator size="large" color={Colors[colorScheme ?? 'light'].tint} />
        <ThemedText style={{ marginTop: 15, fontWeight: '600' }}>Initializing KK Sathi GIS...</ThemedText>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: `Mapping: ${farmerName}`, headerBackTitle: 'Back' }} />
      
      <MapView
        provider={PROVIDER_GOOGLE}
        style={styles.map}
        initialRegion={{
          latitude: coordinates.length > 0 ? coordinates[0].latitude : location.coords.latitude,
          longitude: coordinates.length > 0 ? coordinates[0].longitude : location.coords.longitude,
          latitudeDelta: 0.005,
          longitudeDelta: 0.005,
        }}
        onPress={handlePress}
        mapType="hybrid"
        showsUserLocation={true}
      >
        {coordinates.map((coord, index) => (
          <Marker
            key={index}
            coordinate={coord}
            anchor={{ x: 0.5, y: 0.5 }}
          >
            <View style={styles.markerDot} />
          </Marker>
        ))}
        {coordinates.length >= 3 && (
          <Polygon
            coordinates={coordinates}
            fillColor="rgba(76, 175, 80, 0.45)"
            strokeColor="#4CAF50"
            strokeWidth={3}
          />
        )}
      </MapView>

      <ThemedView style={styles.instructions}>
        <View style={styles.instructionHeader}>
          <IconSymbol name="info.circle.fill" size={18} color={Colors[colorScheme ?? 'light'].tint} />
          <ThemedText type="defaultSemiBold" style={{ color: Colors[colorScheme ?? 'light'].tint }}>Mapping Guide</ThemedText>
        </View>
        <ThemedText style={styles.instructionText}>
          Tap on corner points of the farm to define its boundary.
        </ThemedText>
        {coordinates.length >= 3 && (
          <View style={styles.areaInfo}>
            <ThemedText style={styles.areaText}>
              Mapped Area: <ThemedText type="defaultSemiBold" style={{ color: Colors[colorScheme ?? 'light'].tint }}>{calculateAreaInAcres(coordinates)} Acres</ThemedText>
            </ThemedText>
          </View>
        )}
      </ThemedView>

      <View style={styles.controls}>
        <TouchableOpacity 
          style={[styles.controlButton, styles.clearButton]} 
          onPress={handleClear}
          disabled={coordinates.length === 0}
        >
          <IconSymbol name="trash.fill" size={20} color="#E65100" />
          <ThemedText style={[styles.buttonLabel, { color: '#E65100' }]}>Reset</ThemedText>
        </TouchableOpacity>
        
        <TouchableOpacity 
          style={[styles.controlButton, styles.saveButton, { backgroundColor: Colors[colorScheme ?? 'light'].tint }, (coordinates.length < 3 || loading) && styles.buttonDisabled]} 
          onPress={handleSave}
          disabled={loading || coordinates.length < 3}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <IconSymbol name="checkmark.seal.fill" size={20} color="#fff" />
              <ThemedText style={styles.saveButtonText}>Confirm Plot</ThemedText>
            </>
          )}
        </TouchableOpacity>
      </View>

      <TouchableOpacity 
        style={[
          styles.fab, 
          { backgroundColor: isAutoTracking ? '#EF4444' : Colors[colorScheme ?? 'light'].tint }
        ]}
        onPress={toggleAutoTracking}
      >
        <IconSymbol 
          name={isAutoTracking ? 'stop.circle.fill' : 'figure.walk.circle.fill'} 
          size={24} 
          color="#fff" 
        />
        <ThemedText style={styles.fabText}>
          {isAutoTracking ? 'Stop Tracking' : 'Auto-Track'}
        </ThemedText>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  map: {
    flex: 1,
  },
  markerDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#fff',
    borderWidth: 3,
    borderColor: '#2E7D32',
  },
  instructions: {
    position: 'absolute',
    top: 20,
    left: 20,
    right: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    padding: 16,
    borderRadius: 15,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 5,
  },
  instructionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  instructionText: {
    fontSize: 13,
    color: '#555',
    lineHeight: 18,
  },
  areaInfo: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  areaText: {
    fontSize: 14,
    color: '#334155',
  },
  controls: {
    position: 'absolute',
    bottom: 40,
    left: 20,
    right: 20,
    flexDirection: 'row',
    gap: 15,
  },
  controlButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 55,
    borderRadius: 15,
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    gap: 10,
  },
  buttonLabel: {
    fontWeight: '700',
    fontSize: 15,
  },
  clearButton: {
    flex: 1,
    backgroundColor: '#FFF3E0',
  },
  saveButton: {
    flex: 2,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  saveButtonText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 16,
  },
  fab: {
    position: 'absolute',
    bottom: 110,
    right: 20,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 30,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    elevation: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  fabText: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 14,
  },
});
