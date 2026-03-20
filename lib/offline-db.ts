import * as SQLite from 'expo-sqlite';
import { Platform } from 'react-native';

const DB_NAME = 'krushikanchan_offline.db';

export interface PendingFarmer {
  id?: number;
  name: string;
  phone_number: string;
  land_area: string;
  crop_type: string;
  variety: string;
  crop_duration: string;
  avatar_uri?: string | null;
  created_by?: string | null;
  sync_status: 'pending' | 'syncing' | 'error';
  created_at: string;
  last_weather_fetch?: string | null;
  weather_data?: string | null;
  village?: string | null;
  address?: string | null;
}

export interface FieldNote {
  id?: number;
  farmer_id: string;
  note: string;
  image_uri?: string | null;
  sync_status: 'pending' | 'syncing' | 'error';
  created_at: string;
}

export interface Schedule {
  id?: number;
  farmer_id: string;
  type: 'irrigation' | 'spray';
  title: string;
  description: string;
  start_date: string;
  end_date: string;
  frequency: 'daily' | 'weekly' | 'bi-weekly' | 'custom';
  status: 'active' | 'completed' | 'cancelled';
  sync_status: 'pending' | 'syncing' | 'error';
  created_at?: string;
}

export interface SoilHealth {
  id?: number;
  farmer_id: string;
  ph: number;
  nitrogen: number;
  phosphorus: number;
  potassium: number;
  sync_status: 'pending' | 'syncing' | 'error';
  created_at: string;
}

export interface VisitLog {
  id?: number;
  farmer_id: string;
  staff_id?: string | null;
  visit_date: string;
  purpose: string;
  sync_status: 'pending' | 'syncing' | 'error';
}

export interface TreatmentLog {
  id?: number;
  farmer_id: string;
  product_name: string;
  quantity: string;
  application_date: string;
  sync_status: 'pending' | 'syncing' | 'error';
}

export interface ExpenseLog {
  id?: number;
  farmer_id: string;
  amount: number;
  description: string;
  date: string;
  sync_status: 'pending' | 'syncing' | 'error';
}

export interface Prescription {
  id?: number;
  farmer_id: string;
  prescription_text: string;
  image_uri?: string | null;
  sync_status: 'pending' | 'syncing' | 'error';
  created_at: string;
}

export interface VisitRequest {
  id?: number;
  farmer_id: string;
  request_text?: string;
  status: 'pending' | 'scheduled' | 'completed';
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
      variety TEXT,
      crop_duration TEXT,
      avatar_uri TEXT,
      created_by TEXT,
      village TEXT,
      address TEXT,
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

    CREATE TABLE IF NOT EXISTS field_notes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      farmer_id TEXT NOT NULL,
      note TEXT NOT NULL,
      image_uri TEXT,
      sync_status TEXT DEFAULT 'pending',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS soil_health (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      farmer_id TEXT NOT NULL,
      ph REAL,
      nitrogen REAL,
      phosphorus REAL,
      potassium REAL,
      sync_status TEXT DEFAULT 'pending',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS visit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      farmer_id TEXT NOT NULL,
      staff_id TEXT,
      visit_date DATETIME DEFAULT CURRENT_TIMESTAMP,
      purpose TEXT,
      sync_status TEXT DEFAULT 'pending'
    );

