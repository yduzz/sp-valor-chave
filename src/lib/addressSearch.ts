import { supabase } from "@/integrations/supabase/client";
import { normalizeAddress, parseAddress, tokenVariants } from "@/lib/addressNormalize";


// Words to ignore when matching (neighborhoods, cities, generic markers).
const STOP_WORDS = new Set([
  "PINHEIROS", "PERDIZES", "ITAIM", "BIBI", "MOEMA", "JARDINS", "JARDIM",
  "VILA", "MADALENA", "OLIMPIA", "PAULISTA", "BROOKLIN", "MORUMBI",
  "CONSOLACAO", "LIBERDADE", "BELA", "SANTANA", "TATUAPE", "MOOCA",
  "IPIRANGA", "SAUDE", "CAMPO", "BELO", "CENTRO", "REPUBLICA",
  "HIGIENOPOLIS", "SUMARE", "LAPA", "BUTANTA", "PACAEMBU",
  "SAO", "PAULO", "SP", "BRASIL", "BRAZIL",
  "JD", "PQ", "PARQUE",
]);

// Generic street-type words; useful but not "distinctive" for filtering precision.
const STREET_TYPES = new Set([
  "RUA", "R", "AVENIDA", "AV", "ALAMEDA", "AL", "TRAVESSA", "TV", "TRAV",
  "PRACA", "PCA", "LARGO", "LG", "ESTRADA", "EST", "RODOVIA", "ROD",
]);

export interface AddressSuggestion {
  street: string;
  example: string;
  count: number;
  neighborhood?: string | null;
}

function normalize(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[.,]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Build the "or" filter string for PostgREST: each token expands to one or
 * more variants (e.g. CARDEAL → "CARDEAL,CARD"). The full filter is an AND
 * of (variant1 OR variant2 OR ...) per token, achieved by chaining .ilike
 * calls — one per token — each with an OR-of-variants pattern.
 */
function tokensFromQuery(query: string): { tokens: string[]; numberSuffix: string | null } {
  const norm = normalize(query);
  const numMatch = norm.match(/\s+(\d+[A-Za-z0-9/-]*)\s*$/);
  const numberSuffix = numMatch ? numMatch[1] : null;
  const withoutNumber = norm.replace(/\s+\d+[A-Za-z0-9/-]*\s*$/, "").trim();

  const all = withoutNumber.split(" ").filter(w => w.length >= 2);
  // Drop neighborhoods/cities and short noise.
  const meaningful = all.filter(w => !STOP_WORDS.has(w));
  // Prefer distinctive (non-street-type) tokens; fall back to all if none left.
  const distinctive = meaningful.filter(w => !STREET_TYPES.has(w));
  const tokens = distinctive.length > 0 ? distinctive : meaningful;

  return { tokens, numberSuffix };
}

/**
 * For each token, build one ILIKE pattern per variant and chain queries with
 * AND semantics by intersecting the result sets in JS. This is the most
 * permissive way to handle full↔abbreviated word mismatches.
 */
async function searchByTokens(tokens: string[]): Promise<{ address: string; neighborhood: string | null }[]> {
  if (tokens.length === 0) return [];

  const perToken = await Promise.all(
    tokens.slice(0, 4).map(async (token) => {
      const variants = TOKEN_VARIANTS[token] ?? [token];
      const orFilter = variants.map(v => `address.ilike.%${v}%`).join(",");
      const { data } = await supabase
        .from("properties")
        .select("address, neighborhood")
        .or(orFilter)
        .limit(500);
      return data ?? [];
    })
  );

  if (perToken.length === 1) return perToken[0];

  const sets = perToken.map(rows => new Set(rows.map(r => r.address)));
  const smallest = perToken.reduce((min, cur) => (cur.length < min.length ? cur : min), perToken[0]);
  return smallest.filter(r => sets.every(s => s.has(r.address)));
}

export async function searchAddressesInDB(query: string): Promise<AddressSuggestion[]> {
  if (query.trim().length < 2) return [];

  const userTypedNumber = /\s+\d+[A-Za-z0-9/-]*\s*$/.test(query.trim());
  const { tokens } = tokensFromQuery(query);
  if (tokens.length === 0) return [];

  const rows = await searchByTokens(tokens);

  const grouped = new Map<string, { street: string; count: number; example: string; neighborhood: string | null }>();
  for (const row of rows) {
    const cleaned = stripUnitDetails(row.address);
    // Always group by street (without number). If the user typed a number that
    // doesn't exist in the DB, we still surface the street so they can see
    // nearby transactions instead of getting an empty autocomplete.
    const key = stripStreetNumber(cleaned);
    if (!grouped.has(key)) {
      grouped.set(key, { street: key, count: 0, example: row.address, neighborhood: row.neighborhood });
    }
    grouped.get(key)!.count++;
  }

  return [...grouped.values()]
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);
}

