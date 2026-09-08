import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import * as XLSX from "npm:xlsx@0.18.5";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Fontes oficiais da Prefeitura de São Paulo (guias de ITBI pagas).
const KNOWN_URLS: Record<number, string> = {
  2006: "https://www.prefeitura.sp.gov.br/cidade/secretarias/upload/fazenda/arquivos/itbi/guias_de_itbi_pagas_2006.xlsx",
  2007: "https://www.prefeitura.sp.gov.br/cidade/secretarias/upload/fazenda/arquivos/itbi/guias_de_itbi_pagas_2007.xlsx",
  2008: "https://www.prefeitura.sp.gov.br/cidade/secretarias/upload/fazenda/arquivos/itbi/guias_de_itbi_pagas_2008.xlsx",
  2009: "https://www.prefeitura.sp.gov.br/cidade/secretarias/upload/fazenda/arquivos/itbi/guias_de_itbi_pagas_2009.xlsx",
  2010: "https://www.prefeitura.sp.gov.br/cidade/secretarias/upload/fazenda/arquivos/itbi/guias_de_itbi_pagas_2010.xlsx",
  2011: "https://www.prefeitura.sp.gov.br/cidade/secretarias/upload/fazenda/arquivos/itbi/guias_de_itbi_pagas_2011.xlsx",
  2012: "https://www.prefeitura.sp.gov.br/cidade/secretarias/upload/fazenda/arquivos/itbi/guias_de_itbi_pagas_2012.xlsx",
  2013: "https://www.prefeitura.sp.gov.br/cidade/secretarias/upload/fazenda/arquivos/itbi/guias_de_itbi_pagas_2013.xlsx",
  2014: "https://www.prefeitura.sp.gov.br/cidade/secretarias/upload/fazenda/arquivos/itbi/guias_de_itbi_pagas_2014.xlsx",
  2015: "https://www.prefeitura.sp.gov.br/cidade/secretarias/upload/fazenda/arquivos/itbi/guias_de_itbi_pagas_2015.xlsx",
  2016: "https://www.prefeitura.sp.gov.br/cidade/secretarias/upload/fazenda/arquivos/itbi/guias_de_itbi_pagas_2016.xlsx",
  2017: "https://www.prefeitura.sp.gov.br/cidade/secretarias/upload/fazenda/arquivos/itbi/guias_de_itbi_pagas_2017.xlsx",
  2018: "https://www.prefeitura.sp.gov.br/cidade/secretarias/upload/fazenda/arquivos/itbi/guias_de_itbi_pagas_2018.xlsx",
  2019: "https://www.prefeitura.sp.gov.br/cidade/secretarias/upload/fazenda/arquivos/itbi/ITBI_Setembro_2022/GUIAS_DE_ITBI_PAGAS_(2019).xlsx",
  2020: "https://www.prefeitura.sp.gov.br/cidade/secretarias/upload/fazenda/arquivos/itbi/ITBI_Setembro_2022/GUIAS_DE_ITBI_PAGAS_(2020).xlsx",
  2021: "https://www.prefeitura.sp.gov.br/cidade/secretarias/upload/fazenda/arquivos/itbi/ITBI_Setembro_2022/GUIAS_DE_ITBI_PAGAS_(2021).xlsx",
  2022: "https://www.prefeitura.sp.gov.br/cidade/secretarias/upload/fazenda/arquivos/XLSX/GUIAS_DE_ITBI_PAGAS_12-2022.xlsx",
  2023: "https://www.prefeitura.sp.gov.br/cidade/secretarias/upload/fazenda/arquivos/XLSX/GUIAS-DE-ITBI-PAGAS-2023.xlsx",
  2024: "https://prefeitura.sp.gov.br/cidade/secretarias/upload/fazenda/arquivos/itbi/GUIAS-DE-ITBI-PAGAS-2024.xlsx",
  2025: "https://prefeitura.sp.gov.br/cidade/secretarias/upload/fazenda/arquivos/itbi/GUIAS%20DE%20ITBI%20PAGAS%20%2828012026%29%20XLS.xlsx",
  2026: "https://www2.prefeitura.sp.gov.br/documents/d/fazenda/guias-de-itbi-pagas-27082026-xls-xlsx",
};

const FIRST_YEAR = 2006;
const LAST_YEAR = 2026;
const SOURCE = "prefeitura-sp";
const BATCH_SIZE = 500;

// Fallback ODS: mesma URL oficial com a extensão .ods (formato alternativo
// publicado pela Prefeitura). Só é tentado se o XLSX falhar.
function odsFallback(url: string): string | null {
  if (/\.xlsx$/i.test(url)) return url.replace(/\.xlsx$/i, ".ods");
  if (/xls-xlsx$/i.test(url)) return url.replace(/xls-xlsx$/i, "xls-ods");
  if (/XLS\.xlsx$/i.test(url)) return url.replace(/XLS\.xlsx$/i, "ODS.ods");
  return null;
}

