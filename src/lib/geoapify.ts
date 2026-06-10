export interface GeoapifyFeature {
  properties: {
    formatted: string;
    address_line1?: string;
    address_line2?: string;
    street?: string;
    housenumber?: string;
    suburb?: string;
    district?: string;
    city?: string;
    state?: string;
    postcode?: string;
    country?: string;
    lat: number;
    lon: number;
    place_id: string;
    result_type?: string;
  };
}

export interface GeoapifyResult {
  primary: string;
  secondary: string;
  full: string;
  placeId: string;
  street?: string;
  housenumber?: string;
}


const API_KEY = import.meta.env.VITE_GEOAPIFY_API_KEY as string | undefined;

// São Paulo metro bias (lon1,lat1,lon2,lat2)
const SP_BIAS = "rect:-46.826,-23.357,-46.365,-23.795";

export async function geoapifyAutocomplete(query: string): Promise<GeoapifyResult[]> {
  if (!API_KEY || query.trim().length < 3) return [];

  const params = new URLSearchParams({
    text: query,
    apiKey: API_KEY,
    lang: "pt",
    limit: "8",
    filter: "countrycode:br",
    bias: SP_BIAS,
    format: "geojson",
  });

  try {
    const res = await fetch(`https://api.geoapify.com/v1/geocode/autocomplete?${params}`);
    if (!res.ok) return [];
    const data = await res.json();
    const features: GeoapifyFeature[] = data.features ?? [];
    return features.map(formatFeature);
  } catch {
    return [];
  }
}

function formatFeature(f: GeoapifyFeature): GeoapifyResult {
  const p = f.properties;
  const street = p.street ?? "";
  const number = p.housenumber ?? "";
  const primary = p.address_line1 ?? (number ? `${street}, ${number}` : street || p.formatted);
  const secondary = [p.suburb ?? p.district, p.city, p.state].filter(Boolean).join(", ");
  return {
    primary,
    secondary,
    full: p.formatted,
    placeId: p.place_id,
  };
}
