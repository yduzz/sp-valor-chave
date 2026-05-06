import { supabase } from "@/integrations/supabase/client";

// Map full word → abbreviation used in the city's database (and vice-versa).
// When the user types "CARDEAL", we also search by "CARD"; when they type "R",
// we also try "RUA". This is the key to matching abbreviated DB rows.
const TOKEN_VARIANTS: Record<string, string[]> = {
  RUA: ["RUA", "R"], R: ["R", "RUA"],
  AVENIDA: ["AVENIDA", "AV"], AV: ["AV", "AVENIDA"],
  ALAMEDA: ["ALAMEDA", "AL"], AL: ["AL", "ALAMEDA"],
  TRAVESSA: ["TRAVESSA", "TV", "TRAV"], TV: ["TV", "TRAVESSA"], TRAV: ["TRAV", "TRAVESSA"],
  PRACA: ["PRACA", "PCA"], PCA: ["PCA", "PRACA"],
  LARGO: ["LARGO", "LG"], LG: ["LG", "LARGO"],
  ESTRADA: ["ESTRADA", "EST"], EST: ["EST", "ESTRADA"],
  RODOVIA: ["RODOVIA", "ROD"], ROD: ["ROD", "RODOVIA"],
  DOUTOR: ["DOUTOR", "DR"], DR: ["DR", "DOUTOR"],
  PROFESSOR: ["PROFESSOR", "PROF"], PROF: ["PROF", "PROFESSOR"],
  SENADOR: ["SENADOR", "SEN"], SEN: ["SEN", "SENADOR"],
  PADRE: ["PADRE", "PE"], PE: ["PE", "PADRE"],
  SANTA: ["SANTA", "STA"], STA: ["STA", "SANTA"],
  SANTO: ["SANTO", "STO"], STO: ["STO", "SANTO"],
  GENERAL: ["GENERAL", "GAL"], GAL: ["GAL", "GENERAL"],
  CORONEL: ["CORONEL", "CEL"], CEL: ["CEL", "CORONEL"],
  MARECHAL: ["MARECHAL", "MAL"], MAL: ["MAL", "MARECHAL"],
  CARDEAL: ["CARDEAL", "CARD"], CARD: ["CARD", "CARDEAL"],
  PRESIDENTE: ["PRESIDENTE", "PRES"], PRES: ["PRES", "PRESIDENTE"],
  ENGENHEIRO: ["ENGENHEIRO", "ENG"], ENG: ["ENG", "ENGENHEIRO"],
  BARAO: ["BARAO", "BR"],
  VISCONDE: ["VISCONDE", "VISC"], VISC: ["VISC", "VISCONDE"],
};

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
async function searchByTokens(tokens: string[]): Promise<{ address: string }[]> {
  if (tokens.length === 0) return [];

  // For each token, run a query matching ANY of its variants.
  const perToken = await Promise.all(
    tokens.slice(0, 4).map(async (token) => {
      const variants = TOKEN_VARIANTS[token] ?? [token];
      // Build one OR-filter: address.ilike.%V1%,address.ilike.%V2%,...
      const orFilter = variants.map(v => `address.ilike.%${v}%`).join(",");
      const { data } = await supabase
        .from("properties")
        .select("address")
        .or(orFilter)
        .limit(500);
      return data ?? [];
    })
  );

  if (perToken.length === 1) return perToken[0];

  // Intersect by address string — every row must appear in every token result.
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

  // Group by street (or full address if user typed a number).
  const grouped = new Map<string, { street: string; count: number; example: string }>();
  for (const row of rows) {
    const cleaned = stripUnitDetails(row.address);
    const key = userTypedNumber ? cleaned : stripStreetNumber(cleaned);
    if (!grouped.has(key)) {
      grouped.set(key, { street: key, count: 0, example: row.address });
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
    .replace(/\s+(AP|APTO|APT|CJ|CASA|SALA|CONJ|BL|BLOCO|LJ|LOJA|SL|CS|LOTE|UNID|UNIDADE|G|VG|BOX|FLAT|STUDIO)\s+.*/i, "")
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

/** Format a street name for display: capitalize properly */
export function formatStreetDisplay(street: string): string {
  const EXPAND: Record<string, string> = {
    R: "Rua", AV: "Avenida", AL: "Alameda", TV: "Travessa",
    TRAV: "Travessa", PCA: "Praça", DR: "Dr.", PROF: "Prof.",
    SEN: "Sen.", PE: "Pe.", STA: "Santa", STO: "Santo",
    GAL: "Gen.", CEL: "Cel.", MAL: "Mal.", CARD: "Cardeal",
    PRES: "Pres.", ENG: "Eng.", LG: "Largo", EST: "Estrada",
    ROD: "Rodovia", BR: "Barão", VISC: "Visconde",
  };

  return street
    .split(" ")
    .map((w, i) => {
      const upper = w.toUpperCase();
      if (i === 0 && EXPAND[upper]) return EXPAND[upper];
      if (EXPAND[upper]) return EXPAND[upper];
      return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
    })
    .join(" ");
}
