import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import * as XLSX from "npm:xlsx@0.18.5";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const KNOWN_URLS: Record<number, string> = {
  2023: "https://prefeitura.sp.gov.br/cidade/secretarias/upload/fazenda/arquivos/itbi/GUIAS-DE-ITBI-PAGAS-2023.xlsx",
  2024: "https://prefeitura.sp.gov.br/cidade/secretarias/upload/fazenda/arquivos/itbi/GUIAS-DE-ITBI-PAGAS-2024.xlsx",
  2025: "https://prefeitura.sp.gov.br/cidade/secretarias/upload/fazenda/arquivos/itbi/GUIAS%20DE%20ITBI%20PAGAS%20%2828012026%29%20XLS.xlsx",
  2026: "https://prefeitura.sp.gov.br/documents/d/fazenda/guias-de-itbi-pagas-1-xlsx-1",
};
const ITBI_PAGE = "https://prefeitura.sp.gov.br/web/fazenda/w/itbi";

interface Source { year: number; url: string }
interface Row {
  address: string; neighborhood: string | null; area: number | null; venal_value: number;
  property_type: string | null; year: number; price_per_sqm: number | null;
  transaction_value: number | null; transaction_value_full: number | null;
  proportion_pct: number | null; matricula: string | null; transaction_date: string | null;
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
  if (typeof v === "number" && v > 20000 && v < 80000) return new Date(Date.UTC(1899, 11, 30) + v * 86400000).toISOString().slice(0, 10);
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

/** Discovers additional yearly links from the Prefeitura catalogue, preserving known working URLs. */
async function discoverSources(): Promise<Source[]> {
  const sources = new Map<number, string>(Object.entries(KNOWN_URLS).map(([y, u]) => [Number(y), u]));
  try {
    const response = await fetch(ITBI_PAGE, { signal: AbortSignal.timeout(30_000) });
    if (!response.ok) return toSources(sources);
    const html = await response.text();
    const hrefRe = /href=["']([^"']+)["']/gi;
    let match: RegExpExecArray | null;
    while ((match = hrefRe.exec(html)) !== null) {
      const raw = match[1].replace(/&amp;/g, "&");
      if (!/(itbi|guias)/i.test(raw)) continue;
      const years = [...raw.matchAll(/(?:19|20)\d{2}/g)].map(m => Number(m[0]));
      if (!years.length) continue;
      const url = new URL(raw, ITBI_PAGE).href;
      for (const year of years) if (year >= 2000 && year <= new Date().getFullYear()) sources.set(year, url);
    }
  } catch (_) {}
  return toSources(sources);
}
function toSources(map: Map<number, string>): Source[] {
  return [...map.entries()].sort((a, b) => a[0] - b[0]).map(([year, url]) => ({ year, url }));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  let force = false; let onlyYear: number | null = null;
  try {
    const body = req.method === "POST" ? await req.json() : null;
    force = body?.force === true; onlyYear = body?.year != null ? Number(body.year) : null;
  } catch (_) {}

  try {
    const sources = await discoverSources();
    const results: Record<string, number> = {};
    for (const { year, url } of sources) {
      if (onlyYear != null && year !== onlyYear) continue;
      const { count: existingCount } = await supabase.from("properties").select("*", { count: "exact", head: true }).eq("year", year);
      const { count: enrichedCount } = await supabase.from("properties").select("*", { count: "exact", head: true }).eq("year", year).not("transaction_value", "is", null);
      const resp = await fetch(url, { signal: AbortSignal.timeout(180_000) });
      if (!resp.ok) { results[String(year)] = -1; continue; }
      const buf = new Uint8Array(await resp.arrayBuffer());
      const wb = XLSX.read(buf, { type: "array", cellDates: true });
      const needsEnrichment = (enrichedCount ?? 0) === 0 && (existingCount ?? 0) > 0;
      if (!force && !needsEnrichment && (existingCount ?? 0) > 0) { results[String(year)] = 0; continue; }
      const { error: deleteError } = await supabase.from("properties").delete().eq("year", year);
      if (deleteError) throw new Error(`Falha ao limpar ${year}: ${deleteError.message}`);
      let inserted = 0;
      for (const name of wb.SheetNames) {
        if (/LEGENDA|EXPLIC|TABELA|PADR/i.test(name)) continue;
        const rows = year === 2024 ? parse2024Sheet(wb.Sheets[name], year) : parse2025PlusSheet(wb.Sheets[name], year);
        for (let i = 0; i < rows.length; i += 500) {
          const batch = rows.slice(i, i + 500);
          const { error } = await supabase.from("properties").insert(batch);
          if (error) throw new Error(`Falha ao importar ${year}: ${error.message}`);
          inserted += batch.length;
        }
      }
      results[String(year)] = inserted;
    }
    return json({ success: true, sources: sources.map(s => s.year), results });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Erro inesperado" }, 500);
  }
});

