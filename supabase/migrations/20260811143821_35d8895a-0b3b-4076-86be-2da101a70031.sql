DROP INDEX IF EXISTS public.idx_properties_address_trgm;
CREATE SCHEMA IF NOT EXISTS extensions;
ALTER EXTENSION pg_trgm SET SCHEMA extensions;
CREATE INDEX IF NOT EXISTS idx_properties_address_trgm ON public.properties USING gin (address extensions.gin_trgm_ops);
ANALYZE public.properties;