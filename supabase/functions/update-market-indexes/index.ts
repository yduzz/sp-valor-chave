import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getSources } from "./sources/index.ts";
import { fetchWithMirror } from "./lib/http.ts";
import type { DiscoveredReport, ExtractedIndex, MarketSource } from "./sources/types.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const BUCKET = "market-reports";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

async function sha256(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function log(entry: Record<string, unknown>) {
  await supabase.from("market_update_logs").insert(entry);
}

async function processSource(source: MarketSource) {
  const start = Date.now();
  let imported = 0;
  let latestCompetence: string | null = null;
  const processed: string[] = [];

  try {
    const discovered = await source.discover();
    if (discovered.length === 0) {
      await log({
        source: source.id,
        status: "no_update",
        message: "Nenhum arquivo encontrado na publicação",
        duration_ms: Date.now() - start,
      });
      return { source: source.id, status: "no_update", imported: 0 };
    }

    for (const report of discovered) {
      const existing = await supabase
        .from("market_reports")
        .select("id, parsed")
        .eq("source_url", report.url)
        .maybeSingle();
      if (existing.data?.parsed) continue; // já processado: evita download duplicado

      const bytes = await download(report);
      if (!bytes) continue;

      const hash = await sha256(bytes);
      const byHash = await supabase
        .from("market_reports")
        .select("id, parsed")
        .eq("file_hash", hash)
        .maybeSingle();
      if (byHash.data?.parsed) continue; // conteúdo idêntico já importado

      const storagePath = `${source.id}/${hash.slice(0, 16)}-${
        (report.url.split("/").pop() ?? "arquivo").replace(/[^\w.\-]/g, "_")
      }`;
      await supabase.storage.from(BUCKET).upload(storagePath, bytes, {
        contentType: report.fileType === "pdf" ? "application/pdf" : "application/octet-stream",
        upsert: true,
      });

      const { data: reportRow } = await supabase
        .from("market_reports")
        .upsert(
          {
            source: source.id,
            competence: report.competence ?? null,
            title: report.title ?? null,
            source_url: report.url,
            file_type: report.fileType ?? null,
            file_hash: hash,
            storage_path: storagePath,
            file_size: bytes.byteLength,
            parsed: false,
          },
          { onConflict: "source_url" },
        )
        .select("id")
        .single();

      let rows: ExtractedIndex[] = [];
      try {
        rows = await source.extract(report, bytes);
      } catch (err) {
        await log({
          source: source.id,
          status: "parse_error",
          competence: report.competence ?? null,
          message: err instanceof Error ? err.message : String(err),
          details: { url: report.url },
          duration_ms: Date.now() - start,
        });
        continue;
      }

      if (rows.length > 0) {
        imported += await saveIndexes(source.id, rows, reportRow?.id ?? null);
        const maxComp = rows.map((r) => r.competence).sort().pop() ?? null;
        if (maxComp && (!latestCompetence || maxComp > latestCompetence)) latestCompetence = maxComp;
      }

      if (reportRow?.id) {
        await supabase.from("market_reports").update({ parsed: true }).eq("id", reportRow.id);
      }
      processed.push(report.url);
    }

    await log({
      source: source.id,
      status: imported > 0 ? "success" : "no_update",
      competence: latestCompetence,
      records_imported: imported,
      duration_ms: Date.now() - start,
      message: imported > 0 ? "Índices atualizados" : "Nenhuma nova competência",
      details: { files: processed },
    });

    return { source: source.id, status: imported > 0 ? "success" : "no_update", imported };
  } catch (err) {
    // Fonte indisponível não interrompe a plataforma nem as demais fontes.
    await log({
      source: source.id,
      status: "error",
      records_imported: imported,
      duration_ms: Date.now() - start,
      message: err instanceof Error ? err.message : String(err),
    });
    return { source: source.id, status: "error", imported };
  }
}

async function download(report: DiscoveredReport): Promise<Uint8Array | null> {
  try {
    const res = await fetchWithMirror(report.url, 120_000);
    return res?.bytes ?? null; // validação de integridade dentro do helper
  } catch {
    return null;
  }
}

async function saveIndexes(sourceId: string, rows: ExtractedIndex[], reportId: string | null) {
  let saved = 0;
  const payload = rows.map((r) => ({
    source: sourceId,
    competence: r.competence,
    city: r.city ?? null,
    neighborhood: r.neighborhood ?? null,
    property_type: r.property_type ?? null,
    avg_price_per_sqm: r.avg_price_per_sqm ?? null,
    monthly_variation: r.monthly_variation ?? null,
    yearly_variation: r.yearly_variation ?? null,
    metrics: r.metrics ?? {},
    report_id: reportId,
  }));

  for (let i = 0; i < payload.length; i += 500) {
    const batch = payload.slice(i, i + 500);
    // Histórico preservado: competências antigas nunca são apagadas.
    const { error } = await supabase.from("market_indexes").upsert(batch, {
      onConflict: "source,competence,city,neighborhood,property_type",
      ignoreDuplicates: true,
    });
    if (!error) saved += batch.length;
  }
  return saved;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  let ids: string[] | undefined;
  try {
    const body = await req.json();
    if (Array.isArray(body?.sources)) ids = body.sources;
  } catch {
    // sem corpo: executa todas as fontes
  }

  const results = [];
  for (const source of getSources(ids)) {
    results.push(await processSource(source));
  }

  return new Response(JSON.stringify({ success: true, results }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
