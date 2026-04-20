
-- Robust Database Schema for WhatsApp CRM

-- 1. Departments Table
CREATE TABLE IF NOT EXISTS departments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL UNIQUE,
    sequence INTEGER DEFAULT 0,
    required_documents TEXT[] DEFAULT '{}', -- List of document types required (e.g. ['Contrato', 'Documento Foto'])
    created_at TIMESTAMPTZ DEFAULT now()
);

-- ... (Profiles, Customers, Tickets tables remain as is, but noted for relationships)

-- 8. Ticket Documents Table (For categorized file storage)
CREATE TABLE IF NOT EXISTS ticket_documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_id UUID NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
    customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    department_id UUID NOT NULL REFERENCES departments(id),
    name TEXT NOT NULL, -- Display Name (e.g. 'Contrato Assinado')
    file_url TEXT NOT NULL,
    file_type TEXT, -- 'pdf', 'image', etc
    uploaded_by UUID REFERENCES profiles(id),
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Index for fast lookup by customer or ticket
CREATE INDEX IF NOT EXISTS idx_doc_ticket ON ticket_documents(ticket_id);
CREATE INDEX IF NOT EXISTS idx_doc_customer ON ticket_documents(customer_id);

-- 2. Profiles Table (Linked to Auth.Users)
CREATE TABLE IF NOT EXISTS profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    role TEXT NOT NULL DEFAULT 'Colaborador', -- 'Super Admin', 'Admin', 'Colaborador'
    department_id UUID REFERENCES departments(id),
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- 3. Customers Table
CREATE TABLE IF NOT EXISTS customers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    phone TEXT NOT NULL UNIQUE,
    email TEXT,
    address TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- 4. Tickets Table
CREATE TABLE IF NOT EXISTS tickets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'Novo', -- 'Novo', 'Orçamento', 'Projeto', 'Produção', 'Instalação', 'Finalizado'
    department_id UUID REFERENCES departments(id),
    assigned_to UUID REFERENCES profiles(id),
    last_message TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- 5. Messages Table (WhatsApp interactions)
CREATE TABLE IF NOT EXISTS messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_id UUID NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
    text TEXT NOT NULL,
    sender TEXT NOT NULL, -- 'customer', 'agent'
    timestamp TIMESTAMPTZ DEFAULT now(),
    is_flagged BOOLEAN DEFAULT false,
    flagged_by TEXT, -- Optional: User Name
    flagged_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 6. Internal Messages Table (Team communication)
CREATE TABLE IF NOT EXISTS internal_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_id UUID NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
    text TEXT NOT NULL,
    sender_id UUID REFERENCES profiles(id),
    sender_name TEXT,
    department_name TEXT,
    quoted_message_id UUID REFERENCES messages(id),
    timestamp TIMESTAMPTZ DEFAULT now(),
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 7. Invitations Table (For adding team members)
CREATE TABLE IF NOT EXISTS invitations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT NOT NULL,
    role TEXT NOT NULL,
    department_id UUID REFERENCES departments(id),
    status TEXT NOT NULL DEFAULT 'Pendente', -- 'Pendente', 'Aceito', 'Expirado'
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Storage Buckets Configuration (Manual in dashboard, but documented here)
-- Bucket: chat-media (Public access recommended)
