import NetInfo from '@react-native-community/netinfo';
import {
    deleteLocalRecordGeneric,
    getPendingFarmersWithFarms,
    getPendingLogsToSync,
    getPendingSchedulesToSync,
    updateSyncStatusGeneric,
    resetStuckSyncStatuses,
    updateLocalFarmerIds
} from './offline-db';
import { supabase } from './supabase';

export const syncOfflineData = async () => {
  const state = await NetInfo.fetch();
  if (!state.isConnected) return;

  // Recovery: Reset any records stuck in 'syncing' status from a previous app session
  try {
    await resetStuckSyncStatuses();
  } catch (e) {
    console.error('Failed to reset stuck sync statuses:', e);
  }

  const pendingFarmers = await getPendingFarmersWithFarms();
  
  // 1. Sync Pending Farmers (Core Records)
  for (const record of pendingFarmers) {
    try {
      await updateSyncStatusGeneric('pending_farmers', record.id, 'syncing');

      // Upload Avatar
      let avatarUrl = null;
      if (record.avatar_uri) {
        try {
          const response = await fetch(record.avatar_uri);
          const blob = await response.blob();
          const arrayBuffer = await new Response(blob).arrayBuffer();
          const fileName = `${Date.now()}_${record.id}.jpg`;
          const { error: uploadError } = await supabase.storage.from('avatars').upload(fileName, arrayBuffer, { contentType: 'image/jpeg' });
          if (!uploadError) {
            const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(fileName);
            avatarUrl = publicUrl;
          }
        } catch (e) { console.error('Avatar sync fail:', e); }
      }

      const { data: farmer, error: farmerError } = await supabase
        .from('farmers')
        .insert([{
          name: record.name,
          phone_number: record.phone_number,
          land_area: record.land_area ? parseFloat(record.land_area) : null,
          crop_type: record.crop_type,
          crop_duration: record.crop_duration,
          village: record.village,
          address: record.address,
          avatar_url: avatarUrl,
          created_by: record.created_by
        }])
        .select('id').single();

      if (farmerError) throw farmerError;

      // Sync Farms
      if (record.farms) {
        for (const farm of record.farms) {
          await supabase.from('farms').insert([{ farmer_id: farmer.id, boundary: JSON.parse(farm.boundary) }]);
        }
      }

      // CRITICAL: Immediately sync any sub-records attached to this local ID
      const localId = `local_${record.id}`;
      // Update any other local records to use the new remote ID
      await updateLocalFarmerIds(localId, farmer.id);
      
      await syncSubRecordsForFarmer(localId, farmer.id);

      await deleteLocalRecordGeneric('pending_farmers', record.id);
      console.log(`Synced Core Farmer: ${record.name}`);
    } catch (e) {
      console.error('Farmer sync failed:', e);
      await updateSyncStatusGeneric('pending_farmers', record.id, 'error');
    }
  }

  // 2. Sync Orphaned Sub-Records (for farmers already synced)
  await syncAllRemainingSubRecords();
};

