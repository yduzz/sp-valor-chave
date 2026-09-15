CREATE TABLE IF NOT EXISTS public.itbi_imports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  year integer NOT NULL,
  source text NOT NULL DEFAULT 'prefeitura-sp',
  format text,
  url text,
  status text NOT NULL DEFAULT 'pending',
  started_at timestamptz,
  finished_at timestamptz,
  records_found integer NOT NULL DEFAULT 0,
  records_imported integer NOT NULL DEFAULT 0,
  records_rejected integer NOT NULL DEFAULT 0,
  error text,
  file_size bigint,
  file_hash text,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.itbi_imports TO anon;
GRANT SELECT ON public.itbi_imports TO authenticated;
GRANT ALL ON public.itbi_imports TO service_role;

ALTER TABLE public.itbi_imports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can view itbi imports" ON public.itbi_imports;
CREATE POLICY "Anyone can view itbi imports"
  ON public.itbi_imports FOR SELECT USING (true);

DROP POLICY IF EXISTS "Service role manages itbi imports" ON public.itbi_imports;
CREATE POLICY "Service role manages itbi imports"
  ON public.itbi_imports FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE UNIQUE INDEX IF NOT EXISTS itbi_imports_year_source_key ON public.itbi_imports (year, source);
CREATE INDEX IF NOT EXISTS itbi_imports_status_idx ON public.itbi_imports (status, year);

DROP TRIGGER IF EXISTS update_itbi_imports_updated_at ON public.itbi_imports;
CREATE TRIGGER update_itbi_imports_updated_at
  BEFORE UPDATE ON public.itbi_imports
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();