interface Row {
  address: string;
  neighborhood: string | null;
  area: number | null;
  venal_value: number;
  property_type: string | null;
  year: number;
  price_per_sqm: number | null;
  transaction_value: number | null;
  transaction_value_full: number | null;
  proportion_pct: number | null;
  matricula: string | null;
  transaction_date: string | null;
  venal_reference: number | null;
}

function num(v: unknown): number | null {
  if (v == null || v === "") return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const s = String(v).replace(/[R$\s]/g, "");
  const n = Number(s.includes(",") ? s.replace(/\./g, "").replace(",", ".") : s);
  return Number.isFinite(n) ? n : null;
}

function toDate(v: unknown): string | null {
  if (v == null || v === "") return null;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "number" && v > 20000 && v < 80000) {
    return new Date(Date.UTC(1899, 11, 30) + v * 86400000).toISOString().slice(0, 10);
  }
  const m = String(v).match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  const iso = String(v).match(/^(\d{4})-(\d{2})-(\d{2})/);
  return iso ? iso[0] : null;
}

function fullValue(transaction: number | null, proportion: number | null): number | null {
  if (!transaction || transaction <= 0) return null;
  if (proportion == null || proportion < 1 || proportion >= 99.5) return transaction;
  return Math.round((transaction / (proportion / 100)) * 100) / 100;
}

async function sha256(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, "0")).join("");
}

// deno-lint-ignore no-explicit-any
type Supa = any;

async function upsertImport(supabase: Supa, year: number, patch: Record<string, unknown>) {
  const { error } = await supabase
    .from("itbi_imports")
    .upsert({ year, source: SOURCE, ...patch }, { onConflict: "year,source" });
  if (error) console.error(`itbi_imports upsert ${year}: ${error.message}`);
}

async function download(url: string): Promise<Uint8Array> {
  const resp = await fetch(url, { signal: AbortSignal.timeout(180_000) });
  if (!resp.ok) throw new Error(`HTTP ${resp.status} em ${url}`);
  return new Uint8Array(await resp.arrayBuffer());
}

interface YearOutcome {
  year: number;
  status: "imported" | "skipped" | "failed";
  format?: string;
  found?: number;
  imported?: number;
  rejected?: number;
  error?: string;
}

