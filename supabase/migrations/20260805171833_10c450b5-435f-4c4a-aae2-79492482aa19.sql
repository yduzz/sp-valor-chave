ALTER TABLE public.properties
  ADD COLUMN IF NOT EXISTS transaction_value numeric,
  ADD COLUMN IF NOT EXISTS transaction_value_full numeric,
  ADD COLUMN IF NOT EXISTS proportion_pct numeric,
  ADD COLUMN IF NOT EXISTS matricula text,
  ADD COLUMN IF NOT EXISTS transaction_date date,
  ADD COLUMN IF NOT EXISTS venal_reference numeric;

CREATE INDEX IF NOT EXISTS properties_transaction_date_idx ON public.properties (transaction_date DESC);
CREATE INDEX IF NOT EXISTS properties_matricula_idx ON public.properties (matricula);