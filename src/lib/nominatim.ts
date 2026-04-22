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

  // Append "São Paulo" if user hasn't already mentioned a city/state
  const lower = query.toLowerCase();
  const hasCity = /são paulo|sao paulo|\bsp\b/i.test(lower);
  const augmentedQuery = hasCity ? query : `${query}, São Paulo, SP`;

  const params = new URLSearchParams({
    q: augmentedQuery,
    format: "json",
    addressdetails: "1",
    limit: "10",
    countrycodes: "br",
    // Bounding box for São Paulo metro area (left, top, right, bottom)
    viewbox: "-46.826,-23.357,-46.365,-23.795",
    bounded: "1",
  });

  const response = await fetch(`https://nominatim.openstreetmap.org/search?${params}`, {
    headers: { "Accept-Language": "pt-BR" },
  });

  if (!response.ok) return [];
  const data: NominatimResult[] = await response.json();

  // Prioritize results that have a road (street-level precision) and are in São Paulo city
  return data.sort((a, b) => {
    const aHasRoad = a.address.road ? 0 : 1;
    const bHasRoad = b.address.road ? 0 : 1;
    const aIsCity = a.address.city === "São Paulo" ? 0 : 1;
    const bIsCity = b.address.city === "São Paulo" ? 0 : 1;
    return aHasRoad - bHasRoad || aIsCity - bIsCity;
  });
}
