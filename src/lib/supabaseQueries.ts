import {
  parseAddress,
  canonicalToken,
  tokenVariants,
  normalizeAddress,
  stripUnitDetails,
} from "@/lib/addressNormalize";

/**
 * Representa um imóvel retornado pela API / PostgreSQL.
 *
 * Mantemos os mesmos campos utilizados pelo frontend,
 * sem depender dos tipos gerados pelo Supabase.
 */
export interface Property {
  id: string;
  address: string;
  neighborhood: string | null;
  area: number | null;
  venal_value: number;
  property_type: string | null;
  year: number;
  fiscal_zone: string | null;
  price_per_sqm: number | null;
  ad_link: string | null;
  created_at: string;
  updated_at: string;
  transaction_value: number | null;
  transaction_value_full: number | null;
  proportion_pct: number | null;
  matricula: string | null;
  transaction_date: string | null;
  venal_reference: number | null;
  import_id: string | null;
}

// Tokens genéricos (tipo de via e títulos).
// São úteis para conferência, mas ruins como termo principal
// de busca por serem pouco distintivos.
const GENERIC_TOKENS = new Set([
  "RUA",
  "AVENIDA",
  "ALAMEDA",
  "TRAVESSA",
  "PRACA",
  "LARGO",
  "ESTRADA",
  "RODOVIA",
  "VIADUTO",
  "MARGINAL",
  "DOUTOR",
  "DOUTORA",
  "PROFESSOR",
  "PROFESSORA",
  "SENADOR",
  "DEPUTADO",
  "PADRE",
  "SANTA",
  "SANTO",
  "SAO",
  "GENERAL",
  "CORONEL",
  "MARECHAL",
  "CAPITAO",
  "BRIGADEIRO",
  "CARDEAL",
  "PRESIDENTE",
  "ENGENHEIRO",
  "MINISTRO",
  "CONSELHEIRO",
  "DESEMBARGADOR",
  "BARAO",
  "VISCONDE",
  "MARQUES",
  "CONDE",
  "DUQUE",
  "DOM",
  "JARDIM",
  "PARQUE",
  "VILA",
  "CONJUNTO",
]);

/**
 * Extrai os termos relevantes do endereço informado pelo usuário.
 *
 * Exemplo:
 * "Rua Cardoso de Almeida, 100"
 *
 * Retorna:
 * {
 *   keywords: ["CARDOSO", "ALMEIDA"],
 *   number: "100"
 * }
 */
function extractSearchTerms(address: string): {
  keywords: string[];
  number: string | null;
} {
  const { tokens, number } = parseAddress(address);

  const distinctive = tokens.filter(
    (token) => !GENERIC_TOKENS.has(token)
  );

  return {
    keywords: distinctive.length > 0 ? distinctive : tokens,
    number,
  };
}

/**
 * Cria os tokens canônicos de um endereço vindo do banco.
 *
 * O banco pode possuir abreviações diferentes das utilizadas
 * pelo usuário. A canonicalização permite comparar as duas formas.
 */
function canonicalTokensOf(addressValue: string): Set<string> {
  return new Set(
    stripUnitDetails(normalizeAddress(addressValue))
      .split(" ")
      .filter(Boolean)
      .map(canonicalToken)
  );
}

/**
 * Busca propriedades através da API.
 *
 * Nenhuma consulta é feita diretamente ao Supabase.
 * Toda comunicação passa pela API /api/property-search,
 * que consulta o PostgreSQL.
 */
