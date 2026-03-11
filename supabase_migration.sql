-- Supabase Migration Script (PostgreSQL)

-- Customers table
CREATE TABLE IF NOT EXISTS customers (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  cpf_cnpj TEXT,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Vehicles table
CREATE TABLE IF NOT EXISTS vehicles (
  id SERIAL PRIMARY KEY,
  customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  plate TEXT NOT NULL,
  brand TEXT,
  model TEXT,
  year INTEGER,
  color TEXT
);

-- Services table
CREATE TABLE IF NOT EXISTS services (
  id SERIAL PRIMARY KEY,
  vehicle_id INTEGER NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  total_price DECIMAL(10, 2) DEFAULT 0,
  status TEXT DEFAULT 'pending',
  service_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Parts table
CREATE TABLE IF NOT EXISTS parts (
  id SERIAL PRIMARY KEY,
  service_id INTEGER NOT NULL REFERENCES services(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  quantity INTEGER DEFAULT 1,
  price DECIMAL(10, 2) DEFAULT 0
);

-- Accounts Payable table
CREATE TABLE IF NOT EXISTS accounts_payable (
  id SERIAL PRIMARY KEY,
  supplier TEXT NOT NULL,
  description TEXT,
  amount DECIMAL(10, 2) NOT NULL,
  due_date DATE NOT NULL,
  paid BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Users table
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL
);

-- Initial data (Optional, can be run manually)
-- INSERT INTO customers (name, phone, email) VALUES ('João Silva', '11988887777', 'joao@email.com');
-- INSERT INTO vehicles (customer_id, plate, brand, model, year, color) VALUES (1, 'ABC-1234', 'Toyota', 'Corolla', 2022, 'Prata');
-- INSERT INTO services (vehicle_id, description, total_price, status) VALUES (1, 'Carga de Gás e Troca de Filtro', 350.00, 'completed');
-- INSERT INTO accounts_payable (supplier, description, amount, due_date, paid) VALUES ('Distribuidora AC', 'Filtros de Cabine', 1200.00, '2026-03-01', false);
