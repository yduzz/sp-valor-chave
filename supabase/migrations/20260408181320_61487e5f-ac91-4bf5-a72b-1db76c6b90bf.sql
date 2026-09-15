
-- Create properties table for scraped real estate data
CREATE TABLE public.properties (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  address TEXT NOT NULL,
  neighborhood TEXT,
  area NUMERIC,
  venal_value NUMERIC NOT NULL,
  property_type TEXT,
  year INTEGER NOT NULL,
  fiscal_zone TEXT,
  price_per_sqm NUMERIC,
  ad_link TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create index for address lookups
CREATE INDEX idx_properties_address ON public.properties (address);
CREATE INDEX idx_properties_year ON public.properties (year);

-- Enable RLS
ALTER TABLE public.properties ENABLE ROW LEVEL SECURITY;

-- Public read access (property data is public)
CREATE POLICY "Anyone can view properties" ON public.properties
  FOR SELECT USING (true);

-- Create evaluations history table
CREATE TABLE public.evaluations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  address TEXT NOT NULL,
  selected_property_ids UUID[] NOT NULL,
  sale_min NUMERIC,
  sale_avg NUMERIC,
  sale_max NUMERIC,
  per_sqm_min NUMERIC,
  per_sqm_avg NUMERIC,
  per_sqm_max NUMERIC,
  rent_min NUMERIC,
  rent_avg NUMERIC,
  rent_max NUMERIC,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.evaluations ENABLE ROW LEVEL SECURITY;

-- Public read/insert for evaluations (no auth for now)
CREATE POLICY "Anyone can view evaluations" ON public.evaluations
  FOR SELECT USING (true);

CREATE POLICY "Anyone can create evaluations" ON public.evaluations
  FOR INSERT WITH CHECK (true);

-- Timestamp trigger
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_properties_updated_at
  BEFORE UPDATE ON public.properties
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