    CREATE TABLE IF NOT EXISTS treatment_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      farmer_id TEXT NOT NULL,
      product_name TEXT NOT NULL,
      quantity TEXT,
      application_date DATETIME DEFAULT CURRENT_TIMESTAMP,
      sync_status TEXT DEFAULT 'pending'
    );

    CREATE TABLE IF NOT EXISTS schedules (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      farmer_id TEXT NOT NULL,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      start_date DATETIME NOT NULL,
      end_date DATETIME,
      frequency TEXT DEFAULT 'daily',
      status TEXT DEFAULT 'active',
      sync_status TEXT DEFAULT 'pending',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS expense_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      farmer_id TEXT NOT NULL,
      amount REAL NOT NULL,
      description TEXT NOT NULL,
      date DATETIME DEFAULT CURRENT_TIMESTAMP,
      sync_status TEXT DEFAULT 'pending'
    );

    CREATE TABLE IF NOT EXISTS prescriptions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      farmer_id TEXT NOT NULL,
      prescription_text TEXT NOT NULL,
      image_uri TEXT,
      sync_status TEXT DEFAULT 'pending',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS visit_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      farmer_id TEXT NOT NULL,
      request_text TEXT,
      status TEXT DEFAULT 'pending',
      sync_status TEXT DEFAULT 'pending',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  try { await database.execAsync('ALTER TABLE pending_farmers ADD COLUMN last_weather_fetch TEXT'); } catch (e) {}
  try { await database.execAsync('ALTER TABLE pending_farmers ADD COLUMN weather_data TEXT'); } catch (e) {}
  try { await database.execAsync('ALTER TABLE pending_farmers ADD COLUMN variety TEXT'); } catch (e) {}
  try { await database.execAsync('ALTER TABLE pending_farmers ADD COLUMN address TEXT'); } catch (e) {}
  try { await database.execAsync('ALTER TABLE pending_farmers ADD COLUMN village TEXT'); } catch (e) {}
  try { await database.execAsync('ALTER TABLE visit_logs ADD COLUMN sync_status TEXT DEFAULT "pending"'); } catch (e) {}
  try { await database.execAsync('ALTER TABLE treatment_logs ADD COLUMN sync_status TEXT DEFAULT "pending"'); } catch (e) {}
  try { await database.execAsync('ALTER TABLE schedules ADD COLUMN sync_status TEXT DEFAULT "pending"'); } catch (e) {}
};

