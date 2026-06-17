-- Safe entrypoint for DCoratto CRM database setup.
--
-- The destructive legacy schema was removed from this file on purpose.
-- Use the full idempotent setup in supabase_schema.sql. It creates or updates
-- the required tables, policies, indexes, triggers, seed data, and storage
-- bucket without dropping existing data.

select 'Run the contents of supabase_schema.sql in the Supabase SQL editor.' as instruction;
