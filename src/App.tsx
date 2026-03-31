import React, { useState, useEffect, useRef } from 'react';
import { GoogleGenAI } from "@google/genai";
import { 
  Activity, 
  ArrowRightLeft, 
  Zap, 
  ShieldCheck, 
  ShieldAlert, 
  MessageSquare, 
  MapPin, 
  TrendingUp,
  Leaf,
  User,
  Settings,
  LogOut,
  Lock,
  Mail,
  Building,
  Globe,
  Wallet,
  Package,
  Plus,
  Trash2,
  BarChart3
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { formatDistanceToNow } from 'date-fns';
import { cn } from './lib/utils';
import { 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  AreaChart,
  Area
} from 'recharts';

interface Trade {
  id: string;
  from_business_id: string;
  to_business_id: string;
  from_name: string;
  to_name: string;
  from_res_name: string;
  to_res_name: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  sustainability_score: number;
  credits_exchanged: number;
  created_at: string;
}

interface Log {
  id: number;
  trade_id: string;
  sender_name: string;
  message: string;
  timestamp: string;
}

interface UserData {
  id: string;
  email: string;
  business_id: string;
}

interface BusinessData {
  id: string;
  name: string;
  location: string;
  type: string;
  wallet_balance: number;
}

interface Resource {
  id: string;
  business_id: string;
  name: string;
  quantity: string;
  type: 'SURPLUS' | 'NEED';
  value: number;
}

export default function App() {
  const [state, setState] = useState<{ trades: Trade[], logs: Log[], businesses: any[] }>({ trades: [], logs: [], businesses: [] });
  const [godMode, setGodMode] = useState(false);
  const [simulationEnabled, setSimulationEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<UserData | null>(null);
  const [business, setBusiness] = useState<BusinessData | null>(null);
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [showSettings, setShowSettings] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [showInventory, setShowInventory] = useState(false);
  const [myResources, setMyResources] = useState<Resource[]>([]);
  const [carbonPenalty, setCarbonPenalty] = useState(0.5);
  const [token, setToken] = useState<string | null>(localStorage.getItem('token'));
  const negotiatingRef = useRef<Set<string>>(new Set());

  // Inventory Form
  const [newResName, setNewResName] = useState('');
  const [newResQty, setNewResQty] = useState('');
  const [newResType, setNewResType] = useState<'SURPLUS' | 'NEED'>('SURPLUS');
  const [newResValue, setNewResValue] = useState(100);

  // Chart Data
  const chartData = state.trades
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
    .reduce((acc: any[], trade, idx) => {
      const prevScore = idx > 0 ? acc[idx - 1].score : 0;
      acc.push({
        name: `T${idx + 1}`,
        score: prevScore + trade.sustainability_score,
        impact: trade.sustainability_score
      });
      return acc;
    }, []);

  // Auth Forms
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [bizName, setBizName] = useState('');
  const [bizLocation, setBizLocation] = useState('');
  const [bizType, setBizType] = useState('Retail');

  const fetchData = async () => {
    try {
      const res = await fetch('/api/state');
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Failed to fetch state: ${res.status} ${text.substring(0, 100)}`);
      }
      const data = await res.json();
      setState(data);

      if (user) {
        const myBiz = data.businesses.find((b: any) => b.id === user.business_id);
        if (myBiz) setBusiness(myBiz);
      }

      const configRes = await fetch('/api/config');
      if (!configRes.ok) {
        const text = await configRes.text();
        throw new Error(`Failed to fetch config: ${configRes.status} ${text.substring(0, 100)}`);
      }
      const configData = await configRes.json();
      setCarbonPenalty(configData.carbon_penalty_factor);
    } catch (e) {
      console.error("Fetch error:", e);
    } finally {
      setLoading(false);
    }
  };

  const fetchMe = async () => {
    if (!token) return;
    try {
      const res = await fetch('/api/auth/me', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setUser(data.user);
        setBusiness(data.business);
      } else {
        handleLogout();
      }
    } catch (e) {
      console.error(e);
    }
  };

  const fetchMyResources = async () => {
    if (!token) return;
    try {
      const res = await fetch('/api/resources/me', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setMyResources(data);
      }
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    // Automatic negotiations disabled due to quota limits
    /*
    const runNegotiations = async () => {
      const pendingTrades = state.trades.filter(t => 
        !state.logs.some(l => l.trade_id === t.id) && 
        !negotiatingRef.current.has(t.id)
      );

      for (const trade of pendingTrades) {
        negotiatingRef.current.add(trade.id);
        try {
          const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });
          const prompt = `
            You are an AI Business Agent for "${trade.from_name}".
            You are negotiating a barter trade with "${trade.to_name}".
            
            YOUR SURPLUS: ${trade.from_res_name}
            THEIR SURPLUS: ${trade.to_res_name}
            
            HYBRID VALUATION MODEL:
            - Proposed Credits Exchange: ${trade.credits_exchanged > 0 ? `${trade.from_name} pays ${trade.credits_exchanged} credits to ${trade.to_name}` : trade.credits_exchanged < 0 ? `${trade.to_name} pays ${Math.abs(trade.credits_exchanged)} credits to ${trade.from_name}` : 'Pure Barter (Equal Value)'}
            
            SUSTAINABILITY SCORE: ${trade.sustainability_score.toFixed(2)}
            
            Goal: Conduct a polite, professional negotiation to finalize this "Balanced Trade". 
            Focus on the circular economy and local impact in Ernakulam.
            
            If the trade seems fair, propose a final agreement.
            Return your response as a single message.
          `;

          const response = await ai.models.generateContent({
            model: "gemini-3-flash-preview",
            contents: prompt,
          });

          const message = response.text || "I'm interested in exploring this balanced trade further.";
          
          await fetch('/api/logs', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
              trade_id: trade.id, 
              sender_id: trade.from_business_id, 
              message 
            })
          });
          
          fetchData();
        } catch (error) {
          console.error("Negotiation error:", error);
        } finally {
          // Keep it in the set for a bit to avoid double-triggering before state updates
          setTimeout(() => negotiatingRef.current.delete(trade.id), 10000);
        }
      }
    };

    if (state.trades.length > 0) {
      runNegotiations();
    }
    */
  }, [state.trades, state.logs]);

  useEffect(() => {
    fetchData();
    fetchMe();
    fetchMyResources();
    const interval = setInterval(fetchData, 5000);
    return () => clearInterval(interval);
  }, [token]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    if (res.ok) {
      const data = await res.json();
      localStorage.setItem('token', data.token);
      setToken(data.token);
      setUser(data.user);
    } else {
      alert("Invalid credentials");
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, businessName: bizName, location: bizLocation, type: bizType })
    });
    if (res.ok) {
      const data = await res.json();
      localStorage.setItem('token', data.token);
      setToken(data.token);
      setUser(data.user);
    } else {
      alert("Registration failed");
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    setToken(null);
    setUser(null);
    setBusiness(null);
  };

  const updateConfig = async (val: number) => {
    setCarbonPenalty(val);
    await fetch('/api/config', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ carbon_penalty_factor: val })
    });
  };

  const updateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!business) return;
    const res = await fetch('/api/profile', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify(business)
    });
    if (res.ok) {
      setShowProfile(false);
      fetchMe();
    }
  };

  const toggleGodMode = async () => {
    const newMode = !godMode;
    setGodMode(newMode);
    await fetch('/api/god-mode', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: newMode })
    });
  };

  const toggleSimulation = async () => {
    const newMode = !simulationEnabled;
    setSimulationEnabled(newMode);
    await fetch('/api/simulation/toggle', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: newMode })
    });
  };

  const addResource = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await fetch('/api/resources', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ name: newResName, quantity: newResQty, type: newResType, value: newResValue })
    });
    if (res.ok) {
      setNewResName('');
      setNewResQty('');
      setNewResValue(100);
      fetchMyResources();
      fetchData();
    }
  };

  const deleteResource = async (id: string) => {
    const res = await fetch(`/api/resources/${id}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (res.ok) {
      fetchMyResources();
      fetchData();
    }
  };

  const handleTrade = async (id: string, action: 'approve' | 'reject') => {
    await fetch(`/api/trades/${id}/${action}`, { method: 'POST' });
    fetchData();
  };

  if (!token) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] text-white flex items-center justify-center p-6">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-md bg-white/5 border border-white/10 rounded-[2rem] p-10 backdrop-blur-xl"
        >
          <div className="flex flex-col items-center mb-10">
            <div className="w-16 h-16 bg-emerald-500 rounded-2xl flex items-center justify-center shadow-[0_0_30px_rgba(16,185,129,0.3)] mb-6">
              <Activity className="text-black w-10 h-10" />
            </div>
            <h1 className="text-2xl font-bold tracking-tight">SYMBIO AI</h1>
            <p className="text-xs text-emerald-500 font-mono uppercase tracking-widest mt-2">Autonomous Circular Economy</p>
          </div>

          <form onSubmit={authMode === 'login' ? handleLogin : handleRegister} className="space-y-4">
            <div className="space-y-2">
              <label className="text-[10px] font-bold text-white/40 uppercase tracking-widest ml-1">Email Address</label>
              <div className="relative">
                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-white/20" />
                <input 
                  type="email" 
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full bg-black/40 border border-white/10 rounded-2xl py-3 pl-12 pr-4 text-sm focus:outline-none focus:border-emerald-500/50 transition-colors"
                  placeholder="name@business.com"
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-bold text-white/40 uppercase tracking-widest ml-1">Password</label>
              <div className="relative">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-white/20" />
                <input 
                  type="password" 
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-black/40 border border-white/10 rounded-2xl py-3 pl-12 pr-4 text-sm focus:outline-none focus:border-emerald-500/50 transition-colors"
                  placeholder="••••••••"
                  required
                />
              </div>
            </div>

            {authMode === 'register' && (
              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="space-y-4 pt-4 border-t border-white/5 mt-4">
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-white/40 uppercase tracking-widest ml-1">Business Name</label>
                  <div className="relative">
                    <Building className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-white/20" />
                    <input 
                      type="text" 
                      value={bizName}
                      onChange={(e) => setBizName(e.target.value)}
                      className="w-full bg-black/40 border border-white/10 rounded-2xl py-3 pl-12 pr-4 text-sm focus:outline-none focus:border-emerald-500/50 transition-colors"
                      placeholder="Grand Ernakulam Hotel"
                      required
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-white/40 uppercase tracking-widest ml-1">Location</label>
                  <div className="relative">
                    <MapPin className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-white/20" />
                    <input 
                      type="text" 
                      value={bizLocation}
                      onChange={(e) => setBizLocation(e.target.value)}
                      className="w-full bg-black/40 border border-white/10 rounded-2xl py-3 pl-12 pr-4 text-sm focus:outline-none focus:border-emerald-500/50 transition-colors"
                      placeholder="MG Road, Ernakulam"
                      required
                    />
                  </div>
                </div>
              </motion.div>
            )}

            <button className="w-full bg-emerald-500 text-black font-bold py-4 rounded-2xl shadow-[0_0_20px_rgba(16,185,129,0.3)] hover:scale-[1.02] active:scale-[0.98] transition-all mt-6">
              {authMode === 'login' ? 'SIGN IN' : 'CREATE ACCOUNT'}
            </button>
          </form>

          <div className="mt-8 text-center">
            <button 
              onClick={() => setAuthMode(authMode === 'login' ? 'register' : 'login')}
              className="text-xs text-white/40 hover:text-emerald-500 transition-colors"
            >
              {authMode === 'login' ? "Don't have an account? Register" : "Already have an account? Login"}
            </button>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white font-sans selection:bg-emerald-500/30">
      {/* Quota Warning */}
      {!simulationEnabled && (
        <div className="bg-amber-500/10 border-b border-amber-500/20 py-2 px-6 flex items-center justify-center gap-3">
          <ShieldAlert className="w-4 h-4 text-amber-500" />
          <p className="text-[10px] font-bold text-amber-500 uppercase tracking-widest">
            AI Negotiations & Simulation Paused (Quota Limit Reached)
          </p>
        </div>
      )}

      {/* Header */}
      <header className="border-b border-white/10 bg-black/50 backdrop-blur-xl sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-emerald-500 rounded-xl flex items-center justify-center shadow-[0_0_20px_rgba(16,185,129,0.3)]">
              <Activity className="text-black w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight">SYMBIO AI</h1>
              <p className="text-[10px] text-emerald-500 font-mono uppercase tracking-widest">Autonomous Circular Economy</p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <button 
              onClick={() => setShowProfile(true)}
              className="flex items-center gap-3 px-4 py-2 bg-emerald-500/5 rounded-full border border-emerald-500/10 hover:bg-emerald-500/10 transition-all"
            >
              <Wallet className="w-4 h-4 text-emerald-500" />
              <div className="flex flex-col items-start">
                <span className="text-[8px] font-bold text-emerald-500/50 uppercase tracking-tighter leading-none">Wallet Balance</span>
                <span className="text-sm font-mono font-bold text-emerald-400 leading-none mt-1">
                  {business?.wallet_balance?.toLocaleString() ?? '0'} <span className="text-[10px] opacity-50">SC</span>
                </span>
              </div>
            </button>

            <div className="hidden sm:flex items-center gap-2 px-4 py-2 bg-white/5 rounded-full border border-white/10">
              <MapPin className="w-4 h-4 text-emerald-500" />
              <span className="text-sm font-medium">{business?.location || 'Ernakulam Node'}</span>
            </div>
            
            <div className="h-8 w-px bg-white/10 mx-2" />

            <button 
              onClick={() => setShowInventory(true)}
              className="p-2.5 bg-white/5 rounded-xl border border-white/10 hover:bg-white/10 transition-all group"
              title="Inventory Manager"
            >
              <Package className="w-5 h-5 text-white/40 group-hover:text-emerald-500 transition-colors" />
            </button>

            <button 
              onClick={() => setShowSettings(true)}
              className="p-2.5 bg-white/5 rounded-xl border border-white/10 hover:bg-white/10 transition-all group"
              title="Algorithm Settings"
            >
              <Settings className="w-5 h-5 text-white/40 group-hover:text-emerald-500 transition-colors" />
            </button>

            <button 
              onClick={() => setShowProfile(true)}
              className="p-2.5 bg-white/5 rounded-xl border border-white/10 hover:bg-white/10 transition-all group"
              title="Business Profile"
            >
              <User className="w-5 h-5 text-white/40 group-hover:text-emerald-500 transition-colors" />
            </button>

            <button 
              onClick={handleLogout}
              className="p-2.5 bg-white/5 rounded-xl border border-white/10 hover:bg-red-500/20 transition-all group"
              title="Logout"
            >
              <LogOut className="w-5 h-5 text-white/40 group-hover:text-red-500 transition-colors" />
            </button>

            <button 
              onClick={toggleSimulation}
              className={cn(
                "flex items-center gap-2 px-6 py-2.5 rounded-full font-bold text-sm transition-all duration-500 ml-2",
                simulationEnabled 
                  ? "bg-emerald-500 text-black shadow-[0_0_30px_rgba(16,185,129,0.4)]" 
                  : "bg-white/10 text-white hover:bg-white/20"
              )}
            >
              <Activity className={cn("w-4 h-4", simulationEnabled && "animate-pulse")} />
              {simulationEnabled ? "SIM ACTIVE" : "SIM PAUSED"}
            </button>

            <button 
              onClick={toggleGodMode}
              className={cn(
                "flex items-center gap-2 px-6 py-2.5 rounded-full font-bold text-sm transition-all duration-500 ml-2",
                godMode 
                  ? "bg-red-500 text-white shadow-[0_0_30px_rgba(239,68,68,0.4)]" 
                  : "bg-white/10 text-white hover:bg-white/20"
              )}
            >
              <Zap className={cn("w-4 h-4", godMode && "animate-pulse")} />
              {godMode ? "GOD MODE" : "GOD MODE"}
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-10 grid grid-cols-12 gap-8">
        {/* Left Column: Stats & Pulse */}
        <div className="col-span-12 lg:col-span-4 space-y-8">
          <section className="bg-white/5 border border-white/10 rounded-3xl p-8">
            <h2 className="text-sm font-mono text-emerald-500 uppercase tracking-widest mb-6 flex items-center gap-2">
              <TrendingUp className="w-4 h-4" />
              Network Pulse
            </h2>
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-black/40 rounded-2xl p-4 border border-white/5">
                <p className="text-white/40 text-xs mb-1">Active Agents</p>
                <p className="text-3xl font-bold">{state.businesses.length}</p>
              </div>
              <div className="bg-black/40 rounded-2xl p-4 border border-white/5">
                <p className="text-white/40 text-xs mb-1">Total Trades</p>
                <p className="text-3xl font-bold">{state.trades.length}</p>
              </div>
              <div className="bg-black/40 rounded-2xl p-4 border border-white/5 col-span-2">
                <p className="text-white/40 text-xs mb-1">Avg Sustainability Score</p>
                <div className="flex items-end gap-2">
                  <p className="text-3xl font-bold text-emerald-400">
                    {(state.trades.reduce((acc, t) => acc + t.sustainability_score, 0) / (state.trades.length || 1)).toFixed(1)}
                  </p>
                  <Leaf className="w-5 h-5 text-emerald-500 mb-1" />
                </div>
              </div>
              <button 
                onClick={() => setShowProfile(true)}
                className="bg-emerald-500/5 rounded-2xl p-4 border border-emerald-500/10 col-span-2 text-left hover:bg-emerald-500/10 transition-all"
              >
                <p className="text-emerald-500/50 text-[10px] font-bold uppercase tracking-widest mb-1">Your Wallet</p>
                <div className="flex items-center justify-between">
                  <p className="text-2xl font-mono font-bold text-emerald-400">
                    {business?.wallet_balance?.toLocaleString() ?? '0'} <span className="text-xs opacity-50">SC</span>
                  </p>
                  <Wallet className="w-5 h-5 text-emerald-500/50" />
                </div>
              </button>
            </div>
          </section>

          <section className="bg-white/5 border border-white/10 rounded-3xl p-8">
            <h2 className="text-sm font-mono text-emerald-500 uppercase tracking-widest mb-6 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <BarChart3 className="w-4 h-4" />
                Sustainability Impact
              </div>
              <span className="text-[10px] text-white/30">CUMULATIVE SC</span>
            </h2>
            <div className="h-[200px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData}>
                  <defs>
                    <linearGradient id="colorScore" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#ffffff05" vertical={false} />
                  <XAxis 
                    dataKey="name" 
                    hide 
                  />
                  <YAxis 
                    hide 
                    domain={['dataMin - 10', 'dataMax + 10']}
                  />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: '#111', 
                      border: '1px solid rgba(255,255,255,0.1)',
                      borderRadius: '12px',
                      fontSize: '10px'
                    }}
                    itemStyle={{ color: '#10b981' }}
                  />
                  <Area 
                    type="monotone" 
                    dataKey="score" 
                    stroke="#10b981" 
                    fillOpacity={1} 
                    fill="url(#colorScore)" 
                    strokeWidth={2}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-4 flex items-center justify-between text-[10px] font-mono text-white/20">
              <span>GENESIS</span>
              <span>LATEST TRADE</span>
            </div>
          </section>

          <section className="bg-white/5 border border-white/10 rounded-3xl p-8 overflow-hidden">
            <h2 className="text-sm font-mono text-emerald-500 uppercase tracking-widest mb-6 flex items-center gap-2">
              <MessageSquare className="w-4 h-4" />
              Live Negotiation Feed
            </h2>
            <div className="space-y-4 max-h-[500px] overflow-y-auto pr-2 custom-scrollbar">
              <AnimatePresence mode="popLayout">
                {state.logs.map((log) => (
                  <motion.div 
                    key={log.id}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    className="bg-black/40 rounded-2xl p-4 border border-white/5 relative group"
                  >
                    <div className="flex justify-between items-start mb-2">
                      <span className="text-[10px] font-bold text-emerald-500 uppercase tracking-tighter">{log.sender_name}</span>
                      <span className="text-[10px] text-white/20">{formatDistanceToNow(new Date(log.timestamp))} ago</span>
                    </div>
                    <p className="text-xs text-white/70 leading-relaxed italic">"{log.message}"</p>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          </section>
        </div>

        {/* Right Column: Trade Ledger */}
        <div className="col-span-12 lg:col-span-8 space-y-8">
          <section className="bg-white/5 border border-white/10 rounded-3xl p-8">
            <div className="flex items-center justify-between mb-8">
              <h2 className="text-sm font-mono text-emerald-500 uppercase tracking-widest flex items-center gap-2">
                <ArrowRightLeft className="w-4 h-4" />
                Trade Ledger
              </h2>
              <div className="flex gap-2">
                <span className="px-3 py-1 bg-emerald-500/10 text-emerald-500 text-[10px] font-bold rounded-full border border-emerald-500/20">
                  {state.trades.filter(t => t.status === 'PENDING').length} PENDING
                </span>
              </div>
            </div>

            <div className="space-y-4">
              <AnimatePresence mode="popLayout">
                {state.trades.map((trade) => (
                  <motion.div 
                    key={trade.id}
                    layout
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={cn(
                      "group relative bg-black/40 rounded-3xl p-6 border transition-all duration-300",
                      trade.status === 'PENDING' ? "border-white/10" : "border-emerald-500/20 opacity-60"
                    )}
                  >
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                      <div className="flex items-center gap-6">
                        <div className="text-center">
                          <p className="text-[10px] text-white/40 uppercase mb-1">Provider</p>
                          <p className="font-bold text-sm">{trade.from_name}</p>
                          <p className="text-xs text-emerald-500/70">{trade.from_res_name}</p>
                        </div>
                        <div className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center">
                          <ArrowRightLeft className="w-4 h-4 text-white/20" />
                        </div>
                        <div className="text-center">
                          <p className="text-[10px] text-white/40 uppercase mb-1">Receiver</p>
                          <p className="font-bold text-sm">{trade.to_name}</p>
                          <p className="text-xs text-emerald-500/70">{trade.to_res_name}</p>
                        </div>
                      </div>

                      <div className="flex items-center gap-8">
                        {trade.credits_exchanged !== 0 && (
                          <div className="text-right">
                            <p className="text-[10px] text-white/40 uppercase mb-1">Credits</p>
                            <p className={cn(
                              "text-xs font-mono font-bold",
                              trade.credits_exchanged > 0 ? "text-emerald-400" : "text-amber-400"
                            )}>
                              {trade.credits_exchanged > 0 ? `+${trade.credits_exchanged}` : trade.credits_exchanged} SC
                            </p>
                          </div>
                        )}

                        <div className="text-right">
                          <p className="text-[10px] text-white/40 uppercase mb-1">Eco Score</p>
                          <p className="text-xl font-mono font-bold text-emerald-400">{trade.sustainability_score.toFixed(1)}</p>
                        </div>

                        {trade.status === 'PENDING' ? (
                          <div className="flex gap-2">
                            <button 
                              onClick={() => handleTrade(trade.id, 'reject')}
                              className="p-3 bg-red-500/10 text-red-500 rounded-2xl hover:bg-red-500 hover:text-white transition-all border border-red-500/20"
                            >
                              <ShieldAlert className="w-5 h-5" />
                            </button>
                            <button 
                              onClick={() => handleTrade(trade.id, 'approve')}
                              className="p-3 bg-emerald-500/10 text-emerald-500 rounded-2xl hover:bg-emerald-500 hover:text-white transition-all border border-emerald-500/20"
                            >
                              <ShieldCheck className="w-5 h-5" />
                            </button>
                          </div>
                        ) : (
                          <div className="px-4 py-2 bg-emerald-500/20 text-emerald-500 rounded-xl text-[10px] font-bold border border-emerald-500/30 uppercase tracking-widest">
                            {trade.status}
                          </div>
                        )}
                      </div>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          </section>
        </div>
      </main>

      {/* Settings Modal */}
      <AnimatePresence>
        {showSettings && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
            <motion.div 
              initial={{ opacity: 0 }} 
              animate={{ opacity: 1 }} 
              exit={{ opacity: 0 }}
              onClick={() => setShowSettings(false)}
              className="absolute inset-0 bg-black/80 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative w-full max-w-lg bg-[#111] border border-white/10 rounded-[2.5rem] p-10 shadow-2xl"
            >
              <h2 className="text-2xl font-bold mb-2 flex items-center gap-3">
                <Settings className="w-6 h-6 text-emerald-500" />
                Algorithm Config
              </h2>
              <p className="text-white/40 text-sm mb-8">Adjust the environmental impact weight for all autonomous negotiations.</p>
              
              <div className="space-y-8">
                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <label className="text-[10px] font-bold text-white/40 uppercase tracking-widest">Carbon Penalty Factor</label>
                    <span className="text-emerald-500 font-mono font-bold">{carbonPenalty.toFixed(2)}</span>
                  </div>
                  <input 
                    type="range" 
                    min="0" 
                    max="2" 
                    step="0.05" 
                    value={carbonPenalty || 0}
                    onChange={(e) => updateConfig(parseFloat(e.target.value) || 0)}
                    className="w-full accent-emerald-500 h-1.5 bg-white/10 rounded-full appearance-none cursor-pointer"
                  />
                  <div className="flex justify-between text-[10px] text-white/20 font-mono">
                    <span>MIN IMPACT (0.0)</span>
                    <span>MAX IMPACT (2.0)</span>
                  </div>
                </div>

                <div className="bg-emerald-500/5 border border-emerald-500/10 rounded-2xl p-4">
                  <p className="text-xs text-emerald-500/80 leading-relaxed">
                    <Leaf className="w-4 h-4 inline mr-2 mb-1" />
                    Increasing this factor will prioritize local trades over long-distance ones, even if the item value is lower.
                  </p>
                </div>
              </div>

              <button 
                onClick={() => setShowSettings(false)}
                className="w-full bg-white/5 hover:bg-white/10 text-white font-bold py-4 rounded-2xl transition-all mt-10 border border-white/10"
              >
                CLOSE SETTINGS
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Inventory Modal */}
      <AnimatePresence>
        {showInventory && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
            <motion.div 
              initial={{ opacity: 0 }} 
              animate={{ opacity: 1 }} 
              exit={{ opacity: 0 }}
              onClick={() => setShowInventory(false)}
              className="absolute inset-0 bg-black/80 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative w-full max-w-2xl bg-[#111] border border-white/10 rounded-[2.5rem] p-10 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
            >
              <div className="flex items-center justify-between mb-8">
                <h2 className="text-2xl font-bold flex items-center gap-3">
                  <Package className="w-6 h-6 text-emerald-500" />
                  Inventory Manager
                </h2>
                <button onClick={() => setShowInventory(false)} className="text-white/20 hover:text-white transition-colors">
                  <Plus className="w-6 h-6 rotate-45" />
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-8 overflow-y-auto pr-2 custom-scrollbar">
                {/* Add Resource Form */}
                <div className="space-y-6">
                  <h3 className="text-xs font-bold text-emerald-500 uppercase tracking-widest">Add New Resource</h3>
                  <form onSubmit={addResource} className="space-y-4">
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold text-white/40 uppercase tracking-widest ml-1">Item Name</label>
                      <input 
                        type="text" 
                        value={newResName}
                        onChange={(e) => setNewResName(e.target.value)}
                        className="w-full bg-black/40 border border-white/10 rounded-2xl py-3 px-4 text-sm focus:outline-none focus:border-emerald-500/50 transition-colors"
                        placeholder="e.g. Organic Waste"
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold text-white/40 uppercase tracking-widest ml-1">Quantity</label>
                      <input 
                        type="text" 
                        value={newResQty}
                        onChange={(e) => setNewResQty(e.target.value)}
                        className="w-full bg-black/40 border border-white/10 rounded-2xl py-3 px-4 text-sm focus:outline-none focus:border-emerald-500/50 transition-colors"
                        placeholder="e.g. 20kg"
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold text-white/40 uppercase tracking-widest ml-1">Type</label>
                      <div className="flex gap-2">
                        <button 
                          type="button"
                          onClick={() => setNewResType('SURPLUS')}
                          className={cn(
                            "flex-1 py-3 rounded-2xl text-xs font-bold transition-all border",
                            newResType === 'SURPLUS' ? "bg-emerald-500 text-black border-emerald-500" : "bg-white/5 text-white/40 border-white/10"
                          )}
                        >
                          SURPLUS
                        </button>
                        <button 
                          type="button"
                          onClick={() => setNewResType('NEED')}
                          className={cn(
                            "flex-1 py-3 rounded-2xl text-xs font-bold transition-all border",
                            newResType === 'NEED' ? "bg-amber-500 text-black border-amber-500" : "bg-white/5 text-white/40 border-white/10"
                          )}
                        >
                          NEED
                        </button>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold text-white/40 uppercase tracking-widest ml-1">Estimated Value (SC)</label>
                      <input 
                        type="number" 
                        value={isNaN(newResValue) ? '' : newResValue}
                        onChange={(e) => setNewResValue(parseInt(e.target.value) || 0)}
                        className="w-full bg-black/40 border border-white/10 rounded-2xl py-3 px-4 text-sm focus:outline-none focus:border-emerald-500/50 transition-colors"
                        required
                      />
                    </div>
                    <button 
                      type="submit"
                      className="w-full bg-emerald-500 text-black font-bold py-4 rounded-2xl shadow-[0_0_20px_rgba(16,185,129,0.3)] hover:scale-[1.02] active:scale-[0.98] transition-all"
                    >
                      ADD TO INVENTORY
                    </button>
                  </form>
                </div>

                {/* Current Inventory List */}
                <div className="space-y-6">
                  <h3 className="text-xs font-bold text-emerald-500 uppercase tracking-widest">Current Inventory</h3>
                  <div className="space-y-3">
                    {myResources.length === 0 ? (
                      <p className="text-xs text-white/20 italic">No items in your inventory yet.</p>
                    ) : (
                      myResources.map(res => (
                        <div key={res.id} className="bg-white/5 border border-white/10 rounded-2xl p-4 flex items-center justify-between group">
                          <div>
                            <div className="flex items-center gap-2 mb-1">
                              <span className={cn(
                                "text-[8px] font-bold px-1.5 py-0.5 rounded-full",
                                res.type === 'SURPLUS' ? "bg-emerald-500/20 text-emerald-500" : "bg-amber-500/20 text-amber-500"
                              )}>
                                {res.type}
                              </span>
                              <p className="text-sm font-bold">{res.name}</p>
                            </div>
                            <p className="text-[10px] text-white/40">{res.quantity} • {res.value} SC</p>
                          </div>
                          <button 
                            onClick={() => deleteResource(res.id)}
                            className="p-2 text-white/20 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Profile Modal */}
      <AnimatePresence>
        {showProfile && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
            <motion.div 
              initial={{ opacity: 0 }} 
              animate={{ opacity: 1 }} 
              exit={{ opacity: 0 }}
              onClick={() => setShowProfile(false)}
              className="absolute inset-0 bg-black/80 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative w-full max-w-lg bg-[#111] border border-white/10 rounded-[2.5rem] p-10 shadow-2xl"
            >
              <h2 className="text-2xl font-bold mb-2 flex items-center gap-3">
                <Building className="w-6 h-6 text-emerald-500" />
                Business Profile
              </h2>
              <p className="text-white/40 text-sm mb-6">Manage your business identity on the Symbio network.</p>
              
              <div className="bg-emerald-500/5 border border-emerald-500/10 rounded-2xl p-4 mb-8 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-emerald-500/10 rounded-xl flex items-center justify-center">
                    <Wallet className="w-5 h-5 text-emerald-500" />
                  </div>
                  <div>
                    <p className="text-[10px] font-bold text-emerald-500/50 uppercase tracking-widest leading-none">Symbio Credits</p>
                    <p className="text-xl font-mono font-bold text-emerald-400 mt-1">{business?.wallet_balance?.toLocaleString() || '0'} SC</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-[10px] font-bold text-white/20 uppercase tracking-widest leading-none">Internal Currency</p>
                  <p className="text-[10px] text-white/40 mt-1">Used for balanced trades</p>
                </div>
              </div>

              <form onSubmit={updateProfile} className="space-y-6">
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-white/40 uppercase tracking-widest ml-1">Business Name</label>
                  <input 
                    type="text" 
                    value={business?.name || ''}
                    onChange={(e) => setBusiness(prev => prev ? { ...prev, name: e.target.value } : null)}
                    className="w-full bg-black/40 border border-white/10 rounded-2xl py-3 px-4 text-sm focus:outline-none focus:border-emerald-500/50 transition-colors"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-white/40 uppercase tracking-widest ml-1">Location</label>
                  <input 
                    type="text" 
                    value={business?.location || ''}
                    onChange={(e) => setBusiness(prev => prev ? { ...prev, location: e.target.value } : null)}
                    className="w-full bg-black/40 border border-white/10 rounded-2xl py-3 px-4 text-sm focus:outline-none focus:border-emerald-500/50 transition-colors"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-white/40 uppercase tracking-widest ml-1">Business Type</label>
                  <select 
                    value={business?.type || ''}
                    onChange={(e) => setBusiness(prev => prev ? { ...prev, type: e.target.value } : null)}
                    className="w-full bg-black/40 border border-white/10 rounded-2xl py-3 px-4 text-sm focus:outline-none focus:border-emerald-500/50 transition-colors appearance-none"
                  >
                    <option value="Retail">Retail</option>
                    <option value="Hotel">Hotel</option>
                    <option value="NGO">NGO</option>
                    <option value="Farm">Farm</option>
                    <option value="Kitchen">Kitchen</option>
                  </select>
                </div>

                <div className="flex gap-4 pt-4">
                  <button 
                    type="button"
                    onClick={() => setShowProfile(false)}
                    className="flex-1 bg-white/5 hover:bg-white/10 text-white font-bold py-4 rounded-2xl transition-all border border-white/10"
                  >
                    CANCEL
                  </button>
                  <button 
                    type="submit"
                    className="flex-1 bg-emerald-500 text-black font-bold py-4 rounded-2xl shadow-[0_0_20px_rgba(16,185,129,0.3)] hover:scale-[1.02] active:scale-[0.98] transition-all"
                  >
                    SAVE CHANGES
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <style>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: rgba(255, 255, 255, 0.1);
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: rgba(16, 185, 129, 0.3);
        }
      `}</style>
    </div>
  );
}
