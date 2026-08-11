CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX IF NOT EXISTS idx_properties_address_trgm ON public.properties USING gin (address gin_trgm_ops);
ANALYZE public.properties;