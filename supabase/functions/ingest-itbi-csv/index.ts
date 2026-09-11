import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const BUCKET = "itbi-staging";
const SOURCE = "prefeitura-sp";
const BATCH_SIZE = 1000;

const COLS = [
  "address", "neighborhood", "area", "venal_value", "property_type", "year",
  "price_per_sqm", "transaction_value", "transaction_value_full", "proportion_pct",
  "matricula", "transaction_date", "venal_reference",
] as const;

const NUMERIC = new Set([
  "area", "venal_value", "year", "price_per_sqm", "transaction_value",
  "transaction_value_full", "proportion_pct", "venal_reference",
]);

/** Divide uma linha CSV respeitando aspas duplas escapadas (""). */
function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++; } else quoted = false;
      } else cur += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") { out.push(cur); cur = ""; }
    else cur += ch;
  }
  out.push(cur);
  return out;
}

// deno-lint-ignore no-explicit-any
function toRow(values: string[], importId: string): Record<string, any> | null {
  // deno-lint-ignore no-explicit-any
  const row: Record<string, any> = { import_id: importId };
  COLS.forEach((col, i) => {
    const raw = values[i] ?? "";
    if (raw === "") { row[col] = null; return; }
    row[col] = NUMERIC.has(col) ? Number(raw) : raw;
  });
  if (!row.address || row.year == null || Number.isNaN(row.year)) return null;
  if (row.venal_value == null || Number.isNaN(row.venal_value)) row.venal_value = 0;
  return row;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    const body = await req.json();
    const year = Number(body?.year);
    const path: string = body?.path ?? `${year}.csv`;
    const sourceUrl: string | null = body?.source_url ?? null;
    if (!Number.isInteger(year)) return json({ error: "Informe { year }" }, 400);

    const importId = crypto.randomUUID();
    const startedAt = new Date().toISOString();
    await supabase.from("itbi_imports").upsert({
      year, source: SOURCE, status: "running", format: "csv", url: sourceUrl ?? `${BUCKET}/${path}`,
      started_at: startedAt, finished_at: null, error: null, import_id: importId,
      records_found: 0, records_imported: 0, records_rejected: 0,
    }, { onConflict: "year,source" });

    const { data: file, error: dlError } = await supabase.storage.from(BUCKET).download(path);
    if (dlError || !file) throw new Error(`Falha ao ler ${BUCKET}/${path}: ${dlError?.message}`);

    const fileSize = file.size;
    const reader = file.stream().pipeThrough(new TextDecoderStream()).getReader();

    let carry = "";
    let headerSeen = false;
    let found = 0;
    let inserted = 0;
    let rejected = 0;
    // deno-lint-ignore no-explicit-any
    let batch: Record<string, any>[] = [];

    const flush = async () => {
      if (!batch.length) return;
      const { error } = await supabase.from("properties").insert(batch);
      if (error) throw new Error(`Falha ao inserir lote de ${year}: ${error.message}`);
      inserted += batch.length;
      batch = [];
    };

    const handleLine = async (line: string) => {
      if (!line) return;
      if (!headerSeen) { headerSeen = true; return; }
      found++;
      const row = toRow(splitCsvLine(line), importId);
      if (!row) { rejected++; return; }
      batch.push(row);
      if (batch.length >= BATCH_SIZE) await flush();
    };

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        carry += value;
        let idx: number;
        while ((idx = carry.indexOf("\n")) >= 0) {
          const line = carry.slice(0, idx).replace(/\r$/, "");
          carry = carry.slice(idx + 1);
          await handleLine(line);
        }
      }
      await handleLine(carry.replace(/\r$/, ""));
      await flush();
    } catch (insertError) {
      // Rollback do lote parcial: dados antigos do ano permanecem intactos.
      await supabase.from("properties").delete().eq("year", year).eq("import_id", importId);
      throw insertError;
    }

    if (inserted === 0) throw new Error("Nenhum registro válido no CSV");

    // Troca segura: remove os registros antigos do ano só após a carga completa.
    await supabase.from("properties").delete().eq("year", year).neq("import_id", importId);
    await supabase.from("properties").delete().eq("year", year).is("import_id", null);

    await supabase.from("itbi_imports").upsert({
      year, source: SOURCE, status: "success", format: "csv",
      url: sourceUrl ?? `${BUCKET}/${path}`, started_at: startedAt,
      finished_at: new Date().toISOString(), records_found: found, records_imported: inserted,
      records_rejected: rejected, file_size: fileSize, error: null, import_id: importId,
    }, { onConflict: "year,source" });

    return json({ success: true, year, found, imported: inserted, rejected });
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    try {
      const body = { status: "failed", error, finished_at: new Date().toISOString() };
      const y = Number((await req.clone().json())?.year);
      if (Number.isInteger(y)) {
        await supabase.from("itbi_imports").update(body).eq("year", y).eq("source", SOURCE);
      }
    } catch (_) { /* corpo já consumido */ }
    return json({ success: false, error }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
