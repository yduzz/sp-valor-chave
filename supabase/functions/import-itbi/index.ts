import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import * as XLSX from "npm:xlsx@0.18.5";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// O servidor da Prefeitura bloqueia requisições sem User-Agent de navegador (HTTP 403).
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";

interface SourceEntry {
  xlsx: string;
  /** URL ODS oficial verificada. `null` = a Prefeitura não publica ODS para esse ano. */
  ods: string | null;
}

const LEGACY = "https://www.prefeitura.sp.gov.br/cidade/secretarias/upload/fazenda/arquivos/itbi";
const SET2022 = `${LEGACY}/ITBI_Setembro_2022`;

// Catálogo oficial de fontes (guias de ITBI pagas) — todas as URLs foram verificadas
// individualmente (HTTP 200/206). Nenhuma URL ODS foi inferida por troca de extensão:
// os testes mostraram que a Prefeitura não publica ODS para esses anos.
const SOURCES: Record<number, SourceEntry> = {
  2006: { xlsx: `${LEGACY}/guias_de_itbi_pagas_2006.xlsx`, ods: null },
  2007: { xlsx: `${LEGACY}/guias_de_itbi_pagas_2007.xlsx`, ods: null },
  2008: { xlsx: `${LEGACY}/guias_de_itbi_pagas_2008.xlsx`, ods: null },
  2009: { xlsx: `${LEGACY}/guias_de_itbi_pagas_2009.xlsx`, ods: null },
  2010: { xlsx: `${LEGACY}/guias_de_itbi_pagas_2010.xlsx`, ods: null },
  2011: { xlsx: `${LEGACY}/guias_de_itbi_pagas_2011.xlsx`, ods: null },
  2012: { xlsx: `${LEGACY}/guias_de_itbi_pagas_2012.xlsx`, ods: null },
  2013: { xlsx: `${LEGACY}/guias_de_itbi_pagas_2013.xlsx`, ods: null },
  2014: { xlsx: `${LEGACY}/guias_de_itbi_pagas_2014.xlsx`, ods: null },
  2015: { xlsx: `${LEGACY}/guias_de_itbi_pagas_2015.xlsx`, ods: null },
  2016: { xlsx: `${LEGACY}/guias_de_itbi_pagas_2016.xlsx`, ods: null },
  2017: { xlsx: `${LEGACY}/guias_de_itbi_pagas_2017.xlsx`, ods: null },
  2018: { xlsx: `${LEGACY}/guias_de_itbi_pagas_2018.xlsx`, ods: null },
  2019: { xlsx: `${SET2022}/GUIAS_DE_ITBI_PAGAS_(2019).xlsx`, ods: null },
  2020: { xlsx: `${SET2022}/GUIAS_DE_ITBI_PAGAS_(2020).xlsx`, ods: null },
  2021: { xlsx: `${SET2022}/GUIAS_DE_ITBI_PAGAS_(2021).xlsx`, ods: null },
  2022: {
    xlsx: "https://www.prefeitura.sp.gov.br/cidade/secretarias/upload/fazenda/arquivos/XLSX/GUIAS_DE_ITBI_PAGAS_12-2022.xlsx",
    ods: null,
  },
  2023: { xlsx: `${LEGACY}/GUIAS-DE-ITBI-PAGAS-2023.xlsx`, ods: null },
  2024: { xlsx: `${LEGACY}/GUIAS-DE-ITBI-PAGAS-2024.xlsx`, ods: null },
  2025: { xlsx: `${LEGACY}/GUIAS%20DE%20ITBI%20PAGAS%20%2828012026%29%20XLS.xlsx`, ods: null },
  2026: { xlsx: "https://www2.prefeitura.sp.gov.br/documents/d/fazenda/guias-de-itbi-pagas-27082026-xls-xlsx", ods: null },
};

