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
  const normalizedInput = address.replace(/[.,]/g, " ").replace(/\s+/g, " ").trim();
  // Extract trailing house number even when the UI formats it as "Rua X, 540".
  const numberMatch = normalizedInput.match(/\s+(\d+[A-Za-z0-9/-]*)\s*$/);
  const number = numberMatch ? numberMatch[1] : null;
  const streetPart = normalizedInput.replace(/\s+\d+[A-Za-z0-9/-]*\s*$/, "").trim() || normalizedInput;

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
  if (keywords.length === 0) return [];

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

  // If a specific number was provided, sort exact matches and nearby numbers to the top.
  if (number && results.length > 0) {
    const typedNumber = Number.parseInt(number, 10);
    const extractAddressNumber = (addressValue: string) => {
      const cleaned = addressValue
        .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
        .toUpperCase()
        .replace(/\s+(AP|APTO|APT|CJ|CASA|SALA|CONJ|BL|BLOCO|LJ|LOJA|SL|CS|LOTE|UNID|UNIDADE|VG|BOX|FLAT|STUDIO|N°|Nº|N\.?)\.?\s*.*/i, "")
        .replace(/[.,]/g, " ")
        .replace(/\s+/g, " ")
        .trim();
      const match = cleaned.match(/\s+(\d+)\s*$/);
      return match ? Number.parseInt(match[1], 10) : null;
    };

    const isNumberMatch = (p: typeof results[0]) => {
      const addrUpper = p.address.toUpperCase();
      return addrUpper.includes(` ${number} `) ||
             addrUpper.includes(` ${number},`) ||
             addrUpper.endsWith(` ${number}`) ||
             new RegExp(`\\b${number}\\b`).test(addrUpper);
    };

    results.sort((a, b) => {
      const aMatch = isNumberMatch(a) ? 0 : 1;
      const bMatch = isNumberMatch(b) ? 0 : 1;
      if (aMatch !== bMatch) return aMatch - bMatch;

      if (!Number.isNaN(typedNumber)) {
        const aNumber = extractAddressNumber(a.address);
        const bNumber = extractAddressNumber(b.address);
        const aDistance = aNumber === null ? Number.POSITIVE_INFINITY : Math.abs(aNumber - typedNumber);
        const bDistance = bNumber === null ? Number.POSITIVE_INFINITY : Math.abs(bNumber - typedNumber);
        if (aDistance !== bDistance) return aDistance - bDistance;
      }

      return (b.year || 0) - (a.year || 0);
    });
  }

  return results;
}

export async function searchProperties(address: string): Promise<Property[]> {
  if (!address.trim()) return [];

  // First try direct ilike search (works when address comes from DB autocomplete)
  const directResults = await tryDirectSearch(address);
  if (directResults.length > 0) return directResults;

  // Fallback to keyword-based search
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
