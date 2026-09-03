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

const PAGE_SIZE = 1000;

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

    const searchTerms = buildSearchTerms(query);
    const allResults: any[] = [];

    // Supabase/PostgREST pagina em blocos. Não existe mais limite artificial
    // de 40 ou 10.000 resultados: continua até a última página da base.
    for (const term of searchTerms) {
      for (let from = 0; ; from += PAGE_SIZE) {
        const { data, error } = await supabase
          .from("properties")
          .select("*")
          .ilike("address", `%${term}%`)
          .order("transaction_date", { ascending: false, nullsFirst: false })
          .range(from, from + PAGE_SIZE - 1);

        if (error) throw error;
        if (!data || data.length === 0) break;

        allResults.push(...data);
        if (data.length < PAGE_SIZE) break;
      }
    }

    // O mesmo registro pode aparecer em mais de um termo de busca.
    const seen = new Set<string>();
    const properties = allResults.filter((p) => {
      const key = String(p.id);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    return json({
      properties,
      total: properties.length,
      message: `${properties.length} transação(ões) encontrada(s).`,
    });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Erro inesperado." }, 500);
  }
});

function buildSearchTerms(query: string): string[] {
  const primarySegment = query.split(",")[0].trim();
  const streetOnly = primarySegment.replace(/\s+\d+[A-Za-z0-9/-]*\s*$/, "").trim();

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
