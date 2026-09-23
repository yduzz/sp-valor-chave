import {
  normalizeAddress,
  parseAddress,
  tokenVariants,
} from "@/lib/addressNormalize";

// Words to ignore when matching (neighborhoods, cities, generic markers).
const STOP_WORDS = new Set([
  "PINHEIROS",
  "PERDIZES",
  "ITAIM",
  "BIBI",
  "MOEMA",
  "JARDINS",
  "JARDIM",
  "VILA",
  "MADALENA",
  "OLIMPIA",
  "PAULISTA",
  "BROOKLIN",
  "MORUMBI",
  "CONSOLACAO",
  "LIBERDADE",
  "BELA",
  "SANTANA",
  "TATUAPE",
  "MOOCA",
  "IPIRANGA",
  "SAUDE",
  "CAMPO",
  "BELO",
  "CENTRO",
  "REPUBLICA",
  "HIGIENOPOLIS",
  "SUMARE",
  "LAPA",
  "BUTANTA",
  "PACAEMBU",
  "SAO",
  "PAULO",
  "SP",
  "BRASIL",
  "BRAZIL",
  "JD",
  "PQ",
  "PARQUE",
]);

// Generic street-type words; useful but not "distinctive"
// for filtering precision.
const STREET_TYPES = new Set([
  "RUA",
  "R",
  "AVENIDA",
  "AV",
  "ALAMEDA",
  "AL",
  "TRAVESSA",
  "TV",
  "TRAV",
  "PRACA",
  "PCA",
  "LARGO",
  "LG",
  "ESTRADA",
  "EST",
  "RODOVIA",
  "ROD",
]);

export interface AddressSuggestion {
  street: string;
  example: string;
  count: number;
  neighborhood?: string | null;
}

interface AddressSearchRow {
  address: string;
  neighborhood: string | null;
}

function normalize(s: string): string {
  return normalizeAddress(s);
}

/**
 * Extract distinctive tokens (already canonicalized:
 * "R" → "RUA", "CARD" → "CARDEAL") plus the typed house number.
 */
function tokensFromQuery(
  query: string
): { tokens: string[]; numberSuffix: string | null } {
  const { tokens: all, number } = parseAddress(query);

  // Drop neighborhoods/cities and short noise.
  const meaningful = all.filter((word) => !STOP_WORDS.has(word));

  // Prefer distinctive (non-street-type) tokens.
  // Fall back to all if none are left.
  const distinctive = meaningful.filter(
    (word) => !STREET_TYPES.has(word)
  );

  const tokens = distinctive.length > 0 ? distinctive : meaningful;

  return {
    tokens,
    numberSuffix: number,
  };
}

/**
 * Searches the backend API for each token variant.
 *
 * The backend performs the actual PostgreSQL query against Layerbase.
 * We keep the intersection logic in the frontend so abbreviated/full
 * street names continue working exactly as before.
 */
async function searchByTokens(
  tokens: string[]
): Promise<AddressSearchRow[]> {
  if (tokens.length === 0) return [];

  const perToken = await Promise.all(
    tokens.slice(0, 4).map(async (token) => {
      const variants = tokenVariants(token);

      const responses = await Promise.all(
        variants.map(async (variant) => {
          const response = await fetch(
            `/api/address-search?query=${encodeURIComponent(variant)}`
          );

          if (!response.ok) {
            throw new Error(
              "Erro ao consultar endereços no banco de dados."
            );
          }

          return (await response.json()) as AddressSearchRow[];
        })
      );

      // Merge variants and remove duplicate addresses.
      const unique = new Map<string, AddressSearchRow>();

      for (const rows of responses) {
        for (const row of rows) {
          if (!row?.address) continue;

          const key = normalize(row.address);

          if (!unique.has(key)) {
            unique.set(key, row);
          }
        }
      }

      return [...unique.values()];
    })
  );

  if (perToken.length === 1) {
    return perToken[0];
  }

  const sets = perToken.map(
    (rows) => new Set(rows.map((row) => normalize(row.address)))
  );

  // Start with the smallest result set to reduce the amount
  // of work during the intersection.
  const smallest = perToken.reduce(
    (min, current) =>
      current.length < min.length ? current : min,
    perToken[0]
  );

  return smallest.filter((row) => {
    const addressKey = normalize(row.address);

    return sets.every((set) => set.has(addressKey));
  });
}