export const saveFarmerOffline = async (farmer: Omit<PendingFarmer, 'sync_status' | 'created_at'>) => {
  const database = await getDB();
  const result = await database.runAsync(
    'INSERT INTO pending_farmers (name, phone_number, land_area, crop_type, variety, crop_duration, avatar_uri, created_by, village, address) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [farmer.name, farmer.phone_number, farmer.land_area, farmer.crop_type, farmer.variety, farmer.crop_duration, farmer.avatar_uri || null, farmer.created_by || null, farmer.village || null, farmer.address || null]
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

// Comprehensive Pending records fetchers
export const getPendingFarmersWithFarms = async () => {
  const database = await getDB();
  const farmers = await database.getAllAsync<PendingFarmer & { id: number }>('SELECT * FROM pending_farmers WHERE sync_status IN ("pending", "error", "syncing")');
  
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

export const getPendingSchedulesToSync = async () => {
  const database = await getDB();
  return database.getAllAsync<Schedule & { id: number }>('SELECT * FROM schedules WHERE sync_status IN ("pending", "error", "syncing")');
};

export const getPendingLogsToSync = async () => {
  const database = await getDB();
  const visits = await database.getAllAsync<VisitLog & { id: number }>('SELECT * FROM visit_logs WHERE sync_status IN ("pending", "error", "syncing")');
  const treatments = await database.getAllAsync<TreatmentLog & { id: number }>('SELECT * FROM treatment_logs WHERE sync_status IN ("pending", "error", "syncing")');
  const notes = await database.getAllAsync<FieldNote & { id: number }>('SELECT * FROM field_notes WHERE sync_status IN ("pending", "error", "syncing")');
  const soil = await database.getAllAsync<SoilHealth & { id: number }>('SELECT * FROM soil_health WHERE sync_status IN ("pending", "error", "syncing")');
  const prescriptions = await database.getAllAsync<Prescription & { id: number }>('SELECT * FROM prescriptions WHERE sync_status IN ("pending", "error", "syncing")');
  const visitRequests = await database.getAllAsync<VisitRequest & { id: number }>('SELECT * FROM visit_requests WHERE sync_status IN ("pending", "error", "syncing")');
  return { visits, treatments, notes, soil, prescriptions, visitRequests };
};

export const updateLocalFarmerIds = async (localId: string, remoteId: string) => {
  const database = await getDB();

  // Update tables that use 'farmer_id' (string)
  const tables = [
    'visit_logs', 'treatment_logs', 'field_notes', 
    'soil_health', 'prescriptions', 'visit_requests', 
    'schedules', 'expense_logs'
  ];

  for (const table of tables) {
    try {
      await database.execAsync(`UPDATE ${table} SET farmer_id = '${remoteId}' WHERE farmer_id = '${localId}'`);
    } catch (e) {
      // Table might not exist or column name different, ignore
    }
  }
};

export const updateVisitRequestStatus = async (id: number, status: string) => {
  const database = await getDB();
  await database.runAsync('UPDATE visit_requests SET status = ? WHERE id = ?', [status, id]);
};

export const resetStuckSyncStatuses = async () => {
  const database = await getDB();
  const tables = ['pending_farmers', 'schedules', 'visit_logs', 'treatment_logs', 'field_notes', 'soil_health', 'expense_logs', 'prescriptions', 'visit_requests'];
  for (const table of tables) {
    await database.runAsync(`UPDATE ${table} SET sync_status = 'pending' WHERE sync_status = 'syncing'`);
  }
};

export const updateSyncStatusGeneric = async (table: string, id: number, status: string) => {
  const database = await getDB();
  await database.runAsync(`UPDATE ${table} SET sync_status = ? WHERE id = ?`, [status, id]);
};

export const deleteLocalRecordGeneric = async (table: string, id: number) => {
  const database = await getDB();
  await database.runAsync(`DELETE FROM ${table} WHERE id = ?`, [id]);
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

export const getFarmerLocalByPhone = async (phone: string) => {
  const database = await getDB();
  const last10 = phone.slice(-10);
  
  const farmer = await database.getFirstAsync<PendingFarmer & { id: number }>(
    'SELECT * FROM pending_farmers WHERE phone_number LIKE ?',
    [`%${last10}`]
  );
  
  if (!farmer) return null;

  const farms = await database.getAllAsync<PendingFarm>(
    'SELECT * FROM pending_farms WHERE farmer_local_id = ?',
    [farmer.id]
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

// --- New Helper Functions ---

export const saveFieldNoteOffline = async (note: Omit<FieldNote, 'sync_status' | 'created_at'>) => {
  const database = await getDB();
  await database.runAsync(
    'INSERT INTO field_notes (farmer_id, note, image_uri) VALUES (?, ?, ?)',
    [note.farmer_id, note.note, note.image_uri || null]
  );
  
  // Also log it as a visit
  await saveVisitLogOffline({
    farmer_id: note.farmer_id,
    purpose: 'Added field observation note'
  });
};

export const getFieldNotesByFarmerId = async (farmerId: string) => {
  const database = await getDB();
  return await database.getAllAsync<FieldNote & { id: number }>(
    'SELECT * FROM field_notes WHERE farmer_id = ? ORDER BY created_at DESC',
    [farmerId]
  );
};

export const saveSoilHealthOffline = async (report: Omit<SoilHealth, 'sync_status' | 'created_at'>) => {
  const database = await getDB();
  await database.runAsync(
    'INSERT INTO soil_health (farmer_id, ph, nitrogen, phosphorus, potassium) VALUES (?, ?, ?, ?, ?)',
    [report.farmer_id, report.ph, report.nitrogen, report.phosphorus, report.potassium]
  );

  // Also log it as a visit
  await saveVisitLogOffline({
    farmer_id: report.farmer_id,
    purpose: 'Performed soil health analysis'
  });
};

export const getSoilHealthByFarmerId = async (farmerId: string) => {
  const database = await getDB();
  return await database.getAllAsync<SoilHealth & { id: number }>(
    'SELECT * FROM soil_health WHERE farmer_id = ? ORDER BY created_at DESC',
    [farmerId]
  );
};

export const saveVisitLogOffline = async (log: Omit<VisitLog, 'sync_status' | 'visit_date'>) => {
  const database = await getDB();
  await database.runAsync(
    'INSERT INTO visit_logs (farmer_id, staff_id, purpose) VALUES (?, ?, ?)',
    [log.farmer_id, log.staff_id || null, log.purpose]
  );
};

export const getVisitLogsByFarmerId = async (farmerId: string) => {
  const database = await getDB();
  return database.getAllAsync<VisitLog>('SELECT * FROM visit_logs WHERE farmer_id = ? ORDER BY visit_date DESC', [farmerId]);
};

export const saveTreatmentLogOffline = async (log: Omit<TreatmentLog, 'sync_status'>) => {
  const database = await getDB();
  await database.runAsync(
    'INSERT INTO treatment_logs (farmer_id, product_name, quantity, application_date) VALUES (?, ?, ?, ?)',
    [log.farmer_id, log.product_name, log.quantity, log.application_date || new Date().toISOString()]
  );
};

export const getTreatmentLogsByFarmerId = async (farmerId: string) => {
  const database = await getDB();
  return database.getAllAsync<TreatmentLog>('SELECT * FROM treatment_logs WHERE farmer_id = ? ORDER BY application_date DESC', [farmerId]);
};

export const saveExpenseLogOffline = async (log: Omit<ExpenseLog, 'sync_status'>) => {
  const database = await getDB();
  await database.runAsync(
    'INSERT INTO expense_logs (farmer_id, amount, description, date) VALUES (?, ?, ?, ?)',
    [log.farmer_id, log.amount, log.description, log.date || new Date().toISOString()]
  );
};

export const getExpenseLogsByFarmerId = async (farmerId: string) => {
  const database = await getDB();
  return database.getAllAsync<ExpenseLog>('SELECT * FROM expense_logs WHERE farmer_id = ? ORDER BY date DESC', [farmerId]);
};

export const updateFarmerWeather = async (farmerId: string, weatherData: string) => {
  const database = await getDB();
  // Handle both local_ ID and remote ID
  const localMatch = farmerId.startsWith('local_');
  const query = localMatch 
    ? 'UPDATE pending_farmers SET weather_data = ?, last_weather_fetch = CURRENT_TIMESTAMP WHERE id = ?'
    : 'UPDATE pending_farmers SET weather_data = ?, last_weather_fetch = CURRENT_TIMESTAMP WHERE id = (SELECT id FROM pending_farmers WHERE id = ?)'; // This part might need better logic if we want to cache weather for online farmers too
  
  const id = localMatch ? parseInt(farmerId.replace('local_', '')) : farmerId;
  await database.runAsync(query, [weatherData, id]);
};

export const saveScheduleOffline = async (schedule: Omit<Schedule, 'sync_status' | 'id'>) => {
  const database = await getDB();
  await database.runAsync(
    'INSERT INTO schedules (farmer_id, type, title, description, start_date, end_date, frequency, status, sync_status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [
      schedule.farmer_id, 
      schedule.type, 
      schedule.title, 
      schedule.description, 
      schedule.start_date, 
      schedule.end_date, 
      schedule.frequency, 
      schedule.status, 
      'pending'
    ]
  );
};

export const getActiveSchedulesByFarmerId = async (farmerId: string) => {
  const database = await getDB();
  return database.getAllAsync<Schedule>(
    'SELECT * FROM schedules WHERE farmer_id = ? AND status = "active" ORDER BY start_date ASC',
    [farmerId]
  );
};

export const updateScheduleStatus = async (id: number, status: string) => {
  const database = await getDB();
  await database.runAsync('UPDATE schedules SET status = ? WHERE id = ?', [status, id]);
};

export const savePrescriptionOffline = async (presc: Omit<Prescription, 'sync_status' | 'created_at'>) => {
  const database = await getDB();
  await database.runAsync(
    'INSERT INTO prescriptions (farmer_id, prescription_text, image_uri) VALUES (?, ?, ?)',
    [presc.farmer_id, presc.prescription_text, presc.image_uri || null]
  );
  
  // Also log it as a visit
  await saveVisitLogOffline({
    farmer_id: presc.farmer_id,
    purpose: 'Issued Field Prescription'
  });
};

export const getPrescriptionsByFarmerId = async (farmerId: string) => {
  const database = await getDB();
  return await database.getAllAsync<Prescription & { id: number }>(
    'SELECT * FROM prescriptions WHERE farmer_id = ? ORDER BY created_at DESC',
    [farmerId]
  );
};

export const saveVisitRequestOffline = async (req: { farmer_id: string, request_text?: string }) => {
  const database = await getDB();
  await database.runAsync(
    'INSERT INTO visit_requests (farmer_id, request_text, status) VALUES (?, ?, ?)',
    [req.farmer_id, req.request_text || null, 'pending']
  );
};

export const getVisitRequestsByFarmerId = async (farmerId: string) => {
  const database = await getDB();
  return await database.getAllAsync<VisitRequest & { id: number }>(
    'SELECT * FROM visit_requests WHERE farmer_id = ? ORDER BY created_at DESC',
    [farmerId]
  );
};

export const saveFarmerSelfOffline = async (farmer: { 
  name: string, 
  phone_number: string, 
  village?: string,
  address?: string, 
  crop_type: string, 
  variety?: string 
}) => {
  const database = await getDB();
  const result = await database.runAsync(
    'INSERT INTO pending_farmers (name, phone_number, village, address, crop_type, variety) VALUES (?, ?, ?, ?, ?, ?)',
    [farmer.name, farmer.phone_number, farmer.village || null, farmer.address || null, farmer.crop_type, farmer.variety || null]
  );
  return result.lastInsertRowId;
};
