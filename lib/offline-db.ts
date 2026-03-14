import * as SQLite from 'expo-sqlite';
import { Platform } from 'react-native';

const DB_NAME = 'krushikanchan_offline.db';

export interface PendingFarmer {
  id?: number;
  name: string;
  phone_number: string;
  land_area: string;
  crop_type: string;
  crop_duration: string;
  avatar_uri?: string | null;
  sync_status: 'pending' | 'syncing' | 'error';
  created_at: string;
}

export interface PendingFarm {
  id?: number;
  farmer_local_id: number;
  boundary: string; // JSON string
  sync_status: 'pending' | 'syncing' | 'error';
  created_at: string;
}

let db: SQLite.SQLiteDatabase | null = null;

export const getDB = async () => {
  if (db) return db;
  db = await SQLite.openDatabaseAsync(DB_NAME);
  return db;
};

export const initOfflineDB = async () => {
  const database = await getDB();
  
  await database.execAsync(`
    CREATE TABLE IF NOT EXISTS pending_farmers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      phone_number TEXT,
      land_area TEXT,
      crop_type TEXT,
      crop_duration TEXT,
      avatar_uri TEXT,
      sync_status TEXT DEFAULT 'pending',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS pending_farms (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      farmer_local_id INTEGER NOT NULL,
      boundary TEXT NOT NULL,
      sync_status TEXT DEFAULT 'pending',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (farmer_local_id) REFERENCES pending_farmers (id) ON DELETE CASCADE
    );
  `);
};

export const saveFarmerOffline = async (farmer: Omit<PendingFarmer, 'sync_status' | 'created_at'>) => {
  const database = await getDB();
  const result = await database.runAsync(
    'INSERT INTO pending_farmers (name, phone_number, land_area, crop_type, crop_duration, avatar_uri) VALUES (?, ?, ?, ?, ?, ?)',
    [farmer.name, farmer.phone_number, farmer.land_area, farmer.crop_type, farmer.crop_duration, farmer.avatar_uri || null]
  );
  return result.lastInsertRowId;
};

export const saveFarmOffline = async (farmerLocalId: number, boundary: any[]) => {
  const database = await getDB();
  await database.runAsync(
    'INSERT INTO pending_farms (farmer_local_id, boundary) VALUES (?, ?)',
    [farmerLocalId, JSON.stringify(boundary)]
  );
};

export const getPendingRecords = async () => {
  const database = await getDB();
  const farmers = await database.getAllAsync<PendingFarmer & { id: number }>('SELECT * FROM pending_farmers WHERE sync_status != "synced"');
  
  const records = [];
  for (const farmer of farmers) {
    const farms = await database.getAllAsync<PendingFarm>(
      'SELECT * FROM pending_farms WHERE farmer_local_id = ?',
      [farmer.id]
    );
    records.push({
      ...farmer,
      farms
    });
  }
  return records;
};

export const getFarmerLocalById = async (localId: number) => {
  const database = await getDB();
  const farmer = await database.getFirstAsync<PendingFarmer & { id: number }>(
    'SELECT * FROM pending_farmers WHERE id = ?',
    [localId]
  );
  
  if (!farmer) return null;

  const farms = await database.getAllAsync<PendingFarm>(
    'SELECT * FROM pending_farms WHERE farmer_local_id = ?',
    [localId]
  );

  return {
    ...farmer,
    farms
  };
};

export const deleteLocalRecord = async (farmerLocalId: number) => {
  const database = await getDB();
  await database.runAsync('DELETE FROM pending_farmers WHERE id = ?', [farmerLocalId]);
};

export const updateSyncStatus = async (farmerLocalId: number, status: string) => {
  const database = await getDB();
  await database.runAsync('UPDATE pending_farmers SET sync_status = ? WHERE id = ?', [status, farmerLocalId]);
};
