export interface NominatimResult {
  place_id: number;
  display_name: string;
  lat: string;
  lon: string;
  address: {
    road?: string;
    suburb?: string;
    city?: string;
    state?: string;
  };
}

export async function searchAddress(query: string): Promise<NominatimResult[]> {
  if (query.length < 3) return [];

  const params = new URLSearchParams({
    q: `${query}, São Paulo, Brasil`,
    format: "json",
    addressdetails: "1",
    limit: "5",
    countrycodes: "br",
  });

  const response = await fetch(`https://nominatim.openstreetmap.org/search?${params}`, {
    headers: { "Accept-Language": "pt-BR" },
  });

  if (!response.ok) return [];
  return response.json();
}
