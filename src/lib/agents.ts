import db from "./db.ts";

export interface Business {
  id: string;
  name: string;
  location: string;
  lat: number;
  lng: number;
  type: string;
  wallet_balance: number;
}

export interface Resource {
  id: string;
  business_id: string;
  name: string;
  quantity: string;
  type: 'SURPLUS' | 'NEED';
  value: number;
}

function getCarbonPenaltyFactor() {
  const row = db.prepare("SELECT value FROM config WHERE key = ?").get('carbon_penalty_factor') as { value: string } | undefined;
  return row ? parseFloat(row.value) : 0.5;
}

function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371; // km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export async function processTrade(tradeId: string) {
  const trade = db.prepare("SELECT * FROM trades WHERE id = ?").get(tradeId) as any;
  if (!trade || trade.status !== 'APPROVED' || trade.processed === 1) return;

  const fromBiz = db.prepare("SELECT * FROM businesses WHERE id = ?").get(trade.from_business_id) as Business;
  const toBiz = db.prepare("SELECT * FROM businesses WHERE id = ?").get(trade.to_business_id) as Business;

  if (trade.credits_exchanged > 0) {
    // from_business pays credits to to_business
    db.prepare("UPDATE businesses SET wallet_balance = wallet_balance - ? WHERE id = ?").run(trade.credits_exchanged, fromBiz.id);
    db.prepare("UPDATE businesses SET wallet_balance = wallet_balance + ? WHERE id = ?").run(trade.credits_exchanged, toBiz.id);
  } else if (trade.credits_exchanged < 0) {
    // to_business pays credits to from_business
    const amount = Math.abs(trade.credits_exchanged);
    db.prepare("UPDATE businesses SET wallet_balance = wallet_balance - ? WHERE id = ?").run(amount, toBiz.id);
    db.prepare("UPDATE businesses SET wallet_balance = wallet_balance + ? WHERE id = ?").run(amount, fromBiz.id);
  }

  // Mark as processed
  db.prepare("UPDATE trades SET processed = 1 WHERE id = ?").run(tradeId);

  // Remove satisfied resources from inventory
  db.prepare("DELETE FROM resources WHERE id = ?").run(trade.from_resource_id);
  db.prepare("DELETE FROM resources WHERE id = ?").run(trade.to_resource_id);
}

export async function runSimulationStep(godMode: boolean) {
  // Find potential matches
  const surplus = db.prepare("SELECT * FROM resources WHERE type = 'SURPLUS'").all() as Resource[];
  const needs = db.prepare("SELECT * FROM resources WHERE type = 'NEED'").all() as Resource[];

  for (const s of surplus) {
    for (const n of needs) {
      if (s.business_id === n.business_id) continue;

      // Check if trade already exists
      const existing = db.prepare("SELECT * FROM trades WHERE (from_resource_id = ? AND to_resource_id = ?) OR (from_resource_id = ? AND to_resource_id = ?)").get(s.id, n.id, n.id, s.id);
      if (existing) continue;

      const fromBiz = db.prepare("SELECT * FROM businesses WHERE id = ?").get(s.business_id) as Business;
      const toBiz = db.prepare("SELECT * FROM businesses WHERE id = ?").get(n.business_id) as Business;

      // Find if the other business has a surplus that this business needs
      const otherSurplus = db.prepare("SELECT * FROM resources WHERE business_id = ? AND type = 'SURPLUS'").get(toBiz.id) as Resource | undefined;
      
      const tradeId = `t_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
      const distance = calculateDistance(fromBiz.lat, fromBiz.lng, toBiz.lat, toBiz.lng);
      const carbonPenaltyFactor = getCarbonPenaltyFactor();
      
      let creditsExchanged = 0;
      let toResId = n.id;
      let toResValue = 100; // Default mock value for need

      if (otherSurplus) {
        toResId = otherSurplus.id;
        toResValue = otherSurplus.value;
        // Hybrid Valuation: Balance the trade with credits
        creditsExchanged = s.value - toResValue;
      } else {
        // Pure need fulfillment
        creditsExchanged = s.value - toResValue;
      }

      const score = (s.value + toResValue) - (distance * carbonPenaltyFactor);

      // Ensure we don't insert NaN values
      const safeScore = isNaN(score) ? 0 : score;
      const safeCredits = isNaN(creditsExchanged) ? 0 : creditsExchanged;

      db.prepare(`
        INSERT INTO trades (id, from_business_id, to_business_id, from_resource_id, to_resource_id, status, sustainability_score, credits_exchanged)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(tradeId, fromBiz.id, toBiz.id, s.id, toResId, godMode ? 'APPROVED' : 'PENDING', safeScore, safeCredits);

      if (godMode) {
        await processTrade(tradeId);
      }

      const toRes = db.prepare("SELECT * FROM resources WHERE id = ?").get(toResId) as Resource;
      return; // Run one at a time for simulation feel
    }
  }
}
