import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const ABBREVIATIONS: Record<string, string> = {
  R: "RUA", AV: "AVENIDA", AL: "ALAMEDA", TV: "TRAVESSA",
  TRAV: "TRAVESSA", PCA: "PRACA", DR: "DOUTOR", PROF: "PROFESSOR",
  SEN: "SENADOR", PE: "PADRE", STA: "SANTA", STO: "SANTO",
  GAL: "GENERAL", CEL: "CORONEL", MAL: "MARECHAL", CARD: "CARDEAL",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { query } = await req.json().catch(() => ({ query: "" }));
    if (!query?.trim()) {
      return json({ error: "Informe um endereço." }, 400);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Build multiple search terms from the query
    const searchTerms = buildSearchTerms(query);
    let allResults: unknown[] = [];

    for (const term of searchTerms) {
      if (allResults.length >= 40) break;
      const { data } = await supabase
        .from("properties")
        .select("*")
        .ilike("address", `%${term}%`)
        .order("year", { ascending: false })
        .limit(40);
      if (data) allResults.push(...data);
    }

    // Deduplicate by id
    const seen = new Set<string>();
    const properties = allResults.filter((p: any) => {
      if (seen.has(p.id)) return false;
      seen.add(p.id);
      return true;
    }).slice(0, 40);

    return json({ properties, message: `${properties.length} transação(ões) encontrada(s).` });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Erro inesperado." }, 500);
  }
});

function buildSearchTerms(query: string): string[] {
  const stripped = query
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/,/g, " ").replace(/\s+/g, " ").trim();

  // Extract street name (first segment before comma in original)
  const primarySegment = query.split(",")[0].trim();
  // Remove trailing house number for broader match
  const streetOnly = primarySegment.replace(/\s+\d+[A-Za-z0-9/-]*\s*$/, "").trim();

  // Expand abbreviations
  const expanded = streetOnly.split(" ").map(w => {
    const upper = w.toUpperCase().replace(/\./g, "");
    return ABBREVIATIONS[upper] || w;
  }).join(" ");

  const terms = new Set<string>();
  terms.add(primarySegment);
  if (streetOnly !== primarySegment) terms.add(streetOnly);
  if (expanded !== streetOnly) terms.add(expanded);

  return [...terms].filter(t => t.length >= 3);
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
