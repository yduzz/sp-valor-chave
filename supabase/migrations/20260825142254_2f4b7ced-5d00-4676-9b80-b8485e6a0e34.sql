-- Lock down evaluations table: remove public read/write
DROP POLICY IF EXISTS "Anyone can create evaluations" ON public.evaluations;
DROP POLICY IF EXISTS "Anyone can view evaluations" ON public.evaluations;

REVOKE ALL ON public.evaluations FROM anon;
REVOKE ALL ON public.evaluations FROM authenticated;
GRANT ALL ON public.evaluations TO service_role;

CREATE POLICY "Service role manages evaluations"
  ON public.evaluations FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

-- Storage: restrict market-reports bucket objects to service role only
DROP POLICY IF EXISTS "Service role manages market-reports objects" ON storage.objects;
CREATE POLICY "Service role manages market-reports objects"
  ON storage.objects FOR ALL
  TO service_role
  USING (bucket_id = 'market-reports')
  WITH CHECK (bucket_id = 'market-reports');