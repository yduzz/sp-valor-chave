import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

export type Property = Tables<"properties">;

const STREET_PREFIXES = new Set([
  "RUA", "R", "AVENIDA", "AV", "ALAMEDA", "AL", "TRAVESSA", "TV", "TRAV",
  "PRACA", "PCA", "LARGO", "LG", "ESTRADA", "EST", "RODOVIA", "ROD",
  "DOUTOR", "DR", "PROFESSOR", "PROF", "SENADOR", "SEN", "PADRE", "PE",
  "SANTA", "STA", "SANTO", "STO", "GENERAL", "GAL", "CORONEL", "CEL",
  "MARECHAL", "MAL", "CARDEAL", "CARD", "PRESIDENTE", "PRES",
  "ENGENHEIRO", "ENG", "BARAO", "VISCONDE", "CONDE", "DUQUE", "DOM",
  "SAO", "VILA", "JARDIM", "JD", "PARQUE", "PQ",
]);

function extractSearchTerms(address: string): { keywords: string[]; number: string | null } {
  const primarySegment = address.split(",")[0].trim();
  // Extract trailing house number
  const numberMatch = primarySegment.match(/\s+(\d+[A-Za-z0-9/-]*)\s*$/);
  const number = numberMatch ? numberMatch[1] : null;
  const streetPart = primarySegment.replace(/\s+\d+[A-Za-z0-9/-]*\s*$/, "").trim() || primarySegment;

  // Normalize and extract distinctive keywords (skip common prefixes/abbreviations)
  const words = streetPart
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[.,]/g, " ")
    .split(/\s+/)
    .filter(w => w.length >= 2);

  const keywords = words.filter(w => !STREET_PREFIXES.has(w));
  // If all words were prefixes, use all of them
  return { keywords: keywords.length > 0 ? keywords : words, number };
}

async function fetchPropertiesFromDatabase(keywords: string[], number: string | null) {
  // Search using the most distinctive keyword(s)
  // Use the longest keyword as primary search term for best specificity
  const sortedKeywords = [...keywords].sort((a, b) => b.length - a.length);
  const primaryKeyword = sortedKeywords[0];

  let query = supabase
    .from("properties")
    .select("*")
    .ilike("address", `%${primaryKeyword}%`)
    .order("year", { ascending: false })
    .limit(1000);

  const { data, error } = await query;
  if (error) throw error;

  let results = data || [];

  // Filter by additional keywords for precision
  if (sortedKeywords.length > 1) {
    const otherKeywords = sortedKeywords.slice(1);
    results = results.filter((p) => {
      const addrUpper = p.address.toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      return otherKeywords.every(kw => addrUpper.includes(kw));
    });
  }

  // If a specific number was provided, prioritize exact matches
  if (number && results.length > 0) {
    const exactMatches = results.filter((p) => {
      const addrUpper = p.address.toUpperCase();
      return addrUpper.includes(` ${number} `) ||
             addrUpper.includes(` ${number},`) ||
             addrUpper.endsWith(` ${number}`) ||
             // Match number right after street name tokens
             new RegExp(`\\b${number}\\b`).test(addrUpper);
    });

    if (exactMatches.length > 0) {
      return exactMatches;
    }
  }

  return results;
}

export async function searchProperties(address: string): Promise<Property[]> {
  if (!address.trim()) return [];

  const { keywords, number } = extractSearchTerms(address);
  const cachedResults = await fetchPropertiesFromDatabase(keywords, number);

  if (cachedResults.length > 0) {
    return cachedResults;
  }

  const { data, error } = await supabase.functions.invoke("scrape-properties", {
    body: { query: address },
  });

  if (error) throw error;
  return Array.isArray(data?.properties) ? (data.properties as Property[]) : [];
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