/** Remove unit/apartment details from an address (AP, CJ, CASA, etc.). */
function stripUnitDetails(address: string): string {
  return address
    .replace(/\s+(AP|APTO|APT|CJ|CASA|SALA|CONJ|BL|BLOCO|LJ|LOJA|SL|CS|LOTE|UNID|UNIDADE|VG|BOX|FLAT|STUDIO|N°|Nº|N\.?)\.?\s*.*/i, "")
    .replace(/\s+\d+\.\d+$/, "")
    .trim();
}

/**
 * Remove the trailing street number from a cleaned address.
 * "RUA CARDEAL ARCOVERDE 1070" → "RUA CARDEAL ARCOVERDE"
 */
function stripStreetNumber(address: string): string {
  return address
    .replace(/\s+\d+(\s*[A-Z]?\s+A\s+\d+)?\s*$/i, "")
    .replace(/\s+\d+[A-Za-z0-9/-]*\s*$/, "")
    .trim();
}

/** Format a street name for display: expand abbreviations and capitalize properly. */
export function formatStreetDisplay(street: string): string {
  const EXPAND: Record<string, string> = {
    R: "Rua", RUA: "Rua",
    AV: "Avenida", AVENIDA: "Avenida",
    AL: "Alameda", ALAMEDA: "Alameda",
    TV: "Travessa", TRAV: "Travessa", TRAVESSA: "Travessa",
    PCA: "Praça", PRACA: "Praça",
    LG: "Largo", LARGO: "Largo",
    EST: "Estrada", ESTRADA: "Estrada",
    ROD: "Rodovia", RODOVIA: "Rodovia",
    DR: "Dr.", DOUTOR: "Dr.", DRA: "Dra.", DOUTORA: "Dra.",
    PROF: "Prof.", PROFESSOR: "Prof.", PROFA: "Profa.",
    SEN: "Senador", SENADOR: "Senador",
    PE: "Padre", PADRE: "Padre",
    STA: "Santa", SANTA: "Santa",
    STO: "Santo", SANTO: "Santo",
    GAL: "General", GENERAL: "General",
    CEL: "Coronel", CORONEL: "Coronel",
    MAL: "Marechal", MARECHAL: "Marechal",
    CARD: "Cardeal", CARDEAL: "Cardeal",
    PRES: "Presidente", PRESIDENTE: "Presidente",
    ENG: "Engenheiro", ENGENHEIRO: "Engenheiro",
    BR: "Barão", BARAO: "Barão",
    VISC: "Visconde", VISCONDE: "Visconde",
    CONDE: "Conde", DUQUE: "Duque", DOM: "Dom",
    SAO: "São", STA_: "Santa",
    JD: "Jardim", JARDIM: "Jardim",
    PQ: "Parque", PARQUE: "Parque",
    VL: "Vila", VILA: "Vila",
  };
  // Connector words stay lowercase.
  const LOWER = new Set(["DE", "DA", "DO", "DAS", "DOS", "E"]);

  return street
    .split(/\s+/)
    .map((w, i) => {
      const upper = w.toUpperCase();
      if (EXPAND[upper]) return EXPAND[upper];
      if (i > 0 && LOWER.has(upper)) return upper.toLowerCase();
      if (/^\d/.test(w)) return w; // keep numbers as-is
      return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
    })
    .join(" ");
}

