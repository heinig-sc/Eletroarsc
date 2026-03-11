import express from "express";
import "dotenv/config";
import path from "path";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";
import session from "express-session";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET || "eletroar-jwt-secret-2024";

type SupabaseConfig = {
  url: string;
  key: string;
  urlSource: string;
  keySource: string;
};

declare module "express-session" {
  interface SessionData {
    userId: number;
    username: string;
  }
}

declare global {
  namespace Express {
    interface Request {
      user?: {
        userId: number;
        username: string;
      };
    }
  }
}

let _filename: string;
let _dirname: string;

try {
  _filename = fileURLToPath(import.meta.url);
  _dirname = path.dirname(_filename);
} catch (e) {
  // @ts-ignore
  _filename = typeof __filename !== 'undefined' ? __filename : '';
  // @ts-ignore
  _dirname = typeof __dirname !== 'undefined' ? __dirname : '';
}

const __filename = _filename;
const __dirname = _dirname;

function deriveSupabaseUrlFromDatabaseUrl(databaseUrl: string): string {
  if (!databaseUrl) return "";
  try {
    const parsed = new URL(databaseUrl);
    const match = parsed.hostname.match(/^db\.([^.]+)\.supabase\.co$/);
    if (match) return `https://${match[1]}.supabase.co`;

    const directHostMatch = parsed.hostname.match(/^([^.]+)\.supabase\.co$/);
    if (directHostMatch) return `https://${directHostMatch[1]}.supabase.co`;

    // Supabase pooler URLs usually embed the project ref in the username: postgres.<project_ref>
    const userMatch = decodeURIComponent(parsed.username || "").match(/^[^.]+\.([a-zA-Z0-9_-]+)$/);
    if (userMatch) return `https://${userMatch[1]}.supabase.co`;

    return "";
  } catch {
    return "";
  }
}

function resolveSupabaseConfig(): SupabaseConfig {
  const urlCandidates: Array<[string, string]> = [
    ["SUPABASE_URL", process.env.SUPABASE_URL || ""],
    ["SUPABASE_PROJECT_URL", process.env.SUPABASE_PROJECT_URL || ""],
    ["NEXT_PUBLIC_SUPABASE_URL", process.env.NEXT_PUBLIC_SUPABASE_URL || ""],
    ["VITE_SUPABASE_URL", process.env.VITE_SUPABASE_URL || ""],
  ];

  const keyCandidates: Array<[string, string]> = [
    ["SUPABASE_SERVICE_ROLE_KEY", process.env.SUPABASE_SERVICE_ROLE_KEY || ""],
    ["SUPABASE_SERVICE_KEY", process.env.SUPABASE_SERVICE_KEY || ""],
    ["SUPABASE_KEY", process.env.SUPABASE_KEY || ""],
    ["SUPABASE_ANON_KEY", process.env.SUPABASE_ANON_KEY || ""],
  ];

  const dbUrl = process.env.SUPABASE_DATABASE_URL || process.env.DATABASE_URL || "";
  const derivedUrl = deriveSupabaseUrlFromDatabaseUrl(dbUrl);
  if (derivedUrl) {
    urlCandidates.push(["SUPABASE_DATABASE_URL (derived)", derivedUrl]);
  }

  const urlEntry = urlCandidates.find(([, value]) => value);
  const keyEntry = keyCandidates.find(([, value]) => value);

  return {
    url: urlEntry?.[1] || "",
    key: keyEntry?.[1] || "",
    urlSource: urlEntry?.[0] || "",
    keySource: keyEntry?.[0] || "",
  };
}

const { url: supabaseUrl, key: supabaseKey, urlSource, keySource } = resolveSupabaseConfig();

if (!supabaseUrl || !supabaseKey) {
  const missing: string[] = [];
  if (!supabaseUrl) {
    missing.push("SUPABASE_URL (ou SUPABASE_PROJECT_URL / VITE_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_URL)");
  }
  if (!supabaseKey) {
    missing.push("SUPABASE_SERVICE_ROLE_KEY (ou SUPABASE_SERVICE_KEY / SUPABASE_KEY / SUPABASE_ANON_KEY)");
  }
  
  console.error(`ERRO CRÍTICO: Variáveis de ambiente faltando: ${missing.join(" e ")}`);
  console.error("Por favor, configure estas variáveis no menu 'Settings' do AI Studio.");
  console.error("Inicialização do cliente Supabase ignorada.");
}

