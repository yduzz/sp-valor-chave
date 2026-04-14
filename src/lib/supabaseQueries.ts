import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

export type Property = Tables<"properties">;

function extractStreetSearchTerm(address: string) {
  const primarySegment = address.split(",")[0].trim();
  const withoutTrailingNumber = primarySegment.replace(/\s+\d+[A-Za-z0-9/-]*.*$/, "").trim();

  return withoutTrailingNumber || primarySegment;
}

async function fetchPropertiesFromDatabase(searchTerm: string) {
  const { data, error } = await supabase
    .from("properties")
    .select("*")
    .ilike("address", `%${searchTerm}%`)
    .order("year", { ascending: false });

  if (error) throw error;
  return data || [];
}

export async function searchProperties(address: string): Promise<Property[]> {
  if (!address.trim()) return [];

  const streetSearchTerm = extractStreetSearchTerm(address);
  const cachedResults = await fetchPropertiesFromDatabase(streetSearchTerm);

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