async function syncSubRecordsForFarmer(localId: string, remoteId: string) {
  // Sync Schedules for this farmer
  const schedules = await getPendingSchedulesToSync();
  for (const s of schedules.filter(s => s.farmer_id === localId)) {
    const { error } = await supabase.from('schedules').insert([{
      farmer_id: remoteId,
      type: s.type,
      title: s.title,
      description: s.description,
      start_date: s.start_date,
      end_date: s.end_date,
      frequency: s.frequency,
      status: s.status
    }]);
    if (error) {
      await markRecordError('schedules', s.id, error);
      continue;
    }
    await deleteLocalRecordGeneric('schedules', s.id);
  }

  // Sync Logs for this farmer
  const { visits, treatments, notes, soil, prescriptions, visitRequests } = await getPendingLogsToSync();
  for (const v of visits.filter(v => v.farmer_id === localId)) {
    const { error } = await supabase.from('visit_logs').insert([{ farmer_id: remoteId, staff_id: v.staff_id, visit_date: v.visit_date, purpose: v.purpose }]);
    if (error) {
      await markRecordError('visit_logs', v.id, error);
      continue;
    }
    await deleteLocalRecordGeneric('visit_logs', v.id);
  }
  for (const t of treatments.filter(t => t.farmer_id === localId)) {
    const { error } = await supabase.from('treatment_logs').insert([{ farmer_id: remoteId, product_name: t.product_name, quantity: t.quantity, application_date: t.application_date }]);
    if (error) {
      await markRecordError('treatment_logs', t.id, error);
      continue;
    }
    await deleteLocalRecordGeneric('treatment_logs', t.id);
  }
  for (const n of notes.filter(n => n.farmer_id === localId)) {
    let imgPath = n.image_uri;
    if (n.image_uri && n.image_uri.startsWith('file://')) {
      try {
        const response = await fetch(n.image_uri);
        const blob = await response.blob();
        const arrayBuffer = await new Response(blob).arrayBuffer();
        const fileName = `notes/${Date.now()}_${n.id}.jpg`;
        const { error: uploadError } = await supabase.storage.from('avatars').upload(fileName, arrayBuffer, { contentType: 'image/jpeg' });
        if (!uploadError) {
          const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(fileName);
          imgPath = publicUrl;
        }
      } catch (e) { console.error('Note image sync fail:', e); }
    }
    const { error } = await supabase.from('field_notes').insert([{ farmer_id: remoteId, note: n.note, image_uri: imgPath, created_at: n.created_at }]);
    if (error) console.error('Note Sync Error:', error.message);
    if (!error) await deleteLocalRecordGeneric('field_notes', n.id);
  }
  for (const s of soil.filter(s => s.farmer_id === localId)) {
    const { error } = await supabase.from('soil_health').insert([{ farmer_id: remoteId, ph: s.ph, nitrogen: s.nitrogen, phosphorus: s.phosphorus, potassium: s.potassium, created_at: s.created_at }]);
    if (error) {
      console.error('Soil Sync Error:', error.message);
      await updateSyncStatusGeneric('soil_health', s.id, 'error');
    }
    if (!error) await deleteLocalRecordGeneric('soil_health', s.id);
  }
  for (const pr of prescriptions.filter(pr => pr.farmer_id === localId)) {
    let imgPath = pr.image_uri;
    if (pr.image_uri && pr.image_uri.startsWith('file://')) {
      try {
        const response = await fetch(pr.image_uri);
        const blob = await response.blob();
        const arrayBuffer = await new Response(blob).arrayBuffer();
        const fileName = `prescriptions/${Date.now()}_${pr.id}.jpg`;
        const { error: uploadError } = await supabase.storage.from('avatars').upload(fileName, arrayBuffer, { contentType: 'image/jpeg' });
        if (!uploadError) {
          const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(fileName);
          imgPath = publicUrl;
        }
      } catch (e) { console.error('Prescription image sync fail:', e); }
    }
    const { error } = await supabase.from('prescriptions').insert([{ farmer_id: remoteId, prescription_text: pr.prescription_text, image_url: imgPath, created_at: pr.created_at }]);
    if (error) {
      if (error.message.includes('not found') || error.message.includes('schema cache')) {
        console.warn('Prescriptions table missing in Supabase. Skipping sync for now.');
      } else {
        console.error('Prescription Sync Error:', error.message);
      }
    }
    if (!error) await deleteLocalRecordGeneric('prescriptions', pr.id);
  }

  for (const vr of (visitRequests || []).filter(vr => vr.farmer_id === localId)) {
    const { error } = await supabase.from('visit_requests').insert([{ 
      farmer_id: remoteId, 
      request_text: vr.request_text, 
      status: vr.status,
      created_at: vr.created_at 
    }]);
    if (error) {
      if (error.message.includes('not found') || error.message.includes('schema cache')) {
        console.warn('Visit Requests table missing in Supabase. Skipping sync for now.');
      } else {
        console.error('Visit Request Sync Error:', error.message);
      }
    }
    if (!error) await deleteLocalRecordGeneric('visit_requests', vr.id);
  }
}

async function markRecordError(table: string, id: number, error: any) {
  // Prevent permanent failures (missing table / bad schema) from retrying forever.
  if (!id) return;
  await updateSyncStatusGeneric(table, id, 'error');
  console.error(`${table} orphan failed for id=${id}:`, error?.message || error);
}