let supabase: any;
try {
  if (supabaseUrl && supabaseKey) {
    supabase = createClient(supabaseUrl, supabaseKey);
    console.log(`Cliente Supabase inicializado com sucesso (URL de ${urlSource}, chave de ${keySource}).`);
    
    // Ensure cpf_cnpj column exists (Supabase doesn't have a simple way to check columns via JS SDK without RPC, 
    // but we can try a dummy update or just assume the migration script was run. 
    // However, to be safe for existing databases, we can try to add it if it's missing via a raw query if we had one.
    // Since we don't have raw SQL access here easily, we'll just make sure the code is correct.)
  }
} catch (err) {
  console.error("FALHA FATAL: Erro ao inicializar o cliente Supabase:", err);
}

export async function createServer() {
  const app = express();
  const PORT = 3000;

  app.set("trust proxy", true);
  app.use(express.json());
  
  // Health check
  app.get("/health", async (req, res) => {
    try {
      if (!supabase) {
        return res.status(500).json({ 
          status: "error", 
          database: "disconnected", 
          message: "Cliente Supabase não inicializado. Configure SUPABASE_URL (ou alias suportado) e uma chave SUPABASE." 
        });
      }
      
      // Try to query users table
      const { data, error } = await supabase.from('users').select('count', { count: 'exact', head: true });
      
      if (error) {
        // Check if it's a "table not found" error
        if (error.code === 'PGRST116' || error.message?.includes('does not exist')) {
          return res.status(200).json({ 
            status: "ok", 
            database: "connected_no_tables", 
            message: "Conectado ao Supabase, mas a tabela 'users' não foi encontrada. Por favor, execute o script de migração." 
          });
        }
        throw error;
      }
      
      res.json({ status: "ok", database: "connected" });
    } catch (err: any) {
      console.error("Falha no health check:", err);
      res.status(500).json({ 
        status: "error", 
        database: "disconnected", 
        message: err.message || "Erro desconhecido ao conectar ao banco de dados" 
      });
    }
  });
  
  app.use(session({
    secret: process.env.SESSION_SECRET || "eletroar-secret-key-2024",
    resave: false,
    saveUninitialized: false,
    rolling: true,
    name: 'eletroar_sid',
    proxy: true,
    cookie: { 
      secure: true,
      sameSite: "none",
      maxAge: 7 * 24 * 60 * 60 * 1000,
      httpOnly: true,
      // @ts-ignore
      partitioned: true 
    }
  }));

  // Debug middleware
  app.use((req, res, next) => {
    const proto = req.get('x-forwarded-proto');
    const cookie = req.get('cookie');
    console.log(`[DEBUG] ${req.method} ${req.path} | Proto: ${proto} | SessionID: ${req.sessionID} | UserID: ${req.session.userId} | HasCookie: ${!!cookie}`);
    
    // Log Set-Cookie header
    const oldWriteHead = res.writeHead;
    res.writeHead = function(statusCode: number, ...args: any[]) {
      const setCookie = res.get('Set-Cookie');
      if (setCookie) {
        console.log(`[DEBUG] Sending Set-Cookie: ${setCookie}`);
      }
      return oldWriteHead.apply(this, [statusCode, ...args]);
    };
    
    next();
  });

  // Auth Middleware (JWT based)
  const isAuthenticated = (req: any, res: any, next: any) => {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.split(' ')[1];
      try {
        const decoded = jwt.verify(token, JWT_SECRET) as any;
        req.user = decoded;
        console.log(`[AUTH] Authorized JWT: ${decoded.userId} for ${req.path}`);
        return next();
      } catch (err) {
        console.warn(`[AUTH] Invalid JWT token for ${req.path}`);
      }
    }
    
    // Fallback to session for now (optional, but good for transition)
    if (req.session.userId) {
      console.log(`[AUTH] Authorized Session: ${req.session.userId} for ${req.path}`);
      return next();
    }

    console.warn(`[AUTH] Unauthorized access attempt to ${req.path}. SessionID: ${req.sessionID}`);
    res.status(401).json({ error: "Unauthorized" });
  };

  // Supabase check middleware
  const checkSupabase = (req: any, res: any, next: any) => {
    if (!supabase) {
      return res.status(503).json({ error: "Serviço de banco de dados não configurado. Configure SUPABASE_URL (ou SUPABASE_PROJECT_URL/VITE_SUPABASE_URL) e SUPABASE_SERVICE_ROLE_KEY." });
    }
    next();
  };

  // API Routes
  app.use("/api", checkSupabase);

  const validatePlate = (plate: string) => {
    if (!plate) return false;
    const cleanPlate = plate.replace(/[^A-Z0-9]/gi, '').toUpperCase();
    const oldFormat = /^[A-Z]{3}[0-9]{4}$/;
    const mercosulFormat = /^[A-Z]{3}[0-9][A-Z][0-9]{2}$/;
    return oldFormat.test(cleanPlate) || mercosulFormat.test(cleanPlate);
  };
  
  // Auth Routes
  app.post("/api/auth/login", async (req, res) => {
    const { username, password } = req.body;
    console.log(`Login attempt for user: ${username}`);
    
    try {
      if (!supabase) {
        console.error("Login failed: Supabase client not initialized");
        return res.status(503).json({ error: "Banco de dados não disponível" });
      }

      const { data: user, error } = await supabase
        .from('users')
        .select('*')
        .eq('username', username)
        .single();
        
      if (error || !user) {
        console.warn(`Login failed: User ${username} not found or error:`, error);
        return res.status(401).json({ error: "Usuário ou senha inválidos" });
      }
      
      const isValid = await bcrypt.compare(password, user.password);
      if (!isValid) {
        console.warn(`Login failed: Invalid password for user ${username}`);
        return res.status(401).json({ error: "Usuário ou senha inválidos" });
      }
      
      req.session.userId = user.id;
      req.session.username = user.username;
      
      const token = jwt.sign(
        { userId: user.id, username: user.username },
        JWT_SECRET,
        { expiresIn: '7d' }
      );

      req.session.save((err) => {
        if (err) {
          console.error("Session save error during login:", err);
          return res.status(500).json({ error: "Erro ao salvar sessão" });
        }
        console.log(`Login successful for user: ${username}, SessionID: ${req.sessionID}`);
        res.json({ 
          success: true, 
          token,
          user: { id: user.id, username: user.username } 
        });
      });
    } catch (err) {
      console.error("Login exception:", err);
      res.status(500).json({ error: "Erro interno no servidor" });
    }
  });

  app.get("/api/auth/test", (req, res) => {
    res.json({ 
      sessionID: req.sessionID, 
      userId: req.session.userId,
      cookie: req.session.cookie,
      headers: req.headers,
      ip: req.ip,
      ips: req.ips,
      protocol: req.protocol,
      secure: req.secure,
      xhr: req.xhr
    });
  });

  app.post("/api/auth/logout", (req, res) => {
    req.session.destroy((err) => {
      if (err) return res.status(500).json({ error: "Erro ao sair" });
      res.json({ success: true });
    });
  });

  app.get("/api/auth/me", (req: any, res) => {
    // Check JWT first
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.split(' ')[1];
      try {
        const decoded = jwt.verify(token, JWT_SECRET) as any;
        return res.json({ authenticated: true, user: { id: decoded.userId, username: decoded.username } });
      } catch (err) {}
    }

    // Fallback to session
    if (req.session.userId) {
      res.json({ authenticated: true, user: { id: req.session.userId, username: req.session.username } });
    } else {
      res.json({ authenticated: false });
    }
  });

  // Registration route
  app.post("/api/auth/register", async (req, res) => {
    const { username, password } = req.body;
    
    if (!username || !password) {
      return res.status(400).json({ error: "Usuário e senha são obrigatórios" });
    }

    // Check if user already exists
    const { data: existingUser } = await supabase
      .from('users')
      .select('id')
      .eq('username', username)
      .single();

    if (existingUser) {
      return res.status(400).json({ error: "Este usuário já existe" });
    }
    
    const hashedPassword = await bcrypt.hash(password, 10);
    const { data, error } = await supabase
      .from('users')
      .insert([{ username, password: hashedPassword }])
      .select()
      .single();
      
    if (error) return res.status(500).json({ error: error.message });
    res.json({ success: true, message: "Usuário criado com sucesso" });
  });

  // List all users
  app.get("/api/users", isAuthenticated, async (req, res) => {
    const { data, error } = await supabase
      .from('users')
      .select('id, username')
      .order('username');
      
    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
  });

  // Delete user
  app.delete("/api/users/:id", isAuthenticated, async (req, res) => {
    const { id } = req.params;
    
    // Don't allow deleting yourself
    if (parseInt(id) === req.user?.userId || parseInt(id) === req.session.userId) {
      return res.status(400).json({ error: "Você não pode excluir seu próprio usuário" });
    }

    const { error } = await supabase
      .from('users')
      .delete()
      .eq('id', id);
      
    if (error) return res.status(500).json({ error: error.message });
    res.json({ success: true });
  });

  // Protect all other API routes
  app.use("/api", (req, res, next) => {
    if (req.path.startsWith("/auth/")) return next();
    isAuthenticated(req, res, next);
  });

  // Search Customers/Vehicles
  app.get("/api/search", async (req, res) => {
    const q = req.query.q as string;
    if (!q || q.trim().length === 0) return res.json([]);
    const searchTerm = `%${q.trim()}%`;
    
    try {
      // 1. Search by customer name or phone
      const { data: customersData, error: customersError } = await supabase
        .from('customers')
        .select(`
          id, name, phone, cpf_cnpj,
          vehicles (
            id, plate, brand, model, year, color
          )
        `)
        .or(`name.ilike.${searchTerm},phone.ilike.${searchTerm},cpf_cnpj.ilike.${searchTerm}`);

      if (customersError) throw customersError;

      // 2. Search by vehicle plate, brand or model
      const { data: vehiclesData, error: vehiclesError } = await supabase
        .from('vehicles')
        .select(`
          id, plate, brand, model, year, color,
          customers (
            id, name, phone, cpf_cnpj
          )
        `)
        .or(`plate.ilike.${searchTerm},brand.ilike.${searchTerm},model.ilike.${searchTerm}`);

      if (vehiclesError) throw vehiclesError;

      const resultsMap = new Map();

      // Process customer matches
      customersData?.forEach((customer: any) => {
        if (!customer.vehicles || customer.vehicles.length === 0) {
          const key = `c-${customer.id}`;
          resultsMap.set(key, {
            customer_id: customer.id,
            name: customer.name,
            phone: customer.phone,
            cpf_cnpj: customer.cpf_cnpj,
            vehicle_id: null,
            plate: 'Sem Veículo',
            brand: '-',
            model: '-',
            year: null,
            color: '-'
          });
        } else {
          customer.vehicles.forEach((v: any) => {
            const key = `v-${v.id}`;
            resultsMap.set(key, {
              customer_id: customer.id,
              name: customer.name,
              phone: customer.phone,
              cpf_cnpj: customer.cpf_cnpj,
              vehicle_id: v.id,
              plate: v.plate,
              brand: v.brand,
              model: v.model,
              year: v.year,
              color: v.color
            });
          });
        }
      });

      // Process vehicle matches (might overlap, Map handles deduplication by key)
      vehiclesData?.forEach((v: any) => {
        const key = `v-${v.id}`;
        if (!resultsMap.has(key)) {
          resultsMap.set(key, {
            customer_id: v.customers.id,
            name: v.customers.name,
            phone: v.customers.phone,
            cpf_cnpj: v.customers.cpf_cnpj,
            vehicle_id: v.id,
            plate: v.plate,
            brand: v.brand,
            model: v.model,
            year: v.year,
            color: v.color
          });
        }
      });

      res.json(Array.from(resultsMap.values()));
    } catch (error: any) {
      console.error("Search error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // List all customers
  app.get("/api/customers", async (req, res) => {
    const { data, error } = await supabase
      .from('customers')
      .select(`
        *,
        vehicles (id)
      `)
      .order('name', { ascending: true });
    
    if (error) return res.status(500).json({ error: error.message });
    
    const results = data.map(c => ({
      ...c,
      vehicle_count: c.vehicles.length
    }));
    
    res.json(results);
  });

  // List all services (OS)
  app.get("/api/services", async (req, res) => {
    const { start, end } = req.query;
    let query = supabase
      .from('services')
      .select(`
        *,
        vehicles (
          plate, model,
          customers (name)
        )
      `);

    if (start) query = query.gte('service_date', start);
    if (end) query = query.lte('service_date', `${end}T23:59:59`);

    const { data, error } = await query.order('service_date', { ascending: false });
    
    if (error) return res.status(500).json({ error: error.message });
    
    const results = data.map(s => ({
      ...s,
      customer_name: s.vehicles?.customers?.name || 'N/A',
      plate: s.vehicles?.plate || 'N/A',
      model: s.vehicles?.model || 'N/A'
    }));
    
    res.json(results);
  });

  app.patch("/api/services/:id/toggle-status", async (req, res) => {
    const { id } = req.params;
    
    const { data: service, error: fetchError } = await supabase
      .from('services')
      .select('status')
      .eq('id', id)
      .single();
      
    if (fetchError) return res.status(404).json({ error: "Service not found" });
    
    const newStatus = service.status === 'completed' ? 'pending' : 'completed';
    const { error: updateError } = await supabase
      .from('services')
      .update({ status: newStatus })
      .eq('id', id);
      
    if (updateError) return res.status(500).json({ error: updateError.message });
    
    res.json({ success: true, status: newStatus });
  });

  // Get Customer History
  app.get("/api/customers/:id/history", async (req, res) => {
    const { data, error } = await supabase
      .from('services')
      .select(`
        *,
        vehicles!inner (plate, model)
      `)
      .eq('vehicles.customer_id', req.params.id)
      .order('service_date', { ascending: false });
      
    if (error) return res.status(500).json({ error: error.message });
    
    const results = data.map(s => ({
      ...s,
      plate: s.vehicles.plate,
      model: s.vehicles.model
    }));
    
    res.json(results);
  });

  // CRUD for Customers
  app.get("/api/customers/:id", async (req, res) => {
    const { id } = req.params;
    const { data, error } = await supabase
      .from('customers')
      .select('*')
      .eq('id', id)
      .single();
    
    if (error) return res.status(404).json({ error: "Cliente não encontrado" });
    res.json(data);
  });

  app.post("/api/customers", async (req, res) => {
    const { name, phone, email, cpf_cnpj, vehicle } = req.body;
    
    const { data: customer, error: customerError } = await supabase
      .from('customers')
      .insert([{ name, phone, email, cpf_cnpj }])
      .select()
      .single();
      
    if (customerError) return res.status(500).json({ error: customerError.message });

    let vehicleId = null;
    if (vehicle) {
      if (!validatePlate(vehicle.plate)) {
        return res.status(400).json({ error: "Placa inválida. Use o formato AAA-0000 ou Mercosul (AAA0A00)." });
      }

      const { data: vData, error: vehicleError } = await supabase
        .from('vehicles')
        .insert([{
          customer_id: customer.id,
          plate: vehicle.plate,
          brand: vehicle.brand,
          model: vehicle.model,
          year: vehicle.year,
          color: vehicle.color
        }])
        .select()
        .single();
      if (vehicleError) console.error("Error creating vehicle:", vehicleError);
      vehicleId = vData?.id;
    }

    res.json({ id: customer.id, vehicle_id: vehicleId });
  });

  app.put("/api/customers/:id", async (req, res) => {
    const { id } = req.params;
    const { name, phone, email, cpf_cnpj } = req.body;
    const { error } = await supabase
      .from('customers')
      .update({ name, phone, email, cpf_cnpj })
      .eq('id', id);
      
    if (error) return res.status(500).json({ error: error.message });
    res.json({ success: true });
  });

  app.delete("/api/customers/:id", async (req, res) => {
    const { id } = req.params;
    const { error } = await supabase
      .from('customers')
      .delete()
      .eq('id', id);
      
    if (error) return res.status(500).json({ error: error.message });
    res.json({ success: true });
  });

  // Vehicles CRUD
  app.get("/api/customers/:id/vehicles", async (req, res) => {
    const { data, error } = await supabase
      .from('vehicles')
      .select('*')
      .eq('customer_id', req.params.id);
      
    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
  });

  app.post("/api/vehicles", async (req, res) => {
    const { customer_id, plate, brand, model, year, color } = req.body;
    
    if (!validatePlate(plate)) {
      return res.status(400).json({ error: "Placa inválida. Use o formato AAA-0000 ou Mercosul (AAA0A00)." });
    }

    const { data, error } = await supabase
      .from('vehicles')
      .insert([{ customer_id, plate, brand, model, year, color }])
      .select()
      .single();
      
    if (error) return res.status(500).json({ error: error.message });
    res.json({ id: data.id });
  });

  app.put("/api/vehicles/:id", async (req, res) => {
    const { id } = req.params;
    const { plate, brand, model, year, color } = req.body;
    
    if (!validatePlate(plate)) {
      return res.status(400).json({ error: "Placa inválida. Use o formato AAA-0000 ou Mercosul (AAA0A00)." });
    }

    const { error } = await supabase
      .from('vehicles')
      .update({ plate, brand, model, year, color })
      .eq('id', id);
      
    if (error) return res.status(500).json({ error: error.message });
    res.json({ success: true });
  });

  app.delete("/api/vehicles/:id", async (req, res) => {
    const { id } = req.params;
    const { error } = await supabase
      .from('vehicles')
      .delete()
      .eq('id', id);
      
    if (error) return res.status(500).json({ error: error.message });
    res.json({ success: true });
  });

  // CRUD for Services
  app.post("/api/services", async (req, res) => {
    const { vehicle_id, description, total_price, parts } = req.body;
    
    const { data: service, error: serviceError } = await supabase
      .from('services')
      .insert([{ vehicle_id, description, total_price }])
      .select()
      .single();
      
    if (serviceError) return res.status(500).json({ error: serviceError.message });

    if (parts && Array.isArray(parts)) {
      const partsToInsert = parts.map(p => ({
        service_id: service.id,
        name: p.name,
        quantity: p.quantity,
        price: p.price
      }));
      const { error: partsError } = await supabase
        .from('parts')
        .insert(partsToInsert);
      if (partsError) console.error("Error creating parts:", partsError);
    }

    res.json({ id: service.id });
  });

  app.get("/api/services/:id", async (req, res) => {
    const { id } = req.params;
    const { data: service, error: serviceError } = await supabase
      .from('services')
      .select(`
        *,
        vehicles (
          plate, model,
          customers (name)
        )
      `)
      .eq('id', id)
      .single();
    
    if (serviceError) return res.status(404).json({ error: "Service not found" });
    
    const { data: parts, error: partsError } = await supabase
      .from('parts')
      .select('*')
      .eq('service_id', id);
      
    if (partsError) return res.status(500).json({ error: partsError.message });
    
    res.json({ 
      ...service, 
      customer_name: service.vehicles?.customers?.name || 'N/A',
      plate: service.vehicles?.plate || 'N/A',
      model: service.vehicles?.model || 'N/A',
      parts 
    });
  });

  app.put("/api/services/:id", async (req, res) => {
    const { id } = req.params;
    const { description, total_price, parts } = req.body;
    
    const { error: serviceError } = await supabase
      .from('services')
      .update({ description, total_price })
      .eq('id', id);
      
    if (serviceError) return res.status(500).json({ error: serviceError.message });
    
    if (parts && Array.isArray(parts)) {
      // Delete existing parts
      await supabase.from('parts').delete().eq('service_id', id);
      
      const partsToInsert = parts.map(p => ({
        service_id: id,
        name: p.name,
        quantity: p.quantity,
        price: p.price
      }));
      const { error: partsError } = await supabase
        .from('parts')
        .insert(partsToInsert);
      if (partsError) console.error("Error updating parts:", partsError);
    }
    
    res.json({ success: true });
  });

  app.delete("/api/services/:id", async (req, res) => {
    const { id } = req.params;
    const { error } = await supabase
      .from('services')
      .delete()
      .eq('id', id);
      
    if (error) return res.status(500).json({ error: error.message });
    res.json({ success: true });
  });

  // Accounts Payable
  app.get("/api/accounts-payable", async (req, res) => {
    const { start, end, supplier } = req.query;
    let query = supabase.from('accounts_payable').select('*');

    if (start) query = query.gte('due_date', start);
    if (end) query = query.lte('due_date', end);
    if (supplier) query = query.ilike('supplier', `%${supplier}%`);

    const { data, error } = await query.order('due_date', { ascending: true });
    
    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
  });

  app.patch("/api/accounts-payable/:id/toggle-paid", async (req, res) => {
    const { id } = req.params;
    
    const { data: payable, error: fetchError } = await supabase
      .from('accounts_payable')
      .select('paid')
      .eq('id', id)
      .single();
      
    if (fetchError) return res.status(404).json({ error: "Payable not found" });
    
    const { error: updateError } = await supabase
      .from('accounts_payable')
      .update({ paid: !payable.paid })
      .eq('id', id);
      
    if (updateError) return res.status(500).json({ error: updateError.message });
    
    res.json({ success: true });
  });

  app.post("/api/accounts-payable", async (req, res) => {
    const { supplier, description, amount, due_date } = req.body;
    const { data, error } = await supabase
      .from('accounts_payable')
      .insert([{ supplier, description, amount, due_date }])
      .select()
      .single();
      
    if (error) return res.status(500).json({ error: error.message });
    res.json({ id: data.id });
  });

  app.put("/api/accounts-payable/:id", async (req, res) => {
    const { id } = req.params;
    const { supplier, description, amount, due_date, paid } = req.body;
    const { error } = await supabase
      .from('accounts_payable')
      .update({ supplier, description, amount, due_date, paid })
      .eq('id', id);
      
    if (error) return res.status(500).json({ error: error.message });
    res.json({ success: true });
  });

  app.delete("/api/accounts-payable/:id", async (req, res) => {
    const { id } = req.params;
    const { error } = await supabase
      .from('accounts_payable')
      .delete()
      .eq('id', id);
      
    if (error) return res.status(500).json({ error: error.message });
    res.json({ success: true });
  });

  // Reports
  app.get("/api/reports/services", async (req, res) => {
    const { start, end } = req.query;
    
    let query = supabase
      .from('services')
      .select(`
        *,
        vehicles (
          plate,
          customers (name)
        )
      `);

    if (start) query = query.gte('service_date', start);
    if (end) query = query.lte('service_date', `${end}T23:59:59`);
      
    const { data, error } = await query.order('service_date', { ascending: false });
      
    if (error) return res.status(500).json({ error: error.message });
    
    const results = data.map(s => ({
      ...s,
      total_price: Number(s.total_price || 0),
      customer_name: s.vehicles?.customers?.name || 'N/A',
      plate: s.vehicles?.plate || 'N/A'
    }));
    
    res.json(results);
  });

  // Global error handler
  app.use((err: any, req: any, res: any, next: any) => {
    console.error("Unhandled error:", err);
    res.status(500).json({ error: "Internal Server Error", message: err.message });
  });

  // Vite middleware for development (skip in Vercel API)
  if (process.env.NODE_ENV !== "production" && !process.env.VERCEL && !process.env.NETLIFY) {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else if (!process.env.VERCEL && !process.env.NETLIFY) {
    // Only serve static files if NOT on Vercel (Vercel handles static itself)
    app.use(express.static(path.join(__dirname, "dist")));
    app.get("*", (req, res) => {
      res.sendFile(path.join(__dirname, "dist", "index.html"));
    });
  }

  return app;
}

// Start the server
console.log("Iniciando processo de inicialização do servidor...");

createServer().then(app => {
  const PORT = Number(process.env.PORT) || 3000;
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`[SERVER] Servidor rodando em http://0.0.0.0:${PORT}`);
    console.log(`[SERVER] Ambiente: ${process.env.NODE_ENV || 'development'}`);
  });
}).catch(err => {
  console.error("[FATAL] Falha ao iniciar o servidor:", err);
  process.exit(1);
});