const FIRST_YEAR = 2006;
const LAST_YEAR = 2026;
const SOURCE = "prefeitura-sp";
const BATCH_SIZE = 500;

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
  import_id: string;
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
  const digest = await crypto.subtle.digest("SHA-256", bytes.slice().buffer as ArrayBuffer);
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
  const resp = await fetch(url, {
    signal: AbortSignal.timeout(180_000),
    headers: { "User-Agent": USER_AGENT, "Accept": "*/*" },
  });
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
  const source = SOURCES[year];
  if (!source) return { year, status: "failed", error: "URL oficial não cadastrada" };

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

  const importId = crypto.randomUUID();
  const startedAt = new Date().toISOString();
  await upsertImport(supabase, year, {
    status: "running", format: null, url: source.xlsx, started_at: startedAt, import_id: importId,
    finished_at: null, error: null, records_found: 0, records_imported: 0, records_rejected: 0,
  });

  const attempts: Array<{ format: string; url: string }> = [{ format: "xlsx", url: source.xlsx }];
  if (source.ods) attempts.push({ format: "ods", url: source.ods });

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
    const bytes = buf;
    const fileSize = bytes.byteLength;
    const fileHash = await sha256(bytes);
    const wb = XLSX.read(bytes, { type: "array", cellDates: true });
    buf = null; // libera o buffer bruto: arquivos históricos passam de 20 MB

    let found = 0;
    let inserted = 0;
    const sheetNames = [...wb.SheetNames];

    // Insere em lotes durante o parse para não manter todas as linhas em memória.
    const sink = async (batch: Row[]) => {
      const { error } = await supabase.from("properties").insert(batch);
      if (error) throw new Error(`Falha ao inserir lote de ${year}: ${error.message}`);
      inserted += batch.length;
    };

    try {
      for (const name of sheetNames) {
        if (/LEGENDA|EXPLIC|TABELA|PADR/i.test(name)) continue;
        found += await parseSheet(wb.Sheets[name], year, importId, sink);
        delete wb.Sheets[name];
      }
    } catch (insertError) {
      // Rollback do lote parcial: dados antigos do ano permanecem intactos.
      await supabase.from("properties").delete().eq("year", year).eq("import_id", importId);
      throw insertError;
    }

    const rejected = Math.max(0, found - inserted);

    if (inserted === 0) {
      const error = "Nenhum registro válido encontrado no arquivo";
      await upsertImport(supabase, year, {
        status: "failed", format: used.format, url: used.url, started_at: startedAt,
        finished_at: new Date().toISOString(), records_found: found, records_rejected: rejected,
        file_size: fileSize, file_hash: fileHash, error,
      });
      return { year, status: "failed", format: used.format, found, error };
    }

    const { error: cleanupError } = await supabase
      .from("properties").delete().eq("year", year).neq("import_id", importId);
    if (cleanupError) console.error(`Limpeza de ${year} falhou: ${cleanupError.message}`);
    // Registros antigos sem import_id (importações anteriores) não são alcançados por `neq`.
    const { error: legacyCleanup } = await supabase
      .from("properties").delete().eq("year", year).is("import_id", null);
    if (legacyCleanup) console.error(`Limpeza legada de ${year} falhou: ${legacyCleanup.message}`);

    await upsertImport(supabase, year, {
      status: "success", format: used.format, url: used.url, started_at: startedAt,
      finished_at: new Date().toISOString(), records_found: found, records_imported: inserted,
      records_rejected: rejected, file_size: fileSize, file_hash: fileHash, error: null,
      import_id: importId,
      details: { sheets: sheetNames, attempts: attemptErrors },
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
  let dryRun = false;
  try {
    const body = req.method === "POST" ? await req.json() : null;
    force = body?.force === true;
    onlyYear = body?.year != null ? Number(body.year) : null;
    retryFailed = body?.retry_failed === true;
    dryRun = body?.dry_run === true;
    if (body?.max_years != null) maxYears = Math.max(1, Math.min(21, Number(body.max_years)));
  } catch (_) { /* corpo opcional */ }

  try {
    let years: number[] = [];
    for (let y = FIRST_YEAR; y <= LAST_YEAR; y++) years.push(y);

    // dry_run: apenas checa disponibilidade das fontes, sem tocar no banco.
    if (dryRun) {
      const checks = [];
      for (const y of (onlyYear != null ? years.filter(v => v === onlyYear) : years)) {
        const s = SOURCES[y];
        let status = 0;
        try {
          const r = await fetch(s.xlsx, {
            method: "GET",
            headers: { "User-Agent": USER_AGENT, Range: "bytes=0-200" },
            signal: AbortSignal.timeout(30_000),
          });
          status = r.status;
          await r.body?.cancel();
        } catch (_) { status = 0; }
        checks.push({ year: y, url: s.xlsx, ods: s.ods, http: status, ok: status >= 200 && status < 400 });
      }
      return json({ dry_run: true, checks });
    }

    if (onlyYear != null) {
      years = years.filter(y => y === onlyYear);
      if (!years.length) return json({ error: `Ano ${onlyYear} fora do intervalo ${FIRST_YEAR}-${LAST_YEAR}` }, 400);
    } else if (retryFailed) {
      const { data } = await supabase
        .from("itbi_imports").select("year").eq("source", SOURCE).eq("status", "failed");
      const failed = new Set((data ?? []).map((r: { year: number }) => Number(r.year)));
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

type Sink = (batch: Row[]) => Promise<void>;

/** Percorre a planilha linha a linha, sem materializar a matriz inteira. */
function* sheetRows(ws: XLSX.WorkSheet): Generator<unknown[]> {
  const ref = ws?.["!ref"];
  if (!ref) return;
  const range = XLSX.utils.decode_range(ref);
  for (let r = range.s.r; r <= range.e.r; r++) {
    const row: unknown[] = [];
    for (let c = range.s.c; c <= range.e.c; c++) {
      const cell = ws[XLSX.utils.encode_cell({ r, c })];
      row.push(cell ? (cell.v ?? null) : null);
    }
    yield row;
  }
}

/** Retorna o total de linhas encontradas; as válidas são entregues ao sink em lotes. */
async function parseSheet(ws: XLSX.WorkSheet, year: number, importId: string, sink: Sink): Promise<number> {
  // Cabeçalho variável entre os anos: procura nas primeiras linhas.
  const preface: unknown[][] = [];
  let header: string[] | null = null;
  const iterator = sheetRows(ws);

  for (const row of iterator) {
    const cells = row.map(normalizeHeader);
    if (cells.some(c => c.includes("LOGRADOURO"))) { header = cells; break; }
    preface.push(row);
    if (preface.length >= 25) break;
  }

  const map: Record<string, number> = {};
  if (header) {
    // Aliases em ordem de prioridade: o primeiro predicado que casar vence.
    const ALIASES: Record<string, Array<(h: string) => boolean>> = {
      logradouro: [h => h.includes("NOME DO LOGRADOURO"), h => h.includes("LOGRADOURO") && !h.includes("NUMERO")],
      numero: [h => h === "NUMERO" || h === "N" || h === "NO" || h === "N°", h => h.includes("NUMERO") && !h.includes("CADASTRO")],
      complemento: [h => h.includes("COMPLEMENTO")],
      bairro: [h => h.includes("BAIRRO")],
      area: [h => h.includes("AREA") && h.includes("CONSTR"), h => h.includes("AREA") && h.includes("TERRENO"), h => h.includes("AREA")],
      venal: [
        h => h.includes("VENAL") && h.includes("PROPORC"),
        h => h.includes("BASE DE CALCULO"),
        h => h.includes("VENAL"),
      ],
      vvr: [h => h.includes("VENAL") && h.includes("REFER") && !h.includes("PROPORC"), h => h.includes("VVR")],
      tipo: [h => h.includes("DESCR") && h.includes("USO"), h => h.includes("TIPO DO IMOVEL"), h => h.includes("USO")],
      transacao: [h => h.includes("VALOR") && h.includes("TRANSAC")],
      data: [h => h.includes("DATA") && h.includes("TRANSAC"), h => h.includes("DATA") && (h.includes("QUITA") || h.includes("PAGAMENTO"))],
      proporcao: [h => h.includes("PROPOR") && !h.includes("VENAL")],
      matricula: [h => h.includes("MATR")],
    };

    for (const [key, predicates] of Object.entries(ALIASES)) {
      for (const predicate of predicates) {
        const idx = header.findIndex(h => h && predicate(h));
        if (idx >= 0) { map[key] = idx; break; }
      }
    }
  }

  // Estrutura posicional conhecida (arquivos sem cabeçalho detectável).
  if (!header || map.logradouro === undefined) {
    return await parsePositional(sheetRows(ws), year, importId, sink);
  }

  let found = 0;
  let batch: Row[] = [];
  const get = (v: unknown[], key: string) => (map[key] !== undefined ? v[map[key]] : null);

  for (const v of iterator) {
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

    batch.push({
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
      import_id: importId,
    });

    if (batch.length >= BATCH_SIZE) { await sink(batch); batch = []; }
  }

  if (batch.length) await sink(batch);
  return found;
}

async function parsePositional(
  rows: Iterable<unknown[]>, year: number, importId: string, sink: Sink,
): Promise<number> {
  let found = 0;
  let batch: Row[] = [];
  for (const v of rows) {
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

    batch.push({
      address: addressParts.join(" ").slice(0, 500), neighborhood: bairro, area,
      venal_value: venal, property_type: tipo, year,
      price_per_sqm: area && area > 0 ? Math.round((base / area) * 100) / 100 : null,
      transaction_value: transacao, transaction_value_full: transactionFull,
      proportion_pct: proporcao, matricula, transaction_date: transactionDate,
      venal_reference: venalReference, import_id: importId,
    });

    if (batch.length >= BATCH_SIZE) { await sink(batch); batch = []; }
  }
  if (batch.length) await sink(batch);
  return found;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