async function syncAllRemainingSubRecords() {
  const schedules = await getPendingSchedulesToSync();
  for (const s of schedules) {
    if (!s.farmer_id.startsWith('local_')) {
    const { error } = await supabase.from('schedules').insert([{
        farmer_id: s.farmer_id,
        type: s.type,
        title: s.title,
        description: s.description,
        start_date: s.start_date,
        end_date: s.end_date,
        frequency: s.frequency,
        status: s.status
      }]);
      if (error) {
        console.error(`Schedule Orphan Sync Error:`, error.message);
        await updateSyncStatusGeneric('schedules', s.id, 'error');
      }
      if (!error) await deleteLocalRecordGeneric('schedules', s.id);
    }
  }
  
  const { visits, treatments, notes, soil, prescriptions, visitRequests } = await getPendingLogsToSync();
  for (const v of visits) {
    if (!v.farmer_id.startsWith('local_')) {
      const { error } = await supabase.from('visit_logs').insert([{ farmer_id: v.farmer_id, staff_id: v.staff_id, visit_date: v.visit_date, purpose: v.purpose }]);
      if (error) {
        console.error('Visit Orphan Sync Error:', error.message);
        await updateSyncStatusGeneric('visit_logs', v.id, 'error');
      }
      if (!error) await deleteLocalRecordGeneric('visit_logs', v.id);
    }
  }
  for (const t of treatments) {
    if (!t.farmer_id.startsWith('local_')) {
      const { error } = await supabase.from('treatment_logs').insert([{ farmer_id: t.farmer_id, product_name: t.product_name, quantity: t.quantity, application_date: t.application_date }]);
      if (error) {
        console.error('Treatment Orphan Sync Error:', error.message);
        await updateSyncStatusGeneric('treatment_logs', t.id, 'error');
      }
      if (!error) await deleteLocalRecordGeneric('treatment_logs', t.id);
    }
  }
  for (const n of notes) {
    if (!n.farmer_id.startsWith('local_')) {
      let imgPath = n.image_uri;
      if (n.image_uri && n.image_uri.startsWith('file://')) {
        try {
          const response = await fetch(n.image_uri);
          const blob = await response.blob();
          const arrayBuffer = await new Response(blob).arrayBuffer();
          const fileName = `notes/${Date.now()}_${n.id}.jpg`;
          const { error: uploadError } = await supabase.storage.from('avatars').upload(fileName, arrayBuffer, { contentType: 'image/jpeg' });
          if (!uploadError) {
            const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(fileName);
            imgPath = publicUrl;
          }
        } catch (e) { console.error('Note image sync fail:', e); }
      }
      const { error } = await supabase.from('field_notes').insert([{ farmer_id: n.farmer_id, note: n.note, image_uri: imgPath, created_at: n.created_at }]);
      if (error) {
        console.error('Note Orphan Sync Error:', error.message);
        await updateSyncStatusGeneric('field_notes', n.id, 'error');
      }
      if (!error) await deleteLocalRecordGeneric('field_notes', n.id);
    }
  }
  for (const s of soil) {
    if (!s.farmer_id.startsWith('local_')) {
      const { error } = await supabase.from('soil_health').insert([{ farmer_id: s.farmer_id, ph: s.ph, nitrogen: s.nitrogen, phosphorus: s.phosphorus, potassium: s.potassium, created_at: s.created_at }]);
      if (error) {
        console.error('Soil Orphan Sync Error:', error.message);
        await updateSyncStatusGeneric('soil_health', s.id, 'error');
      }
      if (!error) await deleteLocalRecordGeneric('soil_health', s.id);
    }
  }
  for (const pr of prescriptions) {
    if (!pr.farmer_id.startsWith('local_')) {
      let imgPath = pr.image_uri;
      if (pr.image_uri && pr.image_uri.startsWith('file://')) {
        try {
          const response = await fetch(pr.image_uri);
          const blob = await response.blob();
          const arrayBuffer = await new Response(blob).arrayBuffer();
          const fileName = `prescriptions/${Date.now()}_${pr.id}.jpg`;
          const { error: uploadError } = await supabase.storage.from('avatars').upload(fileName, arrayBuffer, { contentType: 'image/jpeg' });
          if (!uploadError) {
            const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(fileName);
            imgPath = publicUrl;
          }
        } catch (e) { console.error('Prescription image sync fail:', e); }
      }
      const { error } = await supabase.from('prescriptions').insert([{ farmer_id: pr.farmer_id, prescription_text: pr.prescription_text, image_url: imgPath, created_at: pr.created_at }]);
      if (error) {
        if (error.message.includes('not found') || error.message.includes('schema cache')) {
           console.warn('Prescriptions table missing in Supabase. Skipping sync for now.');
        } else {
           console.error('Prescription Orphan Sync Error:', error.message);
        }
        await updateSyncStatusGeneric('prescriptions', pr.id, 'error');
      }
      if (!error) await deleteLocalRecordGeneric('prescriptions', pr.id);
    }
  }

  for (const vr of (visitRequests || [])) {
    if (!vr.farmer_id.startsWith('local_')) {
      const { error } = await supabase.from('visit_requests').insert([{ 
        farmer_id: vr.farmer_id, 
        request_text: vr.request_text, 
        status: vr.status,
        created_at: vr.created_at 
      }]);
      if (error) {
        if (error.message.includes('not found') || error.message.includes('schema cache')) {
           console.warn('Visit Requests table missing in Supabase. Skipping sync for now.');
        } else {
           console.error('Visit Request Orphan Sync Error:', error.message);
        }
        await updateSyncStatusGeneric('visit_requests', vr.id, 'error');
      }
      if (!error) await deleteLocalRecordGeneric('visit_requests', vr.id);
    }
  }
}
