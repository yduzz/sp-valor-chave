
CREATE TABLE public.market_indexes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source text NOT NULL,
  competence date NOT NULL,
  city text,
  neighborhood text,
  property_type text,
  avg_price_per_sqm numeric,
  monthly_variation numeric,
  yearly_variation numeric,
  metrics jsonb NOT NULL DEFAULT '{}'::jsonb,
  report_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX market_indexes_unique_key ON public.market_indexes (
  source, competence, coalesce(city,''), coalesce(neighborhood,''), coalesce(property_type,'')
);
CREATE INDEX market_indexes_source_competence_idx ON public.market_indexes (source, competence DESC);

CREATE TABLE public.market_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source text NOT NULL,
  competence date,
  title text,
  source_url text NOT NULL,
  file_type text,
  file_hash text,
  storage_path text,
  file_size bigint,
  parsed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX market_reports_url_unique ON public.market_reports (source_url);
CREATE UNIQUE INDEX market_reports_hash_unique ON public.market_reports (file_hash) WHERE file_hash IS NOT NULL;

CREATE TABLE public.market_update_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source text NOT NULL,
  status text NOT NULL,
  competence date,
  records_imported integer NOT NULL DEFAULT 0,
  duration_ms integer,
  message text,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  executed_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX market_update_logs_source_idx ON public.market_update_logs (source, executed_at DESC);

GRANT SELECT ON public.market_indexes TO anon, authenticated;
GRANT SELECT ON public.market_reports TO anon, authenticated;
GRANT SELECT ON public.market_update_logs TO anon, authenticated;
GRANT ALL ON public.market_indexes TO service_role;
GRANT ALL ON public.market_reports TO service_role;
GRANT ALL ON public.market_update_logs TO service_role;

ALTER TABLE public.market_indexes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.market_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.market_update_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view market indexes" ON public.market_indexes FOR SELECT USING (true);
CREATE POLICY "Service role manages market indexes" ON public.market_indexes FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Anyone can view market reports" ON public.market_reports FOR SELECT USING (true);
CREATE POLICY "Service role manages market reports" ON public.market_reports FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Anyone can view market update logs" ON public.market_update_logs FOR SELECT USING (true);
CREATE POLICY "Service role manages market update logs" ON public.market_update_logs FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE TRIGGER update_market_indexes_updated_at BEFORE UPDATE ON public.market_indexes
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_market_reports_updated_at BEFORE UPDATE ON public.market_reports
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
