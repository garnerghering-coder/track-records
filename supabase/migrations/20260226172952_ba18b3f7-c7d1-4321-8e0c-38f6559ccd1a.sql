-- Move pg_trgm extension out of public schema (linter: Extension in Public)
-- Supabase/Lovable projects typically use the `extensions` schema for extensions.

ALTER EXTENSION pg_trgm SET SCHEMA extensions;
