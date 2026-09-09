ALTER TABLE public.properties ADD COLUMN IF NOT EXISTS import_id uuid;

CREATE INDEX IF NOT EXISTS properties_year_import_id_idx ON public.properties (year, import_id);

ALTER TABLE public.itbi_imports ADD COLUMN IF NOT EXISTS import_id uuid;