export interface NominatimResult {
  place_id: number;
  display_name: string;
  lat: string;
  lon: string;
  address: {
    road?: string;
    house_number?: string;
    suburb?: string;
    city?: string;
    city_district?: string;
    state?: string;
    postcode?: string;
  };
}

export function formatResult(result: NominatimResult): { primary: string; secondary: string; full: string } {
  const { road, house_number, suburb, city, city_district, state } = result.address;
  const street = road || result.display_name.split(",")[0];
  const streetFull = house_number ? `${street}, ${house_number}` : street;
  const neighborhood = suburb || city_district || "";
  const cityName = city || "";
  const stateName = state || "";

  const primary = streetFull;
  const secondary = [neighborhood, cityName, stateName].filter(Boolean).join(", ");
  const full = [streetFull, neighborhood, cityName].filter(Boolean).join(", ");

  return { primary, secondary, full };
}

export async function searchAddress(query: string): Promise<NominatimResult[]> {
  if (query.length < 3) return [];

  const params = new URLSearchParams({
    q: query,
    format: "json",
    addressdetails: "1",
    limit: "8",
    countrycodes: "br",
  });

  const response = await fetch(`https://nominatim.openstreetmap.org/search?${params}`, {
    headers: { "Accept-Language": "pt-BR" },
  });

  if (!response.ok) return [];
  const data: NominatimResult[] = await response.json();

  // Prioritize São Paulo results
  return data.sort((a, b) => {
    const aIsSP = (a.address.city === "São Paulo" || a.address.state === "São Paulo") ? 0 : 1;
    const bIsSP = (b.address.city === "São Paulo" || b.address.state === "São Paulo") ? 0 : 1;
    // Within SP, prioritize city matches over state-only matches
    const aIsCity = a.address.city === "São Paulo" ? 0 : 1;
    const bIsCity = b.address.city === "São Paulo" ? 0 : 1;
    return aIsSP - bIsSP || aIsCity - bIsCity;
  });
}
