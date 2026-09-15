
CREATE OR REPLACE FUNCTION search_addresses(search_term text, max_results int DEFAULT 8)
RETURNS TABLE(street_name text, full_address text, match_count bigint) 
LANGUAGE sql STABLE
AS $$
  WITH normalized AS (
    SELECT 
      regexp_replace(address, '\s+\d+.*$', '') AS street,
      address,
      count(*) OVER (PARTITION BY regexp_replace(address, '\s+\d+.*$', '')) as cnt
    FROM properties
    WHERE address ILIKE '%' || search_term || '%'
  ),
  distinct_streets AS (
    SELECT DISTINCT ON (street) 
      street as street_name,
      address as full_address,
      cnt as match_count
    FROM normalized
    ORDER BY street, cnt DESC
  )
  SELECT * FROM distinct_streets
  ORDER BY match_count DESC
  LIMIT max_results;
$$;
