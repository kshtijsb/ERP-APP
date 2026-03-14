import NetInfo from '@react-native-community/netinfo';
import { supabase } from './supabase';
import { getPendingRecords, deleteLocalRecord, updateSyncStatus } from './offline-db';
import { Alert } from 'react-native';

export const syncOfflineData = async () => {
  const state = await NetInfo.fetch();
  if (!state.isConnected) return;

  const pendingRecords = await getPendingRecords();
  if (pendingRecords.length === 0) return;

  console.log(`Starting sync for ${pendingRecords.length} records...`);

  for (const record of pendingRecords) {
    try {
      await updateSyncStatus(record.id, 'syncing');

      // 1. Upload Avatar if exists locally
      let avatarUrl = null;
      if (record.avatar_uri) {
        try {
          const response = await fetch(record.avatar_uri);
          const blob = await response.blob();
          const arrayBuffer = await new Response(blob).arrayBuffer();
          
          const fileName = `${Date.now()}_offline.jpg`;
          const { data: uploadData, error: uploadError } = await supabase.storage
            .from('avatars')
            .upload(fileName, arrayBuffer, {
              contentType: 'image/jpeg',
              upsert: true
            });

          if (!uploadError) {
            const { data: { publicUrl } } = supabase.storage
              .from('avatars')
              .getPublicUrl(fileName);
            avatarUrl = publicUrl;
          }
        } catch (e) {
          console.error('Failed to upload offline avatar:', e);
        }
      }

      // 2. Insert Farmer
      const { data: farmer, error: farmerError } = await supabase
        .from('farmers')
        .insert([
          {
            name: record.name,
            phone_number: record.phone_number,
            land_area: record.land_area ? parseFloat(record.land_area) : null,
            crop_type: record.crop_type,
            crop_duration: record.crop_duration,
            avatar_url: avatarUrl,
          },
        ])
        .select()
        .single();

      if (farmerError) throw farmerError;

      // 3. Insert Farms
      if (record.farms && record.farms.length > 0) {
        for (const farm of record.farms) {
          const { error: farmError } = await supabase
            .from('farms')
            .insert([
              {
                farmer_id: farmer.id,
                boundary: JSON.parse(farm.boundary),
              },
            ]);
          if (farmError) throw farmError;
        }
      }

      // 4. Success - Clear local record
      await deleteLocalRecord(record.id);
      console.log(`Synced record for ${record.name}`);
    } catch (error) {
      console.error(`Failed to sync record ${record.id}:`, error);
      await updateSyncStatus(record.id, 'error');
    }
  }
};