function parse2024Sheet(ws: XLSX.WorkSheet, year: number): Row[] {
  const rows: Row[] = []; const data: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1 });
  for (const v of data) {
    if (!v || v.length < 20) continue;
    const logr = String(v[1] ?? "").trim(); if (!logr) continue;
    const rawNum = v[2]; const numero = rawNum != null ? String(Math.floor(Number(rawNum)) || rawNum).trim() : "";
    const compl = String(v[3] ?? "").trim(); const bairro = String(v[4] ?? "").trim() || null;
    const venal = Number(v[12]) || 0; const transacao = num(v[8]); const dataTransacao = toDate(v[9]);
    const vvr = num(v[10]); const proporcao = num(v[11]); const matricula = String(v[17] ?? "").trim() || null;
    const cheio = fullValue(transacao, proporcao); if (venal <= 0 && !cheio) continue;
    const area = Number(v[22]) || null; const tipo = String(v[24] ?? "").trim() || null; const base = cheio ?? venal;
    const parts = [logr]; if (numero && numero !== "0" && numero !== "99999") parts.push(numero); if (compl) parts.push(compl);
    rows.push({ address: parts.join(" ").slice(0, 500), neighborhood: bairro, area, venal_value: venal, property_type: tipo, year,
      price_per_sqm: area && area > 0 ? Math.round((base / area) * 100) / 100 : null, transaction_value: transacao,
      transaction_value_full: cheio, proportion_pct: proporcao, matricula, transaction_date: dataTransacao, venal_reference: vvr });
  }
  return rows;
}

function parse2025PlusSheet(ws: XLSX.WorkSheet, year: number): Row[] {
  const rows: Row[] = []; const data: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1 }); if (!data.length) return rows;
  let headerIdx = -1; const colMap: Record<string, number> = {};
  for (let i = 0; i < Math.min(5, data.length); i++) {
    const cells = (data[i] || []).map(c => String(c ?? "").trim().toUpperCase());
    if (!cells.some(c => c.includes("LOGRADOURO"))) continue;
    headerIdx = i;
    cells.forEach((h, idx) => {
      if (h.includes("LOGRADOURO") && !h.includes("NUMERO")) colMap.logradouro = idx;
      else if (h === "NÚMERO" || h === "NUMERO") colMap.numero = idx;
      else if (h.includes("COMPLEMENTO")) colMap.complemento = idx;
      else if (h.includes("BAIRRO")) colMap.bairro = idx;
      else if (h.includes("CONSTRUÍD") || h.includes("CONSTRUID")) colMap.area = idx;
      else if (h.includes("VENAL") && h.includes("PROPORCIONAL")) colMap.venal = idx;
      else if (h.includes("VENAL") && colMap.venal === undefined) colMap.venal = idx;
      else if (h.includes("DESCRI") && h.includes("USO")) colMap.tipo = idx;
      else if (h.includes("TRANSA") && h.includes("VALOR")) colMap.transacao = idx;
      else if (h.includes("DATA") && h.includes("TRANSA")) colMap.data = idx;
      else if (h.includes("PROPOR")) colMap.proporcao = idx;
      else if (h.includes("MATR")) colMap.matricula = idx;
    }); break;
  }
  if (headerIdx < 0) return rows;
  for (let i = headerIdx + 1; i < data.length; i++) {
    const v = data[i]; if (!v || v.length < 5) continue;
    const g = (k: string) => colMap[k] !== undefined ? v[colMap[k]] : null;
    const logr = String(g("logradouro") ?? "").trim(); if (!logr) continue;
    const numero = String(g("numero") ?? "").trim(); const compl = String(g("complemento") ?? "").trim();
    const bairro = String(g("bairro") ?? "").trim() || null; const area = g("area") ? Number(g("area")) || null : null;
    const venal = num(g("venal")); const transacao = num(g("transacao")); const proporcao = num(g("proporcao"));
    const dataTransacao = toDate(g("data")); const matricula = String(g("matricula") ?? "").trim() || null;
    const cheio = fullValue(transacao, proporcao); if ((!venal || venal <= 0) && !cheio) continue;
    const tipo = String(g("tipo") ?? "").trim() || null; const base = cheio ?? venal ?? 0;
    const parts = [logr]; if (numero && numero !== "0") parts.push(numero); if (compl) parts.push(compl);
    rows.push({ address: parts.join(" ").slice(0, 500), neighborhood: bairro, area, venal_value: venal ?? 0, property_type: tipo, year,
      price_per_sqm: area && area > 0 ? Math.round((base / area) * 100) / 100 : null, transaction_value: transacao,
      transaction_value_full: cheio, proportion_pct: proporcao, matricula, transaction_date: dataTransacao, venal_reference: venal });
  }
  return rows;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
