import {
  parseAddress,
  tokenVariants,
} from "@/lib/addressNormalize";

const STOP_WORDS = new Set([
  "PINHEIROS", "PERDIZES", "ITAIM", "BIBI", "MOEMA", "JARDINS", "JARDIM",
  "VILA", "MADALENA", "OLIMPIA", "PAULISTA", "BROOKLIN", "MORUMBI",
  "CONSOLACAO", "LIBERDADE", "BELA", "SANTANA", "TATUAPE", "MOOCA",
  "IPIRANGA", "SAUDE", "CAMPO", "BELO", "CENTRO", "REPUBLICA",
  "HIGIENOPOLIS", "SUMARE", "LAPA", "BUTANTA", "PACAEMBU",
  "SAO", "PAULO", "SP", "BRASIL", "BRAZIL",
  "JD", "PQ", "PARQUE",
]);

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

function tokensFromQuery(query: string): {
  tokens: string[];
  numberSuffix: string | null;
} {
  const { tokens: all, number } = parseAddress(query);

  const meaningful = all.filter(
    (word) => !STOP_WORDS.has(word)
  );

  const distinctive = meaningful.filter(
    (word) => !STREET_TYPES.has(word)
  );

  const tokens =
    distinctive.length > 0
      ? distinctive
      : meaningful;

  return {
    tokens,
    numberSuffix: number,
  };
}

/**
 * Consulta o backend em vez do Supabase.
 *
 * A API retorna os registros do PostgreSQL/Layerbase.
 * Toda a lógica de agrupamento e apresentação
 * continua no frontend.
 */
async function searchByTokens(
  tokens: string[]
): Promise<
  { address: string; neighborhood: string | null }[]
> {
  if (tokens.length === 0) return [];

  const perToken = await Promise.all(
    tokens.slice(0, 4).map(async (token) => {
      const variants = tokenVariants(token);

      const results = await Promise.all(
        variants.map(async (variant) => {
          const response = await fetch(
            `/api/address-search?query=${encodeURIComponent(
              variant
            )}`
          );

          if (!response.ok) {
            throw new Error(
              "Erro ao consultar endereços."
            );
          }

          return (await response.json()) as {
            address: string;
            neighborhood: string | null;
          }[];
        })
      );

      const unique = new Map<
        string,
        {
          address: string;
          neighborhood: string | null;
        }
      >();

      for (const rows of results) {
        for (const row of rows) {
          const key = `${row.address}|${
            row.neighborhood ?? ""
          }`;

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
    (rows) =>
      new Set(
        rows.map(
          (row) => row.address
        )
      )
  );

  const smallest = perToken.reduce(
    (min, current) =>
      current.length < min.length
        ? current
        : min,
    perToken[0]
  );

  return smallest.filter((row) =>
    sets.every((set) =>
      set.has(row.address)
    )
  );
}

export async function searchAddressesInDB(
  query: string
): Promise<AddressSuggestion[]> {
  if (query.trim().length < 2) {
    return [];
  }

  const { tokens } =
    tokensFromQuery(query);

  if (tokens.length === 0) {
    return [];
  }

  const rows =
    await searchByTokens(tokens);

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
    const cleaned =
      stripUnitDetails(row.address);

    const key =
      stripStreetNumber(cleaned);

    if (!grouped.has(key)) {
      grouped.set(key, {
        street: key,
        count: 0,
        example: row.address,
        neighborhood:
          row.neighborhood,
      });
    }

    grouped.get(key)!.count++;
  }

  return [...grouped.values()]
    .sort(
      (a, b) =>
        b.count - a.count
    )
    .slice(0, 8);
}

/**
 * Remove unit/apartment details.
 */
function stripUnitDetails(
  address: string
): string {
  return address
    .replace(
      /\s+(AP|APTO|APT|CJ|CASA|SALA|CONJ|BL|BLOCO|LJ|LOJA|SL|CS|LOTE|UNID|UNIDADE|VG|BOX|FLAT|STUDIO|NÂ°|NÂº|N\.?)\.?\s*.*/i,
      ""
    )
    .replace(
      /\s+\d+\.\d+$/,
      ""
    )
    .trim();
}

/**
 * Remove the trailing street number.
 */
function stripStreetNumber(
  address: string
): string {
  return address
    .replace(
      /\s+\d+(\s*[A-Z]?\s+A\s+\d+)?\s*$/i,
      ""
    )
    .replace(
      /\s+\d+[A-Za-z0-9/-]*\s*$/,
      ""
    )
    .trim();
}

/**
 * Format street name for display.
 */
export function formatStreetDisplay(
  street: string
): string {
  const EXPAND: Record<
    string,
    string
  > = {
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
    STA_: "Santa",
    JD: "Jardim",
    JARDIM: "Jardim",
    PQ: "Parque",
    PARQUE: "Parque",
    VL: "Vila",
    VILA: "Vila",
  };

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
      const upper =
        word.toUpperCase();

      if (EXPAND[upper]) {
        return EXPAND[upper];
      }

      if (
        index > 0 &&
        LOWER.has(upper)
      ) {
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