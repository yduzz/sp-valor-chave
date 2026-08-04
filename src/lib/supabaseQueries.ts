import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import {
  parseAddress,
  canonicalToken,
  tokenVariants,
  normalizeAddress,
  stripUnitDetails,
} from "@/lib/addressNormalize";

export type Property = Tables<"properties">;

// Tokens genéricos (tipo de via e títulos) — úteis para conferência, mas
// ruins como termo principal de busca por serem pouco distintivos.
const GENERIC_TOKENS = new Set([
  "RUA", "AVENIDA", "ALAMEDA", "TRAVESSA", "PRACA", "LARGO", "ESTRADA",
  "RODOVIA", "VIADUTO", "MARGINAL", "DOUTOR", "DOUTORA", "PROFESSOR",
  "PROFESSORA", "SENADOR", "DEPUTADO", "PADRE", "SANTA", "SANTO", "SAO",
  "GENERAL", "CORONEL", "MARECHAL", "CAPITAO", "BRIGADEIRO", "CARDEAL",
  "PRESIDENTE", "ENGENHEIRO", "MINISTRO", "CONSELHEIRO", "DESEMBARGADOR",
  "BARAO", "VISCONDE", "MARQUES", "CONDE", "DUQUE", "DOM",
  "JARDIM", "PARQUE", "VILA", "CONJUNTO",
]);

function extractSearchTerms(address: string): { keywords: string[]; number: string | null } {
  const { tokens, number } = parseAddress(address);
  const distinctive = tokens.filter((t) => !GENERIC_TOKENS.has(t));
  return { keywords: distinctive.length > 0 ? distinctive : tokens, number };
}

/** Tokens canônicos de um endereço vindo do banco (que costuma ser abreviado). */
function canonicalTokensOf(addressValue: string): Set<string> {
  return new Set(
    stripUnitDetails(normalizeAddress(addressValue))
      .split(" ")
      .filter(Boolean)
      .map(canonicalToken)
  );
}

async function fetchPropertiesFromDatabase(keywords: string[], number: string | null) {
  if (keywords.length === 0) return [];

  // Termo principal: o mais longo (mais distintivo). Busca no banco com TODAS
  // as grafias equivalentes ("CARDEAL" também procura "CARD").
  const sortedKeywords = [...keywords].sort((a, b) => b.length - a.length);
  const primaryKeyword = sortedKeywords[0];
  const orFilter = tokenVariants(primaryKeyword)
    .map((v) => `address.ilike.%${v}%`)
    .join(",");

  const { data, error } = await supabase
    .from("properties")
    .select("*")
    .or(orFilter)
    .order("year", { ascending: false })
    .limit(1000);

  if (error) throw error;

  let results = data || [];

  // Confere os demais tokens comparando formas canônicas (abreviação = extenso).
  if (sortedKeywords.length > 1) {
    const otherKeywords = sortedKeywords.slice(1);
    results = results.filter((p) => {
      const dbTokens = canonicalTokensOf(p.address);
      return otherKeywords.every((kw) => dbTokens.has(canonicalToken(kw)));
    });
  }

  // Se um número específico foi informado, retorna SOMENTE correspondências exatas.
  if (number && results.length > 0) {
    const wanted = canonicalToken(number);
    const exact = results.filter((p) => parseAddress(p.address).number === wanted);
    if (exact.length > 0) {
      exact.sort((a, b) => (b.year || 0) - (a.year || 0));
      return exact;
    }
    return [];
  }

  return results;
}



export async function searchProperties(address: string): Promise<Property[]> {
  if (!address.trim()) return [];

  const { keywords, number } = extractSearchTerms(address);

  // Always use keyword-based search:
  // - No number → returns ALL properties on that street.
  // - With number → returns only exact-number matches (handled inside fetchPropertiesFromDatabase).
  const cachedResults = await fetchPropertiesFromDatabase(keywords, number);

  if (cachedResults.length > 0) {
    return cachedResults;
  }

  // If the user typed an exact house number and we have no match in the DB,
  // return empty instead of falling back to scraped/mock data.
  if (number) return [];

  const { data, error } = await supabase.functions.invoke("scrape-properties", {
    body: { query: address },
  });

  if (error) throw error;
  return Array.isArray(data?.properties) ? (data.properties as Property[]) : [];
}


async function tryDirectSearch(address: string): Promise<Property[]> {
  const normalized = address
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[.,]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const { data, error } = await supabase
    .from("properties")
    .select("*")
    .ilike("address", `${normalized}%`)
    .order("year", { ascending: false })
    .limit(1000);

  if (error || !data || data.length === 0) return [];
  return data;
}

export async function saveEvaluation(evaluation: {
  address: string;
  selected_property_ids: string[];
  sale: { min: number; avg: number; max: number };
  perSqm: { min: number; avg: number; max: number };
  rent: { min: number; avg: number; max: number };
}) {
  const { error } = await supabase.from("evaluations").insert({
    address: evaluation.address,
    selected_property_ids: evaluation.selected_property_ids,
    sale_min: evaluation.sale.min,
    sale_avg: evaluation.sale.avg,
    sale_max: evaluation.sale.max,
    per_sqm_min: evaluation.perSqm.min,
    per_sqm_avg: evaluation.perSqm.avg,
    per_sqm_max: evaluation.perSqm.max,
    rent_min: evaluation.rent.min,
    rent_avg: evaluation.rent.avg,
    rent_max: evaluation.rent.max,
  });

  if (error) throw error;
}

export async function getEvaluationHistory() {
  const { data, error } = await supabase
    .from("evaluations")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(20);

  if (error) throw error;
  return data || [];
}
