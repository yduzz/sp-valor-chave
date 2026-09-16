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

  // Quando o usuário informa o número, não limitamos primeiro os registros
  // por data. O número precisa participar da consulta antes do limite, para
  // que registros históricos do imóvel não sejam descartados pelos 1.000
  // registros mais recentes da mesma via.
  if (number) {
    const normalizedNumber = normalizeAddress(number);
    const numberVariants = [
      normalizedNumber,
      normalizedNumber.replace(/^0+/, "") || "0",
    ];

    const numberFilter = numberVariants
      .map((v) => `address.ilike.% ${v}`)
      .join(",");

    const { data, error } = await supabase
      .from("properties")
      .select("*")
      .or(`${orFilter},${numberFilter}`)
      .order("transaction_date", { ascending: false, nullsFirst: false })
      .limit(5000);

    if (error) throw error;

    let results = data || [];

    // O OR acima é propositalmente amplo; agora exigimos os tokens do
    // logradouro e o número exato em memória para evitar falsos positivos.
    results = results.filter((p) => {
      const parsed = parseAddress(p.address);
      const dbTokens = canonicalTokensOf(p.address);
      const streetMatches = sortedKeywords.every((kw) =>
        dbTokens.has(canonicalToken(kw))
      );
      return streetMatches && parsed.number === normalizedNumber;
    });

    return results;
  }

  const { data, error } = await supabase
    .from("properties")
    .select("*")
    .or(orFilter)
    .order("transaction_date", { ascending: false, nullsFirst: false })
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

  return results;
}

export async function searchProperties(address: string): Promise<Property[]> {
  if (!address.trim()) return [];

  const { keywords, number } = extractSearchTerms(address);

  // Always use keyword-based search:
  // - No number → returns properties on that street.
  // - With number → returns historical records for the exact property.
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
