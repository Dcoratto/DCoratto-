-- Robust persistent schema for DCoratto CRM.
-- Run this in the Supabase SQL editor. It is designed to be additive and safe
-- for an existing installation: it creates missing structures without dropping data.

create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.departments (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  sequence integer not null default 0,
  required_documents text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null,
  email text not null unique,
  role text not null default 'Colaborador' check (role in ('Super Admin', 'Admin', 'Colaborador')),
  department_id uuid references public.departments(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text not null unique,
  email text,
  address text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.tickets (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id) on delete cascade,
  title text not null,
  status text not null default 'Novo' check (status in ('Novo', 'Orcamento', 'Orçamento', 'Projeto', 'Producao', 'Produção', 'Instalacao', 'Instalação', 'Finalizado')),
  department_id uuid references public.departments(id) on delete restrict,
  assigned_to uuid references public.profiles(id) on delete set null,
  last_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.tickets(id) on delete cascade,
  text text not null default '',
  sender text not null check (sender in ('customer', 'agent')),
  message_type text not null default 'text' check (message_type in ('text', 'audio', 'image', 'video', 'document', 'file', 'system')),
  media_url text,
  media_mime_type text,
  media_file_name text,
  media_size bigint,
  whatsapp_message_id text,
  timestamp timestamptz not null default now(),
  is_flagged boolean not null default false,
  flagged_by text,
  flagged_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.internal_messages (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.tickets(id) on delete cascade,
  text text not null default '',
  sender_id uuid references public.profiles(id) on delete set null,
  sender_name text not null default 'Sistema',
  department_name text,
  timestamp timestamptz not null default now(),
  is_flagged boolean not null default false,
  flagged_by text,
  flagged_at timestamptz,
  quoted_message_id uuid references public.messages(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.message_attachments (
  id uuid primary key default gen_random_uuid(),
  message_id uuid references public.messages(id) on delete cascade,
  internal_message_id uuid references public.internal_messages(id) on delete cascade,
  ticket_id uuid not null references public.tickets(id) on delete cascade,
  customer_id uuid references public.customers(id) on delete set null,
  bucket text not null default 'chat-media',
  storage_path text not null,
  public_url text not null,
  file_name text not null,
  original_name text,
  mime_type text,
  file_size bigint,
  attachment_type text not null check (attachment_type in ('audio', 'image', 'video', 'document', 'file')),
  uploaded_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint message_attachments_owner_check check (
    message_id is not null or internal_message_id is not null
  )
);

create table if not exists public.ticket_documents (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.tickets(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete cascade,
  department_id uuid references public.departments(id) on delete set null,
  name text not null,
  file_url text not null,
  file_type text,
  storage_path text,
  bucket text not null default 'chat-media',
  uploaded_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.invitations (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  role text not null check (role in ('Super Admin', 'Admin', 'Colaborador')),
  department_id uuid references public.departments(id) on delete cascade,
  status text not null default 'Pendente' check (status in ('Pendente', 'Aceito', 'Expirado')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.company_settings (
  id text primary key default 'default' check (id = 'default'),
  company_name text not null default 'DCoratto',
  company_email text,
  company_phone text,
  company_address text,
  logo_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.system_settings (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.activity_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.profiles(id) on delete set null,
  actor_name text not null default 'Sistema',
  actor_email text,
  action text not null,
  entity_type text,
  entity_id text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.departments add column if not exists required_documents text[] not null default '{}';
alter table public.departments add column if not exists updated_at timestamptz not null default now();
alter table public.profiles add column if not exists updated_at timestamptz not null default now();
alter table public.customers add column if not exists updated_at timestamptz not null default now();
alter table public.tickets add column if not exists updated_at timestamptz not null default now();
alter table public.messages add column if not exists message_type text not null default 'text';
alter table public.messages add column if not exists media_url text;
alter table public.messages add column if not exists media_mime_type text;
alter table public.messages add column if not exists media_file_name text;
alter table public.messages add column if not exists media_size bigint;
alter table public.messages add column if not exists whatsapp_message_id text;
alter table public.messages add column if not exists updated_at timestamptz not null default now();
alter table public.internal_messages alter column sender_id drop not null;
alter table public.internal_messages add column if not exists updated_at timestamptz not null default now();
alter table public.ticket_documents add column if not exists storage_path text;
alter table public.ticket_documents add column if not exists bucket text not null default 'chat-media';
alter table public.ticket_documents add column if not exists updated_at timestamptz not null default now();
alter table public.invitations add column if not exists updated_at timestamptz not null default now();
alter table public.company_settings add column if not exists company_email text;
alter table public.company_settings add column if not exists company_phone text;
alter table public.company_settings add column if not exists company_address text;
alter table public.company_settings add column if not exists logo_url text;
alter table public.company_settings add column if not exists updated_at timestamptz not null default now();
alter table public.system_settings add column if not exists updated_by uuid references public.profiles(id) on delete set null;
alter table public.system_settings add column if not exists updated_at timestamptz not null default now();
alter table public.activity_logs add column if not exists actor_email text;
alter table public.activity_logs add column if not exists entity_type text;
alter table public.activity_logs add column if not exists entity_id text;
alter table public.activity_logs add column if not exists details jsonb not null default '{}'::jsonb;

create index if not exists idx_customers_phone on public.customers(phone);
create index if not exists idx_tickets_customer_status on public.tickets(customer_id, status);
create index if not exists idx_tickets_department_updated on public.tickets(department_id, updated_at desc);
create index if not exists idx_messages_ticket_timestamp on public.messages(ticket_id, timestamp);
create unique index if not exists idx_messages_whatsapp_message_id on public.messages(whatsapp_message_id) where whatsapp_message_id is not null;
create index if not exists idx_internal_messages_ticket_timestamp on public.internal_messages(ticket_id, timestamp);
create index if not exists idx_message_attachments_message on public.message_attachments(message_id);
create index if not exists idx_message_attachments_internal on public.message_attachments(internal_message_id);
create index if not exists idx_message_attachments_ticket on public.message_attachments(ticket_id);
create index if not exists idx_ticket_documents_ticket on public.ticket_documents(ticket_id);
create index if not exists idx_ticket_documents_customer on public.ticket_documents(customer_id);
create index if not exists idx_activity_logs_created_at on public.activity_logs(created_at desc);
create index if not exists idx_activity_logs_actor on public.activity_logs(actor_id, created_at desc);

drop trigger if exists set_departments_updated_at on public.departments;
create trigger set_departments_updated_at before update on public.departments for each row execute function public.set_updated_at();
drop trigger if exists set_profiles_updated_at on public.profiles;
create trigger set_profiles_updated_at before update on public.profiles for each row execute function public.set_updated_at();
drop trigger if exists set_customers_updated_at on public.customers;
create trigger set_customers_updated_at before update on public.customers for each row execute function public.set_updated_at();
drop trigger if exists set_tickets_updated_at on public.tickets;
create trigger set_tickets_updated_at before update on public.tickets for each row execute function public.set_updated_at();
drop trigger if exists set_messages_updated_at on public.messages;
create trigger set_messages_updated_at before update on public.messages for each row execute function public.set_updated_at();
drop trigger if exists set_internal_messages_updated_at on public.internal_messages;
create trigger set_internal_messages_updated_at before update on public.internal_messages for each row execute function public.set_updated_at();
drop trigger if exists set_ticket_documents_updated_at on public.ticket_documents;
create trigger set_ticket_documents_updated_at before update on public.ticket_documents for each row execute function public.set_updated_at();
drop trigger if exists set_invitations_updated_at on public.invitations;
create trigger set_invitations_updated_at before update on public.invitations for each row execute function public.set_updated_at();
drop trigger if exists set_company_settings_updated_at on public.company_settings;
create trigger set_company_settings_updated_at before update on public.company_settings for each row execute function public.set_updated_at();
drop trigger if exists set_system_settings_updated_at on public.system_settings;
create trigger set_system_settings_updated_at before update on public.system_settings for each row execute function public.set_updated_at();

alter table public.departments enable row level security;
alter table public.profiles enable row level security;
alter table public.customers enable row level security;
alter table public.tickets enable row level security;
alter table public.messages enable row level security;
alter table public.internal_messages enable row level security;
alter table public.message_attachments enable row level security;
alter table public.ticket_documents enable row level security;
alter table public.invitations enable row level security;
alter table public.company_settings enable row level security;
alter table public.system_settings enable row level security;
alter table public.activity_logs enable row level security;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'departments',
    'profiles',
    'customers',
    'tickets',
    'messages',
    'internal_messages',
    'message_attachments',
    'ticket_documents',
    'invitations',
    'company_settings',
    'system_settings',
    'activity_logs'
  ]
  loop
    execute format('drop policy if exists "Authenticated full access" on public.%I', table_name);
    execute format(
      'create policy "Authenticated full access" on public.%I for all to authenticated using (true) with check (true)',
      table_name
    );
  end loop;
end;
$$;

insert into public.departments (name, sequence)
values
  ('Comercial', 1),
  ('Financeiro', 2),
  ('Liberação', 3),
  ('Logística', 4),
  ('Montagem', 5),
  ('Sucesso do Cliente', 6)
on conflict (name) do nothing;

insert into public.company_settings (id, company_name, logo_url)
values ('default', 'DCoratto', '/brand/dcoratto-logo.svg')
on conflict (id) do update
set
  company_name = coalesce(public.company_settings.company_name, excluded.company_name),
  logo_url = coalesce(public.company_settings.logo_url, excluded.logo_url);

insert into public.system_settings (key, value)
values
  ('auth.primary_admin', '{"email":"dcorattoinovacao@gmail.com","role":"Super Admin"}'::jsonb),
  ('storage.chat_media_bucket', '{"bucket":"chat-media","public":true}'::jsonb)
on conflict (key) do update
set value = public.system_settings.value || excluded.value;

insert into storage.buckets (id, name, public)
values ('chat-media', 'chat-media', true)
on conflict (id) do update set public = excluded.public;

drop policy if exists "Authenticated chat-media read" on storage.objects;
create policy "Authenticated chat-media read"
on storage.objects for select to authenticated
using (bucket_id = 'chat-media');

drop policy if exists "Authenticated chat-media write" on storage.objects;
create policy "Authenticated chat-media write"
on storage.objects for insert to authenticated
with check (bucket_id = 'chat-media');

drop policy if exists "Authenticated chat-media update" on storage.objects;
create policy "Authenticated chat-media update"
on storage.objects for update to authenticated
using (bucket_id = 'chat-media')
with check (bucket_id = 'chat-media');
