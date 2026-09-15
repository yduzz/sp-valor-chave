
-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- Allow service role to delete properties for re-import
CREATE POLICY "Service role can insert properties"
ON public.properties
FOR INSERT
TO service_role
WITH CHECK (true);

CREATE POLICY "Service role can delete properties"
ON public.properties
FOR DELETE
TO service_role
USING (true);