async function importYear(supabase: Supa, year: number, force: boolean): Promise<YearOutcome> {
  const xlsxUrl = KNOWN_URLS[year];
  if (!xlsxUrl) return { year, status: "failed", error: "URL oficial não cadastrada" };

  const { count: existingCount } = await supabase
    .from("properties")
    .select("*", { count: "exact", head: true })
    .eq("year", year);

  const { data: previous } = await supabase
    .from("itbi_imports")
    .select("status")
    .eq("year", year)
    .eq("source", SOURCE)
    .maybeSingle();

  const alreadyDone = (existingCount ?? 0) > 0 && previous?.status === "success";
  if (!force && alreadyDone) return { year, status: "skipped", imported: 0 };

  const startedAt = new Date().toISOString();
  await upsertImport(supabase, year, {
    status: "running", format: null, url: xlsxUrl, started_at: startedAt,
    finished_at: null, error: null, records_found: 0, records_imported: 0, records_rejected: 0,
  });

  const attempts: Array<{ format: string; url: string }> = [{ format: "xlsx", url: xlsxUrl }];
  const ods = odsFallback(xlsxUrl);
  if (ods) attempts.push({ format: "ods", url: ods });

  let buf: Uint8Array | null = null;
  let used: { format: string; url: string } | null = null;
  const attemptErrors: string[] = [];

  for (const attempt of attempts) {
    try {
      buf = await download(attempt.url);
      used = attempt;
      break;
    } catch (e) {
      attemptErrors.push(`${attempt.format}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  if (!buf || !used) {
    const error = `Download falhou — ${attemptErrors.join(" | ")}`;
    await upsertImport(supabase, year, {
      status: "failed", started_at: startedAt, finished_at: new Date().toISOString(),
      error, details: { attempts: attemptErrors },
    });
    return { year, status: "failed", error };
  }

  try {
    const fileHash = await sha256(buf);
    const wb = XLSX.read(buf, { type: "array", cellDates: true });

    let found = 0;
    const rows: Row[] = [];
    for (const name of wb.SheetNames) {
      if (/LEGENDA|EXPLIC|TABELA|PADR/i.test(name)) continue;
      const parsed = parseSheet(wb.Sheets[name], year);
      found += parsed.found;
      rows.push(...parsed.rows);
    }
    const rejected = found - rows.length;

    if (rows.length === 0) {
      const error = "Nenhum registro válido encontrado no arquivo";
      await upsertImport(supabase, year, {
        status: "failed", format: used.format, url: used.url, started_at: startedAt,
        finished_at: new Date().toISOString(), records_found: found, records_rejected: rejected,
        file_size: buf.byteLength, file_hash: fileHash, error,
      });
      return { year, status: "failed", format: used.format, found, error };
    }

    // Substituição atômica por ano: só apaga depois de ter os registros novos em memória.
    const { error: deleteError } = await supabase.from("properties").delete().eq("year", year);
    if (deleteError) throw new Error(`Falha ao limpar ${year}: ${deleteError.message}`);

    let inserted = 0;
    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
      const batch = rows.slice(i, i + BATCH_SIZE);
      const { error } = await supabase.from("properties").insert(batch);
      if (error) throw new Error(`Falha ao inserir lote ${i}-${i + batch.length} de ${year}: ${error.message}`);
      inserted += batch.length;
    }

    await upsertImport(supabase, year, {
      status: "success", format: used.format, url: used.url, started_at: startedAt,
      finished_at: new Date().toISOString(), records_found: found, records_imported: inserted,
      records_rejected: rejected, file_size: buf.byteLength, file_hash: fileHash, error: null,
      details: { sheets: wb.SheetNames, attempts: attemptErrors },
    });

    return { year, status: "imported", format: used.format, found, imported: inserted, rejected };
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    await upsertImport(supabase, year, {
      status: "failed", format: used.format, url: used.url, started_at: startedAt,
      finished_at: new Date().toISOString(), error,
    });
    return { year, status: "failed", format: used.format, error };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  let force = false;
  let onlyYear: number | null = null;
  let retryFailed = false;
  let maxYears = 3;
  try {
    const body = req.method === "POST" ? await req.json() : null;
    force = body?.force === true;
    onlyYear = body?.year != null ? Number(body.year) : null;
    retryFailed = body?.retry_failed === true;
    if (body?.max_years != null) maxYears = Math.max(1, Math.min(21, Number(body.max_years)));
  } catch (_) { /* corpo opcional */ }

  try {
    let years: number[] = [];
    for (let y = FIRST_YEAR; y <= LAST_YEAR; y++) years.push(y);

    if (onlyYear != null) {
      years = years.filter(y => y === onlyYear);
      if (!years.length) return json({ error: `Ano ${onlyYear} fora do intervalo ${FIRST_YEAR}-${LAST_YEAR}` }, 400);
    } else if (retryFailed) {
      const { data } = await supabase
        .from("itbi_imports").select("year").eq("source", SOURCE).eq("status", "failed");
      const failed = new Set((data ?? []).map(r => Number(r.year)));
      years = years.filter(y => failed.has(y));
    }

    const results: YearOutcome[] = [];
    let processed = 0;

    // Um ano por vez, com limite por execução para respeitar memória/tempo.
    for (const year of years) {
      if (onlyYear == null && processed >= maxYears) break;
      const outcome = await importYear(supabase, year, force);
      results.push(outcome);
      if (outcome.status !== "skipped") processed++;
    }

    const failures = results.filter(r => r.status === "failed");
    return json({
      success: failures.length === 0,
      range: [FIRST_YEAR, LAST_YEAR],
      processed,
      remaining: years.length - results.length,
      results,
      failures: failures.map(f => ({ year: f.year, error: f.error })),
    }, failures.length ? 207 : 200);
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Erro inesperado" }, 500);
  }
});

function normalizeHeader(value: unknown): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .trim();
}

function parseSheet(ws: XLSX.WorkSheet, year: number): { rows: Row[]; found: number } {
  const data: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });
  if (!data.length) return { rows: [], found: 0 };

  // Cabeçalho variável entre os anos: procura nas primeiras linhas.
  let headerIdx = -1;
  const map: Record<string, number> = {};

  for (let i = 0; i < Math.min(25, data.length); i++) {
    const cells = (data[i] || []).map(normalizeHeader);
    if (!cells.some(c => c.includes("LOGRADOURO") || c.includes("NOME DO LOGRADOURO"))) continue;

    headerIdx = i;
    cells.forEach((h, idx) => {
      if (!h) return;
      if (h.includes("LOGRADOURO") && !h.includes("NUMERO")) map.logradouro ??= idx;
      else if (h === "NUMERO" || h === "N" || h === "NO" || h.includes("NUMERO DO IMOVEL")) map.numero ??= idx;
      else if (h.includes("COMPLEMENTO")) map.complemento ??= idx;
      else if (h.includes("BAIRRO")) map.bairro ??= idx;
      else if (h.includes("AREA") && (h.includes("CONSTR") || h.includes("TERRENO") || map.area === undefined)) map.area ??= idx;
      else if (h.includes("VENAL") && h.includes("PROPORC")) map.venal ??= idx;
      else if (h.includes("VENAL") && map.venal === undefined) map.venal = idx;
      else if ((h.includes("DESCR") && h.includes("USO")) || h.includes("TIPO DO IMOVEL") || h.includes("USO DO IMOVEL")) map.tipo ??= idx;
      else if (h.includes("TRANSAC") && h.includes("VALOR")) map.transacao ??= idx;
      else if (h.includes("DATA") && (h.includes("TRANSAC") || h.includes("QUITA") || h.includes("PAGAMENTO"))) map.data ??= idx;
      else if (h.includes("PROPOR")) map.proporcao ??= idx;
      else if (h.includes("MATR")) map.matricula ??= idx;
      else if ((h.includes("VALOR") && h.includes("REFER")) || h.includes("VVR")) map.vvr ??= idx;
    });
    break;
  }

  // Estrutura posicional conhecida (arquivos sem cabeçalho detectável).
  if (headerIdx < 0 || map.logradouro === undefined) {
    return parsePositional(data, year);
  }

  const rows: Row[] = [];
  let found = 0;
  const get = (v: unknown[], key: string) => (map[key] !== undefined ? v[map[key]] : null);

  for (let i = headerIdx + 1; i < data.length; i++) {
    const v = data[i];
    if (!v || v.length < 3) continue;

    const logr = String(get(v, "logradouro") ?? "").trim();
    if (!logr || /^LOGRADOURO$/i.test(logr)) continue;
    found++;

    const numero = String(get(v, "numero") ?? "").trim();
    const complemento = String(get(v, "complemento") ?? "").trim();
    const bairro = String(get(v, "bairro") ?? "").trim() || null;
    const area = num(get(v, "area"));
    const venal = num(get(v, "venal")) ?? 0;
    const transacao = num(get(v, "transacao"));
    const proporcao = num(get(v, "proporcao"));
    const matricula = String(get(v, "matricula") ?? "").trim() || null;
    const transactionDate = toDate(get(v, "data"));
    const venalReference = num(get(v, "vvr"));
    const transactionFull = fullValue(transacao, proporcao);

    if (venal <= 0 && !transactionFull) continue;

    const base = transactionFull ?? venal;
    const addressParts = [logr];
    if (numero && numero !== "0" && numero !== "99999") addressParts.push(numero);
    if (complemento) addressParts.push(complemento);

    rows.push({
      address: addressParts.join(" ").slice(0, 500),
      neighborhood: bairro,
      area,
      venal_value: venal,
      property_type: String(get(v, "tipo") ?? "").trim() || null,
      year,
      price_per_sqm: area && area > 0 ? Math.round((base / area) * 100) / 100 : null,
      transaction_value: transacao,
      transaction_value_full: transactionFull,
      proportion_pct: proporcao,
      matricula,
      transaction_date: transactionDate,
      venal_reference: venalReference,
    });
  }

  return { rows, found };
}

function parsePositional(data: unknown[][], year: number): { rows: Row[]; found: number } {
  const rows: Row[] = [];
  let found = 0;
  for (const v of data) {
    if (!v || v.length < 20) continue;
    const logr = String(v[1] ?? "").trim();
    if (!logr) continue;
    found++;
    const numero = v[2] != null ? String(Math.floor(Number(v[2])) || v[2]).trim() : "";
    const complemento = String(v[3] ?? "").trim();
    const bairro = String(v[4] ?? "").trim() || null;
    const venal = Number(v[12]) || 0;
    const transacao = num(v[8]);
    const transactionDate = toDate(v[9]);
    const venalReference = num(v[10]);
    const proporcao = num(v[11]);
    const matricula = String(v[17] ?? "").trim() || null;
    const transactionFull = fullValue(transacao, proporcao);
    if (venal <= 0 && !transactionFull) continue;
    const area = Number(v[22]) || null;
    const tipo = String(v[24] ?? "").trim() || null;
    const base = transactionFull ?? venal;
    const addressParts = [logr];
    if (numero && numero !== "0" && numero !== "99999") addressParts.push(numero);
    if (complemento) addressParts.push(complemento);

    rows.push({
      address: addressParts.join(" ").slice(0, 500), neighborhood: bairro, area,
      venal_value: venal, property_type: tipo, year,
      price_per_sqm: area && area > 0 ? Math.round((base / area) * 100) / 100 : null,
      transaction_value: transacao, transaction_value_full: transactionFull,
      proportion_pct: proporcao, matricula, transaction_date: transactionDate,
      venal_reference: venalReference,
    });
  }
  return { rows, found };
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
