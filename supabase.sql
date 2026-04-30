-- Supabase SQL Schema for CRM Zendesk-like App

-- Limpeza inicial (caso as tabelas já existam)
DROP TABLE IF EXISTS invitations CASCADE;
DROP TABLE IF EXISTS internal_messages CASCADE;
DROP TABLE IF EXISTS messages CASCADE;
DROP TABLE IF EXISTS tickets CASCADE;
DROP TABLE IF EXISTS customers CASCADE;
DROP TABLE IF EXISTS profiles CASCADE;
DROP TABLE IF EXISTS departments CASCADE;

-- 1. Departments Table
CREATE TABLE departments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  sequence INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Profiles (Users) Table - Extends Supabase Auth
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL CHECK (role IN ('Super Admin', 'Admin', 'Colaborador')),
  department_id UUID REFERENCES departments(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 3. Customers Table
CREATE TABLE customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  phone TEXT NOT NULL UNIQUE,
  email TEXT,
  address TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 4. Tickets Table
CREATE TABLE tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('Novo', 'Orçamento', 'Projeto', 'Produção', 'Instalação', 'Finalizado')),
  department_id UUID NOT NULL REFERENCES departments(id) ON DELETE RESTRICT,
  assigned_to UUID REFERENCES profiles(id) ON DELETE SET NULL,
  last_message TEXT,
  updated_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 5. Messages Table (Customer Chat)
CREATE TABLE messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  sender TEXT NOT NULL CHECK (sender IN ('customer', 'agent')),
  timestamp TIMESTAMPTZ DEFAULT now(),
  is_flagged BOOLEAN DEFAULT false,
  flagged_by TEXT, -- Name of the user who flagged
  flagged_at TIMESTAMPTZ
);

-- 6. Internal Messages Table (Team Chat)
CREATE TABLE internal_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  sender_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  sender_name TEXT NOT NULL,
  department_name TEXT,
  timestamp TIMESTAMPTZ DEFAULT now(),
  is_flagged BOOLEAN DEFAULT false,
  flagged_by TEXT, -- Name of the user who flagged
  flagged_at TIMESTAMPTZ,
  quoted_message_id UUID REFERENCES messages(id) ON DELETE SET NULL
);

-- 7. Invitations Table
CREATE TABLE invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('Super Admin', 'Admin', 'Colaborador')),
  department_id UUID NOT NULL REFERENCES departments(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'Pendente' CHECK (status IN ('Pendente', 'Aceito', 'Expirado')),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 8. Row Level Security (RLS) - Basic Setup
ALTER TABLE departments ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE internal_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE invitations ENABLE ROW LEVEL SECURITY;

-- Policies (Relaxed for testing - adjust for production)
CREATE POLICY "Allow all access" ON departments FOR ALL USING (true);
CREATE POLICY "Allow all access" ON profiles FOR ALL USING (true);
CREATE POLICY "Allow all access" ON customers FOR ALL USING (true);
CREATE POLICY "Allow all access" ON tickets FOR ALL USING (true);
CREATE POLICY "Allow all access" ON messages FOR ALL USING (true);
CREATE POLICY "Allow all access" ON internal_messages FOR ALL USING (true);
CREATE POLICY "Allow all access" ON invitations FOR ALL USING (true);

-- Initial Data
INSERT INTO departments (name, sequence) VALUES ('Vendas', 1), ('Projetos', 2), ('Produção', 3), ('Financeiro', 4), ('Pós-Venda', 5);
