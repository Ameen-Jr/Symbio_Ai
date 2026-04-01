import Database from 'better-sqlite3';
import path from 'path';
 
const db = new Database('symbio.db');
 
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
 
// Migrations
const tradesTableInfo = db.prepare("PRAGMA table_info(trades)").all() as any[];
const hasCreditsExchanged = tradesTableInfo.some(col => col.name === 'credits_exchanged');
const hasProcessed = tradesTableInfo.some(col => col.name === 'processed');
if (!hasCreditsExchanged) db.exec("ALTER TABLE trades ADD COLUMN credits_exchanged REAL DEFAULT 0");
if (!hasProcessed) db.exec("ALTER TABLE trades ADD COLUMN processed INTEGER DEFAULT 0");
 
const businessesTableInfo = db.prepare("PRAGMA table_info(businesses)").all() as any[];
const hasWalletBalance = businessesTableInfo.some(col => col.name === 'wallet_balance');
if (!hasWalletBalance) db.exec("ALTER TABLE businesses ADD COLUMN wallet_balance REAL DEFAULT 1000");
 
// ─────────────────────────────────────────────────────────────────────────────
// DEMO SEED  –  rich hackathon data that tells a circular economy story
// ─────────────────────────────────────────────────────────────────────────────
const seedData = () => {
  db.prepare('INSERT OR IGNORE INTO config (key, value) VALUES (?, ?)').run('carbon_penalty_factor', '0.5');
 
  // ── 7 Businesses ──────────────────────────────────────────────────────────
  const businesses = [
    { id: 'b1', name: 'Grand Ernakulam Hotel',    location: 'MG Road, Ernakulam',         lat: 9.9724,  lng: 76.2856, type: 'Hotel',   wallet_balance: 1340 },
    { id: 'b2', name: 'Cochin Veggie Co-op',      location: 'Lulu Mall Area, Edapally',   lat: 10.0261, lng: 76.3079, type: 'Retail',  wallet_balance: 960  },
    { id: 'b3', name: 'Kochi Community Kitchen',  location: 'Fort Kochi',                 lat: 9.9658,  lng: 76.2421, type: 'NGO',     wallet_balance: 1200 },
    { id: 'b4', name: 'Spice Garden Restaurant',  location: 'Panampilly Nagar',           lat: 9.9666,  lng: 76.2934, type: 'Kitchen', wallet_balance: 780  },
    { id: 'b5', name: 'Kerala Eco Farms',         location: 'Kakkanad, Ernakulam',        lat: 10.0158, lng: 76.3419, type: 'Farm',    wallet_balance: 1550 },
    { id: 'b6', name: 'Bolgatty Bakery & Café',   location: 'Mulavukad, Ernakulam',       lat: 10.0031, lng: 76.2603, type: 'Retail',  wallet_balance: 890  },
    { id: 'b7', name: 'Infopark Canteen',         location: 'Infopark Phase 1, Kakkanad', lat: 10.0201, lng: 76.3509, type: 'Kitchen', wallet_balance: 1120 },
  ];
 
  const insertBusiness = db.prepare(
    'INSERT OR IGNORE INTO businesses (id, name, location, lat, lng, type, wallet_balance) VALUES (?, ?, ?, ?, ?, ?, ?)'
  );
  businesses.forEach(b => insertBusiness.run(b.id, b.name, b.location, b.lat, b.lng, b.type, b.wallet_balance));
 
  // ── Resources (current open inventory for simulation to pick up) ───────────
  const resources = [
    // Grand Ernakulam Hotel
    { id: 'r1',  business_id: 'b1', name: 'Excess Cooked Rice',       quantity: '15 kg',   type: 'SURPLUS', value: 300 },
    { id: 'r2',  business_id: 'b1', name: 'Used Cooking Oil',         quantity: '20 litres',type: 'SURPLUS', value: 200 },
    { id: 'r3',  business_id: 'b1', name: 'Fresh Vegetables',         quantity: 'Daily',   type: 'NEED',    value: 400 },
    // Cochin Veggie Co-op
    { id: 'r4',  business_id: 'b2', name: 'Overripe Tomatoes',        quantity: '8 kg',    type: 'SURPLUS', value: 160 },
    { id: 'r5',  business_id: 'b2', name: 'Bruised Mangoes',          quantity: '5 kg',    type: 'SURPLUS', value: 100 },
    { id: 'r6',  business_id: 'b2', name: 'Organic Compost',          quantity: '50 kg',   type: 'NEED',    value: 500 },
    // Kochi Community Kitchen
    { id: 'r7',  business_id: 'b3', name: 'Prepared Meals (surplus)', quantity: '40 meals',type: 'SURPLUS', value: 800 },
    { id: 'r8',  business_id: 'b3', name: 'Cooking Gas (LPG)',        quantity: '2 cylinders', type: 'NEED', value: 300 },
    // Spice Garden Restaurant
    { id: 'r9',  business_id: 'b4', name: 'Spent Coffee Grounds',     quantity: '10 kg',   type: 'SURPLUS', value: 50  },
    { id: 'r10', business_id: 'b4', name: 'Excess Bread Loaves',      quantity: '20 units',type: 'SURPLUS', value: 200 },
    { id: 'r11', business_id: 'b4', name: 'Cooked Rice (excess)',      quantity: '8 kg',    type: 'NEED',    value: 160 },
    // Kerala Eco Farms
    { id: 'r12', business_id: 'b5', name: 'Organic Compost',          quantity: '200 kg',  type: 'SURPLUS', value: 600 },
    { id: 'r13', business_id: 'b5', name: 'Seasonal Vegetables',      quantity: '30 kg',   type: 'SURPLUS', value: 450 },
    { id: 'r14', business_id: 'b5', name: 'Used Cooking Oil',         quantity: '10 litres',type: 'NEED',   value: 100 },
    // Bolgatty Bakery
    { id: 'r15', business_id: 'b6', name: 'Day-old Pastries',         quantity: '3 kg',    type: 'SURPLUS', value: 120 },
    { id: 'r16', business_id: 'b6', name: 'Spent Coffee Grounds',     quantity: '5 kg',    type: 'NEED',    value: 50  },
    // Infopark Canteen
    { id: 'r17', business_id: 'b7', name: 'Cafeteria Food Waste',     quantity: '25 kg',   type: 'SURPLUS', value: 0   },
    { id: 'r18', business_id: 'b7', name: 'Prepared Meals (surplus)', quantity: '30 meals',type: 'NEED',    value: 600 },
  ];
 
  const insertResource = db.prepare(
    'INSERT OR IGNORE INTO resources (id, business_id, name, quantity, type, value) VALUES (?, ?, ?, ?, ?, ?)'
  );
  resources.forEach(r => insertResource.run(r.id, r.business_id, r.name, r.quantity, r.type, r.value));
 
  // ── Completed trades (APPROVED + processed) – tell the story ──────────────
  const completedTrades = [
    {
      id: 'tr1',
      from_business_id: 'b5', to_business_id: 'b2',
      from_resource_id: 'r_hist1', to_resource_id: 'r_hist2',
      status: 'APPROVED', sustainability_score: 88.4,
      credits_exchanged: 100, processed: 1,
      created_at: ago(6, 'hours'),
    },
    {
      id: 'tr2',
      from_business_id: 'b1', to_business_id: 'b3',
      from_resource_id: 'r_hist3', to_resource_id: 'r_hist4',
      status: 'APPROVED', sustainability_score: 74.1,
      credits_exchanged: 0, processed: 1,
      created_at: ago(5, 'hours'),
    },
    {
      id: 'tr3',
      from_business_id: 'b4', to_business_id: 'b5',
      from_resource_id: 'r_hist5', to_resource_id: 'r_hist6',
      status: 'APPROVED', sustainability_score: 62.8,
      credits_exchanged: -50, processed: 1,
      created_at: ago(4, 'hours'),
    },
    {
      id: 'tr4',
      from_business_id: 'b6', to_business_id: 'b4',
      from_resource_id: 'r_hist7', to_resource_id: 'r_hist8',
      status: 'APPROVED', sustainability_score: 91.2,
      credits_exchanged: 70, processed: 1,
      created_at: ago(3, 'hours'),
    },
    {
      id: 'tr5',
      from_business_id: 'b2', to_business_id: 'b7',
      from_resource_id: 'r_hist9', to_resource_id: 'r_hist10',
      status: 'APPROVED', sustainability_score: 55.6,
      credits_exchanged: 0, processed: 1,
      created_at: ago(2, 'hours'),
    },
    {
      id: 'tr6',
      from_business_id: 'b3', to_business_id: 'b1',
      from_resource_id: 'r_hist11', to_resource_id: 'r_hist12',
      status: 'REJECTED', sustainability_score: 22.3,
      credits_exchanged: 0, processed: 0,
      created_at: ago(90, 'minutes'),
    },
  ];
 
  // We need phantom resource rows so the JOIN in /api/state doesn't break
  const histResources = [
    { id: 'r_hist1',  business_id: 'b5', name: 'Organic Compost',       quantity: '50 kg',    type: 'SURPLUS', value: 600 },
    { id: 'r_hist2',  business_id: 'b2', name: 'Overripe Tomatoes',      quantity: '8 kg',     type: 'SURPLUS', value: 160 },
    { id: 'r_hist3',  business_id: 'b1', name: 'Excess Cooked Rice',     quantity: '20 kg',    type: 'SURPLUS', value: 400 },
    { id: 'r_hist4',  business_id: 'b3', name: 'Prepared Meals',         quantity: '50 meals', type: 'NEED',    value: 1000 },
    { id: 'r_hist5',  business_id: 'b4', name: 'Spent Coffee Grounds',   quantity: '8 kg',     type: 'SURPLUS', value: 40  },
    { id: 'r_hist6',  business_id: 'b5', name: 'Used Cooking Oil',       quantity: '8 litres', type: 'NEED',    value: 80  },
    { id: 'r_hist7',  business_id: 'b6', name: 'Day-old Pastries',       quantity: '5 kg',     type: 'SURPLUS', value: 200 },
    { id: 'r_hist8',  business_id: 'b4', name: 'Baked Goods',            quantity: '5 kg',     type: 'NEED',    value: 200 },
    { id: 'r_hist9',  business_id: 'b2', name: 'Mixed Vegetables',       quantity: '15 kg',    type: 'SURPLUS', value: 300 },
    { id: 'r_hist10', business_id: 'b7', name: 'Fresh Produce',          quantity: '15 kg',    type: 'NEED',    value: 300 },
    { id: 'r_hist11', business_id: 'b3', name: 'Surplus Meals',          quantity: '20 meals', type: 'SURPLUS', value: 400 },
    { id: 'r_hist12', business_id: 'b1', name: 'Cooked Food',            quantity: '20 meals', type: 'NEED',    value: 400 },
  ];
 
  histResources.forEach(r => insertResource.run(r.id, r.business_id, r.name, r.quantity, r.type, r.value));
 
  const insertTrade = db.prepare(`
    INSERT OR IGNORE INTO trades
      (id, from_business_id, to_business_id, from_resource_id, to_resource_id,
       status, sustainability_score, credits_exchanged, processed, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  completedTrades.forEach(t =>
    insertTrade.run(
      t.id, t.from_business_id, t.to_business_id,
      t.from_resource_id, t.to_resource_id,
      t.status, t.sustainability_score, t.credits_exchanged,
      t.processed, t.created_at
    )
  );
 
  // ── Pending trades (visible in the Trade Ledger, awaiting approval) ────────
  const pendingTrades = [
    {
      id: 'tr7',
      from_business_id: 'b5', to_business_id: 'b3',
      from_resource_id: 'r13', to_resource_id: 'r7',
      status: 'PENDING', sustainability_score: 79.3,
      credits_exchanged: -150, processed: 0,
      created_at: ago(25, 'minutes'),
    },
    {
      id: 'tr8',
      from_business_id: 'b1', to_business_id: 'b4',
      from_resource_id: 'r1', to_resource_id: 'r11',
      status: 'PENDING', sustainability_score: 68.5,
      credits_exchanged: 140, processed: 0,
      created_at: ago(18, 'minutes'),
    },
    {
      id: 'tr9',
      from_business_id: 'b2', to_business_id: 'b5',
      from_resource_id: 'r4', to_resource_id: 'r12',
      status: 'PENDING', sustainability_score: 83.7,
      credits_exchanged: -440, processed: 0,
      created_at: ago(10, 'minutes'),
    },
  ];
 
  pendingTrades.forEach(t =>
    insertTrade.run(
      t.id, t.from_business_id, t.to_business_id,
      t.from_resource_id, t.to_resource_id,
      t.status, t.sustainability_score, t.credits_exchanged,
      t.processed, t.created_at
    )
  );
 
  // ── AI Negotiation Logs ────────────────────────────────────────────────────
  const logs = [
    // tr1 – Eco Farms ↔ Veggie Co-op (completed, vivid back-and-forth)
    {
      trade_id: 'tr1', sender_id: 'b5',
      message: 'Kerala Eco Farms AI: Greetings! We have 50 kg of premium organic compost available. Your overripe tomatoes are exactly what our composting cycle needs. I propose a balanced barter with a 100 SC top-up given the 2.4 km proximity — excellent sustainability score of 88.4.',
      timestamp: ago(6, 'hours'),
    },
    {
      trade_id: 'tr1', sender_id: 'b2',
      message: 'Cochin Veggie Co-op AI: This is a near-perfect circular trade. Our tomatoes would otherwise go to landfill, and we desperately need compost for our rooftop garden. We accept the 100 SC adjustment. Local circular economy at its finest — finalising the agreement.',
      timestamp: ago(5, 'hours', 50),
    },
    // tr2 – Hotel ↔ Community Kitchen (completed, pure barter)
    {
      trade_id: 'tr2', sender_id: 'b1',
      message: 'Grand Ernakulam Hotel AI: We generate approximately 20 kg of surplus cooked rice nightly. Rather than disposal costs, we propose a direct barter with Kochi Community Kitchen — your prepared meals in return. Zero credits exchanged; values are matched. Sustainability score: 74.1.',
      timestamp: ago(5, 'hours'),
    },
    {
      trade_id: 'tr2', sender_id: 'b3',
      message: 'Kochi Community Kitchen AI: This trade directly feeds 50+ families tonight. The hotel\'s surplus rice becomes our base ingredient — zero food waste, zero transport cost, maximum community impact. We are locking in this agreement immediately.',
      timestamp: ago(4, 'hours', 55),
    },
    // tr4 – Bakery ↔ Restaurant (completed, high score)
    {
      trade_id: 'tr4', sender_id: 'b6',
      message: 'Bolgatty Bakery AI: Our day-old pastries are premium quality — simply cosmetically imperfect. Score of 91.2 reflects the 1.1 km distance between us. I propose 70 SC from your side to balance the value differential. This keeps both operations lean and waste-free.',
      timestamp: ago(3, 'hours'),
    },
    {
      trade_id: 'tr4', sender_id: 'b4',
      message: 'Spice Garden Restaurant AI: Our afternoon menu can easily incorporate these pastries as dessert components. 70 SC is fair given the quality. Agreed. Scheduling pickup for 14:00 today — this is exactly the kind of hyper-local circular trade Symbio was built for.',
      timestamp: ago(2, 'hours', 58),
    },
    // tr7 – pending, Eco Farms ↔ Community Kitchen
    {
      trade_id: 'tr7', sender_id: 'b5',
      message: 'Kerala Eco Farms AI: We have 30 kg of seasonal vegetables — capsicum, bitter gourd, and banana flowers. Your 40 prepared meals would feed our farm workers. I propose 150 SC from your side given our higher resource value. Distance is only 4.2 km — sustainability score 79.3.',
      timestamp: ago(24, 'minutes'),
    },
    {
      trade_id: 'tr7', sender_id: 'b3',
      message: 'Kochi Community Kitchen AI: The farm-to-community pipeline is exactly our mission. 150 SC is within budget. Counter-proposal: we also provide a weekly recurring arrangement — your vegetables become our staple ingredient, reducing both parties\' procurement uncertainty. Awaiting human approval.',
      timestamp: ago(20, 'minutes'),
    },
    // tr8 – pending, Hotel ↔ Restaurant
    {
      trade_id: 'tr8', sender_id: 'b1',
      message: 'Grand Ernakulam Hotel AI: Offering 15 kg surplus cooked rice from tonight\'s banquet. Your excess rice need is an exact match. 140 SC requested from Spice Garden to balance the value. Both establishments benefit — we avoid waste disposal fees, you get a reliable rice source.',
      timestamp: ago(17, 'minutes'),
    },
    // tr9 – pending, Veggie Co-op ↔ Eco Farms (best score pending)
    {
      trade_id: 'tr9', sender_id: 'b2',
      message: 'Cochin Veggie Co-op AI: 8 kg of overripe tomatoes — still nutritionally rich, perfect for compost feedstock. Your 200 kg compost supply is 4x our value; I calculate 440 SC top-up from our side to balance. Score of 83.7 confirms this is a priority trade for the network.',
      timestamp: ago(9, 'minutes'),
    },
    {
      trade_id: 'tr9', sender_id: 'b5',
      message: 'Kerala Eco Farms AI: Confirmed. Tomato feedstock significantly accelerates our composting cycle — this is precisely the closed-loop model. 440 SC is accepted. We can deliver compost within 24 hours of tomato receipt. Pending human approval to finalise.',
      timestamp: ago(7, 'minutes'),
    },
  ];
 
  const insertLog = db.prepare(
    'INSERT OR IGNORE INTO logs (trade_id, sender_id, message, timestamp) VALUES (?, ?, ?, ?)'
  );
  logs.forEach(l => insertLog.run(l.trade_id, l.sender_id, l.message, l.timestamp));
};
 
// ─── Helper ────────────────────────────────────────────────────────────────
function ago(amount: number, unit: 'hours' | 'minutes', extra: number = 0): string {
  const ms = unit === 'hours'
    ? amount * 60 * 60 * 1000 + extra * 60 * 1000
    : amount * 60 * 1000;
  return new Date(Date.now() - ms).toISOString().replace('T', ' ').slice(0, 19);
}
 
seedData();
 
export default db;
