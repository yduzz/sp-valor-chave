import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import * as XLSX from "npm:xlsx@0.18.5";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Fontes oficiais da Prefeitura de São Paulo, conforme os arquivos históricos
// disponibilizados para dados de guias de ITBI pagas.
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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  let force = false;
  let onlyYear: number | null = null;
  try {
    const body = req.method === "POST" ? await req.json() : null;
    force = body?.force === true;
    onlyYear = body?.year != null ? Number(body.year) : null;
  } catch (_) {}

  try {
    const years = Object.keys(KNOWN_URLS).map(Number).sort((a, b) => a - b);
    const results: Record<string, number> = {};

    for (const year of years) {
      if (onlyYear != null && year !== onlyYear) continue;
      const url = KNOWN_URLS[year];

      const { count: existingCount } = await supabase
        .from("properties")
        .select("*", { count: "exact", head: true })
        .eq("year", year);

      if (!force && (existingCount ?? 0) > 0) {
        results[String(year)] = 0;
        continue;
      }

      const resp = await fetch(url, { signal: AbortSignal.timeout(180_000) });
      if (!resp.ok) {
        results[String(year)] = -1;
        continue;
      }

      const buf = new Uint8Array(await resp.arrayBuffer());
      const wb = XLSX.read(buf, { type: "array", cellDates: true });

      const { error: deleteError } = await supabase.from("properties").delete().eq("year", year);
      if (deleteError) throw new Error(`Falha ao limpar ${year}: ${deleteError.message}`);

      let inserted = 0;
      for (const name of wb.SheetNames) {
        if (/LEGENDA|EXPLIC|TABELA|PADR/i.test(name)) continue;

        const rows = parseSheet(wb.Sheets[name], year);
        for (let i = 0; i < rows.length; i += 500) {
          const batch = rows.slice(i, i + 500);
          const { error } = await supabase.from("properties").insert(batch);
          if (error) throw new Error(`Falha ao importar ${year}: ${error.message}`);
          inserted += batch.length;
        }
      }

      results[String(year)] = inserted;
    }

    return json({ success: true, years, results });
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

function parseSheet(ws: XLSX.WorkSheet, year: number): Row[] {
  const data: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });
  if (!data.length) return [];

  // Encontra o cabeçalho automaticamente, inclusive nos arquivos antigos.
  let headerIdx = -1;
  let map: Record<string, number> = {};

  for (let i = 0; i < Math.min(15, data.length); i++) {
    const cells = (data[i] || []).map(normalizeHeader);
    if (!cells.some(c => c.includes("LOGRADOURO"))) continue;

    headerIdx = i;
    cells.forEach((h, idx) => {
      if (h.includes("LOGRADOURO") && !h.includes("NUMERO")) map.logradouro ??= idx;
      else if (h === "NUMERO" || h === "N" || h.includes("NUMERO DO IMOVEL")) map.numero ??= idx;
      else if (h.includes("COMPLEMENTO")) map.complemento ??= idx;
      else if (h.includes("BAIRRO")) map.bairro ??= idx;
      else if (h.includes("AREA") && (h.includes("CONSTR") || h.includes("TERRENO") || !map.area)) map.area ??= idx;
      else if (h.includes("VENAL") && h.includes("PROPORC")) map.venal ??= idx;
      else if (h.includes("VENAL") && map.venal === undefined) map.venal = idx;
      else if ((h.includes("DESCR") && h.includes("USO")) || h.includes("TIPO DO IMOVEL")) map.tipo ??= idx;
      else if (h.includes("TRANSAC") && h.includes("VALOR")) map.transacao ??= idx;
      else if (h.includes("DATA") && h.includes("TRANSAC")) map.data ??= idx;
      else if (h.includes("PROPOR")) map.proporcao ??= idx;
      else if (h.includes("MATR")) map.matricula ??= idx;
      else if ((h.includes("VALOR") && h.includes("REFER")) || h.includes("VVR")) map.vvr ??= idx;
    });
    break;
  }

  // Fallback para a estrutura posicional conhecida de 2024.
  if (headerIdx < 0 && year === 2024) return parse2024Positional(data, year);
  if (headerIdx < 0 || map.logradouro === undefined) return [];

  const rows: Row[] = [];
  const get = (v: unknown[], key: string) => map[key] !== undefined ? v[map[key]] : null;

  for (let i = headerIdx + 1; i < data.length; i++) {
    const v = data[i];
    if (!v || v.length < 3) continue;

    const logr = String(get(v, "logradouro") ?? "").trim();
    if (!logr || /^LOGRADOURO$/i.test(logr)) continue;

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

  return rows;
}

function parse2024Positional(data: unknown[][], year: number): Row[] {
  const rows: Row[] = [];
  for (const v of data) {
    if (!v || v.length < 20) continue;
    const logr = String(v[1] ?? "").trim();
    if (!logr) continue;
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
  return rows;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
