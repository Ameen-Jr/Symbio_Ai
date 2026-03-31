import express, { Request, Response, NextFunction } from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import cors from "cors";
import morgan from "morgan";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import db from "./src/lib/db.ts";
import { runSimulationStep, processTrade } from "./src/lib/agents.ts";

const JWT_SECRET = process.env.JWT_SECRET || "super-secret-key";

interface AuthRequest extends Request {
  user?: { id: string; email: string; business_id: string };
}

const authenticate = (req: AuthRequest, res: Response, next: NextFunction) => {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) return res.status(401).json({ error: "Unauthorized" });
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as any;
    req.user = decoded;
    next();
  } catch (e) {
    res.status(401).json({ error: "Invalid token" });
  }
};

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(cors());
  app.use(express.json());
  app.use(morgan('dev'));

  // Auth Routes
  app.post("/api/auth/register", async (req, res) => {
    const { email, password, businessName, location, type } = req.body;
    try {
      const hashedPassword = await bcrypt.hash(password, 10);
      const businessId = `b_${Date.now()}`;
      const userId = `u_${Date.now()}`;

      db.prepare("INSERT INTO businesses (id, name, location, lat, lng, type) VALUES (?, ?, ?, ?, ?, ?)")
        .run(businessId, businessName, location, 9.98, 76.28, type); // Default Ernakulam coords

      db.prepare("INSERT INTO users (id, email, password, business_id) VALUES (?, ?, ?, ?)")
        .run(userId, email, hashedPassword, businessId);

      const token = jwt.sign({ id: userId, email, business_id: businessId }, JWT_SECRET);
      res.json({ token, user: { id: userId, email, business_id: businessId } });
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  app.post("/api/auth/login", async (req, res) => {
    const { email, password } = req.body;
    const user = db.prepare("SELECT * FROM users WHERE email = ?").get(email) as any;
    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({ error: "Invalid credentials" });
    }
    const token = jwt.sign({ id: user.id, email: user.email, business_id: user.business_id }, JWT_SECRET);
    res.json({ token, user: { id: user.id, email: user.email, business_id: user.business_id } });
  });

  app.get("/api/auth/me", authenticate, (req: AuthRequest, res) => {
    const business = db.prepare("SELECT * FROM businesses WHERE id = ?").get(req.user?.business_id);
    res.json({ user: req.user, business });
  });

  // Config Routes
  app.get("/api/config", (req, res) => {
    const penalty = db.prepare("SELECT value FROM config WHERE key = ?").get('carbon_penalty_factor') as any;
    res.json({ carbon_penalty_factor: parseFloat(penalty?.value || "0.5") });
  });

  app.post("/api/config", authenticate, (req, res) => {
    const { carbon_penalty_factor } = req.body;
    db.prepare("INSERT OR REPLACE INTO config (key, value) VALUES (?, ?)").run('carbon_penalty_factor', carbon_penalty_factor.toString());
    res.json({ success: true });
  });

  // Profile Routes
  app.post("/api/profile", authenticate, (req: AuthRequest, res) => {
    const { name, location, type } = req.body;
    db.prepare("UPDATE businesses SET name = ?, location = ?, type = ? WHERE id = ?")
      .run(name, location, type, req.user?.business_id);
    res.json({ success: true });
  });

  // Resource Routes
  app.get("/api/resources/me", authenticate, (req: AuthRequest, res) => {
    const resources = db.prepare("SELECT * FROM resources WHERE business_id = ?").all(req.user?.business_id);
    res.json(resources);
  });

  app.post("/api/resources", authenticate, (req: AuthRequest, res) => {
    const { name, quantity, type, value } = req.body;
    const id = `r_${Date.now()}`;
    db.prepare("INSERT INTO resources (id, business_id, name, quantity, type, value) VALUES (?, ?, ?, ?, ?, ?)")
      .run(id, req.user?.business_id, name, quantity, type, value);
    res.json({ success: true, id });
  });

  app.delete("/api/resources/:id", authenticate, (req: AuthRequest, res) => {
    db.prepare("DELETE FROM resources WHERE id = ? AND business_id = ?").run(req.params.id, req.user?.business_id);
    res.json({ success: true });
  });

  // Log Routes
  app.post("/api/logs", (req, res) => {
    const { trade_id, sender_id, message } = req.body;
    try {
      db.prepare('INSERT INTO logs (trade_id, sender_id, message) VALUES (?, ?, ?)').run(trade_id, sender_id, message);
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // API Routes
  app.get("/api/state", (req, res) => {
    try {
      const businesses = db.prepare("SELECT * FROM businesses").all();
      const resources = db.prepare("SELECT * FROM resources").all();
      const trades = db.prepare(`
        SELECT t.*, 
               b1.name as from_name, b2.name as to_name,
               r1.name as from_res_name, r2.name as to_res_name
        FROM trades t
        JOIN businesses b1 ON t.from_business_id = b1.id
        JOIN businesses b2 ON t.to_business_id = b2.id
        JOIN resources r1 ON t.from_resource_id = r1.id
        JOIN resources r2 ON t.to_resource_id = r2.id
        ORDER BY t.created_at DESC
      `).all();
      const logs = db.prepare(`
        SELECT l.*, b.name as sender_name 
        FROM logs l 
        JOIN businesses b ON l.sender_id = b.id 
        ORDER BY l.timestamp DESC 
        LIMIT 50
      `).all();

      res.json({ businesses, resources, trades, logs });
    } catch (e: any) {
      console.error("API State Error:", e);
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/trades/:id/approve", async (req, res) => {
    try {
      db.prepare("UPDATE trades SET status = 'APPROVED' WHERE id = ?").run(req.params.id);
      await processTrade(req.params.id);
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/trades/:id/reject", (req, res) => {
    try {
      db.prepare("UPDATE trades SET status = 'REJECTED' WHERE id = ?").run(req.params.id);
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  let godMode = false;
  let simulationEnabled = false;

  app.post("/api/god-mode", (req, res) => {
    try {
      godMode = req.body.enabled;
      res.json({ godMode });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/simulation/toggle", (req, res) => {
    try {
      simulationEnabled = req.body.enabled;
      res.json({ simulationEnabled });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // Catch-all for unknown API routes to prevent falling through to Vite/HTML
  app.all("/api/*", (req, res) => {
    res.status(404).json({ error: `API route not found: ${req.method} ${req.url}` });
  });

  // Global error handler
  app.use((err: any, req: Request, res: Response, next: NextFunction) => {
    console.error("Global Error Handler:", err);
    res.status(500).json({ error: "Internal Server Error", message: err.message });
  });

  // Simulation Loop
  const runSimulation = async () => {
    try {
      if (simulationEnabled) {
        await runSimulationStep(godMode);
      }
    } catch (e) {
      console.error("Simulation error:", e);
    } finally {
      setTimeout(runSimulation, godMode ? 500 : 5000);
    }
  };
  runSimulation();

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Symbio AI Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch(err => {
  console.error("CRITICAL: Failed to start server:", err);
  process.exit(1);
});
