import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

export type Property = Tables<"properties">;

export async function searchProperties(address: string): Promise<Property[]> {
  // Extract just the street name for matching (remove neighborhood, city info from Nominatim)
  const streetName = address.split(",")[0].trim();
  
  const { data, error } = await supabase
    .from("properties")
    .select("*")
    .ilike("address", `%${streetName}%`)
    .order("year", { ascending: false });

  if (error) throw error;
  return data || [];
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