export async function searchAddressesInDB(
  query: string
): Promise<AddressSuggestion[]> {
  if (query.trim().length < 2) return [];

  const { tokens } = tokensFromQuery(query);

  if (tokens.length === 0) return [];

  const rows = await searchByTokens(tokens);

  const grouped = new Map<
    string,
    {
      street: string;
      count: number;
      example: string;
      neighborhood: string | null;
    }
  >();

  for (const row of rows) {
    const cleaned = stripUnitDetails(row.address);

    // Always group by street (without number).
    // If the user typed a number that doesn't exist in the DB,
    // we still surface the street so nearby transactions can be found.
    const key = stripStreetNumber(cleaned);

    if (!grouped.has(key)) {
      grouped.set(key, {
        street: key,
        count: 0,
        example: row.address,
        neighborhood: row.neighborhood,
      });
    }

    grouped.get(key)!.count++;
  }

  return [...grouped.values()]
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);
}

/**
 * Remove unit/apartment details from an address.
 * Examples: AP, APTO, CJ, CASA, SALA, BLOCO, LOJA, etc.
 */
function stripUnitDetails(address: string): string {
  return address
    .replace(
      /\s+(AP|APTO|APT|CJ|CONJ|CONJUNTO|CASA|SALA|BL|BLOCO|LJ|LOJA|SL|CS|LOTE|UNID|UNIDADE|VG|BOX|FLAT|STUDIO|N|Nº|N°)\s*.*$/i,
      ""
    )
    .replace(/\s+\d+\.\d+$/, "")
    .trim();
}

/**
 * Remove the trailing street number from a cleaned address.
 *
 * Example:
 * "RUA CARDEAL ARCOVERDE 1070"
 * becomes:
 * "RUA CARDEAL ARCOVERDE"
 */
function stripStreetNumber(address: string): string {
  return address
    .replace(/\s+\d+(\s*[A-Z]?\s+A\s+\d+)?\s*$/i, "")
    .replace(/\s+\d+[A-Za-z0-9/-]*\s*$/, "")
    .trim();
}

/**
 * Format a street name for display:
 * expand abbreviations and capitalize properly.
 */
export function formatStreetDisplay(street: string): string {
  const EXPAND: Record<string, string> = {
    R: "Rua",
    RUA: "Rua",

    AV: "Avenida",
    AVENIDA: "Avenida",

    AL: "Alameda",
    ALAMEDA: "Alameda",

    TV: "Travessa",
    TRAV: "Travessa",
    TRAVESSA: "Travessa",

    PCA: "Praça",
    PRACA: "Praça",

    LG: "Largo",
    LARGO: "Largo",

    EST: "Estrada",
    ESTRADA: "Estrada",

    ROD: "Rodovia",
    RODOVIA: "Rodovia",

    DR: "Dr.",
    DOUTOR: "Dr.",

    DRA: "Dra.",
    DOUTORA: "Dra.",

    PROF: "Prof.",
    PROFESSOR: "Prof.",
    PROFA: "Profa.",

    SEN: "Senador",
    SENADOR: "Senador",

    PE: "Padre",
    PADRE: "Padre",

    STA: "Santa",
    SANTA: "Santa",

    STO: "Santo",
    SANTO: "Santo",

    GAL: "General",
    GENERAL: "General",

    CEL: "Coronel",
    CORONEL: "Coronel",

    MAL: "Marechal",
    MARECHAL: "Marechal",

    CARD: "Cardeal",
    CARDEAL: "Cardeal",

    PRES: "Presidente",
    PRESIDENTE: "Presidente",

    ENG: "Engenheiro",
    ENGENHEIRO: "Engenheiro",

    BR: "Barão",
    BARAO: "Barão",

    VISC: "Visconde",
    VISCONDE: "Visconde",

    CONDE: "Conde",
    DUQUE: "Duque",
    DOM: "Dom",

    SAO: "São",

    JD: "Jardim",
    JARDIM: "Jardim",

    PQ: "Parque",
    PARQUE: "Parque",

    VL: "Vila",
    VILA: "Vila",
  };

  // Connector words stay lowercase.
  const LOWER = new Set([
    "DE",
    "DA",
    "DO",
    "DAS",
    "DOS",
    "E",
  ]);

  return street
    .split(/\s+/)
    .map((word, index) => {
      const upper = word.toUpperCase();

      if (EXPAND[upper]) {
        return EXPAND[upper];
      }

      if (index > 0 && LOWER.has(upper)) {
        return upper.toLowerCase();
      }

      if (/^\d/.test(word)) {
        return word;
      }

      return (
        word.charAt(0).toUpperCase() +
        word.slice(1).toLowerCase()
      );
    })
    .join(" ");
}