-- Create the cron job for ITBI import (Scraping daily at 06:00 BRT / 09:00 UTC)
SELECT cron.schedule(
  'import-itbi-daily',
  '0 9 * * *',
  $$
  SELECT
    net.http_post(
      url:='https://snvevsfmxidzrhoidkao.supabase.co/functions/v1/import-itbi',
      headers:='{"Content-Type": "application/json", "Authorization": "Bearer ' || current_setting('app.settings.service_role_key') || '"}'::jsonb,
      body:='{}'::jsonb
    ) as request_id;
  $$
);

-- Create the cron job for Market Indices update (Daily at 08:30 UTC)
SELECT cron.schedule(
  'update-market-indexes-daily',
  '30 8 * * *',
  $$
  SELECT
    net.http_post(
      url:='https://snvevsfmxidzrhoidkao.supabase.co/functions/v1/update-market-indexes',
      headers:='{"Content-Type": "application/json", "Authorization": "Bearer ' || current_setting('app.settings.service_role_key') || '"}'::jsonb,
      body:='{}'::jsonb
    ) as request_id;
  $$
);