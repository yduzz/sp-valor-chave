import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

export type Property = Tables<"properties">;

function extractSearchTerms(address: string): { street: string; number: string | null } {
  const primarySegment = address.split(",")[0].trim();
  // Extract trailing house number
  const numberMatch = primarySegment.match(/\s+(\d+[A-Za-z0-9/-]*)\s*$/);
  const number = numberMatch ? numberMatch[1] : null;
  const street = primarySegment.replace(/\s+\d+[A-Za-z0-9/-]*\s*$/, "").trim() || primarySegment;
  return { street, number };
}

async function fetchPropertiesFromDatabase(street: string, number: string | null) {
  let query = supabase
    .from("properties")
    .select("*")
    .ilike("address", `%${street}%`)
    .order("year", { ascending: false })
    .limit(200);

  const { data, error } = await query;
  if (error) throw error;
  
  let results = data || [];
  
  // If a specific number was provided, prioritize exact matches
  if (number && results.length > 0) {
    const exactMatches = results.filter((p) => {
      // Check if the address contains the exact number as a separate token
      const addressUpper = p.address.toUpperCase();
      const streetUpper = street.toUpperCase();
      const afterStreet = addressUpper.replace(streetUpper, "").trim();
      // Match the number at the start of what comes after the street name
      return afterStreet.startsWith(number) || 
             addressUpper.includes(` ${number} `) || 
             addressUpper.includes(` ${number},`) ||
             addressUpper.endsWith(` ${number}`);
    });
    
    if (exactMatches.length > 0) {
      return exactMatches;
    }
  }
  
  return results;
}

export async function searchProperties(address: string): Promise<Property[]> {
  if (!address.trim()) return [];

  const { street, number } = extractSearchTerms(address);
  const cachedResults = await fetchPropertiesFromDatabase(street, number);

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