async function fetchPropertiesFromDatabase(
  keywords: string[],
  number: string | null
): Promise<Property[]> {
  if (keywords.length === 0) {
    return [];
  }

  // O termo mais longo normalmente é o mais distintivo.
  const sortedKeywords = [...keywords].sort(
    (a, b) => b.length - a.length
  );

  const primaryKeyword = sortedKeywords[0];

  // Busca todas as variantes possíveis do termo principal.
  // Exemplo: abreviações e formas equivalentes.
  const variants = tokenVariants(primaryKeyword);

  const responses = await Promise.all(
    variants.map(async (variant) => {
      const params = new URLSearchParams();

      params.set("keyword", variant);

      // Quando há número, enviamos também para a API.
      // Isso permite que o PostgreSQL restrinja a busca
      // diretamente ao logradouro + número.
      if (number) {
        params.set("number", normalizeAddress(number));
      }

      const response = await fetch(
        `/api/property-search?${params.toString()}`
      );

      if (!response.ok) {
        throw new Error("Erro ao consultar propriedades.");
      }

      const data = await response.json();

      return Array.isArray(data) ? (data as Property[]) : [];
    })
  );

  // Junta os resultados de todas as variantes
  // e remove imóveis duplicados.
  const unique = new Map<string, Property>();

  for (const properties of responses) {
    for (const property of properties) {
      const key = String(property.id);

      if (!unique.has(key)) {
        unique.set(key, property);
      }
    }
  }

  let results = [...unique.values()];

  /**
   * Se o endereço possuir mais de um termo distintivo,
   * todos os termos precisam estar presentes no endereço
   * retornado pelo banco.
   */
  if (sortedKeywords.length > 1) {
    const otherKeywords = sortedKeywords.slice(1);

    results = results.filter((property) => {
      const dbTokens = canonicalTokensOf(property.address);

      return otherKeywords.every((keyword) =>
        dbTokens.has(canonicalToken(keyword))
      );
    });
  }

  /**
   * Quando o usuário informou um número:
   *
   * 1. Primeiro procuramos correspondência exata.
   * 2. Se não houver, procuramos imóveis próximos ao número.
   *
   * Isso mantém o comportamento de busca histórica sem
   * retornar imóveis de números completamente diferentes.
   */
  if (number && results.length > 0) {
    const wanted = normalizeAddress(number);

    const exact = results.filter(
      (property) =>
        parseAddress(property.address).number === wanted
    );

    if (exact.length > 0) {
      exact.sort((a, b) =>
        (b.transaction_date || "").localeCompare(
          a.transaction_date || ""
        )
      );

      return exact;
    }

    // Caso não encontre o número exato,
    // procura imóveis próximos na mesma via.
    const target = parseInt(wanted, 10);

    if (!Number.isNaN(target)) {
      const withDistance = results
        .map((property) => {
          const propertyNumber = parseInt(
            parseAddress(property.address).number || "",
            10
          );

          return {
            property,
            distance: Number.isNaN(propertyNumber)
              ? Infinity
              : Math.abs(propertyNumber - target),
          };
        })
        .filter((item) => item.distance <= 120)
        .sort(
          (a, b) =>
            a.distance - b.distance ||
            (b.property.transaction_date || "").localeCompare(
              a.property.transaction_date || ""
            )
        );

      if (withDistance.length > 0) {
        return withDistance
          .slice(0, 60)
          .map((item) => item.property);
      }
    }

    return [];
  }

  /**
   * Sem número informado, retornamos os imóveis encontrados
   * na via pesquisada.
   */
  return results;
}

/**
 * Busca imóveis pelo endereço informado pelo usuário.
 *
 * Exemplo:
 * "Rua Cardoso de Almeida, 100"
 */
export async function searchProperties(
  address: string
): Promise<Property[]> {
  if (!address.trim()) {
    return [];
  }

  const { keywords, number } = extractSearchTerms(address);

  const results = await fetchPropertiesFromDatabase(
    keywords,
    number
  );

  return results;
}

/**
 * Busca direta por prefixo de endereço.
 *
 * Mantida para compatibilidade com fluxos que possam utilizar
 * essa função futuramente.
 */
async function tryDirectSearch(
  address: string
): Promise<Property[]> {
  const normalized = address
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[.,]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const response = await fetch(
    `/api/property-search?prefix=${encodeURIComponent(
      normalized
    )}`
  );

  if (!response.ok) {
    return [];
  }

  const data = await response.json();

  return Array.isArray(data) ? (data as Property[]) : [];
}

/**
 * Salva uma avaliação através da API.
 */
export async function saveEvaluation(
  evaluation: {
    address: string;
    selected_property_ids: string[];
    sale: {
      min: number;
      avg: number;
      max: number;
    };
    perSqm: {
      min: number;
      avg: number;
      max: number;
    };
    rent: {
      min: number;
      avg: number;
      max: number;
    };
  }
) {
  const response = await fetch("/api/evaluations", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(evaluation),
  });

  if (!response.ok) {
    throw new Error("Erro ao salvar avaliação.");
  }
}

/**
 * Busca o histórico de avaliações através da API.
 */
export async function getEvaluationHistory() {
  const response = await fetch("/api/evaluations");

  if (!response.ok) {
    throw new Error("Erro ao buscar histórico.");
  }

  const data = await response.json();

  return Array.isArray(data) ? data : [];
}