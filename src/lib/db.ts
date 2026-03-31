import Database from 'better-sqlite3';
import path from 'path';

const db = new Database('symbio.db');

// Initialize tables
db.exec(`
  CREATE TABLE IF NOT EXISTS businesses (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    location TEXT NOT NULL,
    lat REAL,
    lng REAL,
    type TEXT,
    wallet_balance REAL DEFAULT 1000
  );

  CREATE TABLE IF NOT EXISTS resources (
    id TEXT PRIMARY KEY,
    business_id TEXT,
    name TEXT NOT NULL,
    quantity TEXT,
    type TEXT CHECK(type IN ('SURPLUS', 'NEED')),
    value REAL,
    FOREIGN KEY(business_id) REFERENCES businesses(id)
  );

  CREATE TABLE IF NOT EXISTS trades (
    id TEXT PRIMARY KEY,
    from_business_id TEXT,
    to_business_id TEXT,
    from_resource_id TEXT,
    to_resource_id TEXT,
    status TEXT CHECK(status IN ('PENDING', 'APPROVED', 'REJECTED')),
    sustainability_score REAL,
    credits_exchanged REAL DEFAULT 0,
    processed INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(from_business_id) REFERENCES businesses(id),
    FOREIGN KEY(to_business_id) REFERENCES businesses(id)
  );

  CREATE TABLE IF NOT EXISTS logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    trade_id TEXT,
    sender_id TEXT,
    message TEXT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    business_id TEXT,
    FOREIGN KEY(business_id) REFERENCES businesses(id)
  );

  CREATE TABLE IF NOT EXISTS config (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
`);

// Migration: Add missing columns to trades table if they don't exist
const tradesTableInfo = db.prepare("PRAGMA table_info(trades)").all() as any[];
const hasCreditsExchanged = tradesTableInfo.some(col => col.name === 'credits_exchanged');
const hasProcessed = tradesTableInfo.some(col => col.name === 'processed');

if (!hasCreditsExchanged) {
  db.exec("ALTER TABLE trades ADD COLUMN credits_exchanged REAL DEFAULT 0");
}
if (!hasProcessed) {
  db.exec("ALTER TABLE trades ADD COLUMN processed INTEGER DEFAULT 0");
}

// Migration: Add missing columns to businesses table if they don't exist
const businessesTableInfo = db.prepare("PRAGMA table_info(businesses)").all() as any[];
const hasWalletBalance = businessesTableInfo.some(col => col.name === 'wallet_balance');

if (!hasWalletBalance) {
  db.exec("ALTER TABLE businesses ADD COLUMN wallet_balance REAL DEFAULT 1000");
}

// Seed initial data for Ernakulam
const seedData = () => {
  // Clear existing simulation data to reduce clutter
  db.prepare('DELETE FROM trades').run();
  db.prepare('DELETE FROM logs').run();
  
  // Config
  db.prepare('INSERT OR IGNORE INTO config (key, value) VALUES (?, ?)').run('carbon_penalty_factor', '0.5');
  
  // Minimal set of businesses
  const businesses = [
    { id: 'b1', name: 'Grand Ernakulam Hotel', location: 'MG Road', lat: 9.9724, lng: 76.2856, type: 'Hotel' },
    { id: 'b2', name: 'Cochin Veggie Shop', location: 'Lulu Mall Area', lat: 10.0261, lng: 76.3079, type: 'Retail' },
    { id: 'b3', name: 'Kochi Community Kitchen', location: 'Fort Kochi', lat: 9.9658, lng: 76.2421, type: 'NGO' }
  ];

  const insertBusiness = db.prepare('INSERT OR IGNORE INTO businesses (id, name, location, lat, lng, type) VALUES (?, ?, ?, ?, ?, ?)');
  businesses.forEach(b => insertBusiness.run(b.id, b.name, b.location, b.lat, b.lng, b.type));

  // Minimal set of resources to prevent immediate trade explosion
  const resources = [
    { id: 'r1', business_id: 'b1', name: 'Excess Cooked Rice', quantity: '10kg', type: 'SURPLUS', value: 500 },
    { id: 'r2', business_id: 'b2', name: 'Slightly Bruised Tomatoes', quantity: '5kg', type: 'SURPLUS', value: 200 },
    { id: 'r3', business_id: 'b3', name: 'Fresh Vegetables', quantity: 'Any', type: 'NEED', value: 0 }
  ];

  const insertResource = db.prepare('INSERT OR IGNORE INTO resources (id, business_id, name, quantity, type, value) VALUES (?, ?, ?, ?, ?, ?)');
  resources.forEach(r => insertResource.run(r.id, r.business_id, r.name, r.quantity, r.type, r.value));
};

seedData();

export default db;
