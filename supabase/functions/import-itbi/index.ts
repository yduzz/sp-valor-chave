import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import * as XLSX from "npm:xlsx@0.18.5";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const URLS: Record<number, string> = {
  2024: "https://prefeitura.sp.gov.br/cidade/secretarias/upload/fazenda/arquivos/itbi/GUIAS-DE-ITBI-PAGAS-2024.xlsx",
  2025: "https://prefeitura.sp.gov.br/cidade/secretarias/upload/fazenda/arquivos/itbi/GUIAS%20DE%20ITBI%20PAGAS%20%2828012026%29%20XLS.xlsx",
  2026: "https://prefeitura.sp.gov.br/documents/d/fazenda/guias-de-itbi-pagas-1-xlsx-1",
};

interface Row {
  address: string;
  neighborhood: string | null;
  area: number | null;
  venal_value: number;
  property_type: string | null;
  year: number;
  price_per_sqm: number | null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const results: Record<string, number> = {};

  try {
    for (const [yearStr, url] of Object.entries(URLS)) {
      const year = Number(yearStr);

      const { count: existingCount } = await supabase
        .from("properties")
        .select("*", { count: "exact", head: true })
        .eq("year", year);

      const resp = await fetch(url, { signal: AbortSignal.timeout(120_000) });
      if (!resp.ok) {
        results[yearStr] = -1;
        continue;
      }
      const buf = new Uint8Array(await resp.arrayBuffer());
      const wb = XLSX.read(buf, { type: "array" });

      const rows: Row[] = year === 2024
        ? parse2024(wb, year)
        : parse2025Plus(wb, year);

      if (existingCount !== null && rows.length <= existingCount) {
        results[yearStr] = 0;
        continue;
      }

      await supabase.from("properties").delete().eq("year", year);

      let inserted = 0;
      for (let i = 0; i < rows.length; i += 500) {
        const batch = rows.slice(i, i + 500);
        const { error } = await supabase.from("properties").insert(batch);
        if (!error) inserted += batch.length;
      }
      results[yearStr] = inserted;
    }

    return json({ success: true, results });
  } catch (error) {
    return json(
      { error: error instanceof Error ? error.message : "Erro inesperado" },
      500
    );
  }
});

/** 2024 file has no header row. Columns are positional. */
function parse2024(wb: XLSX.WorkBook, year: number): Row[] {
  const rows: Row[] = [];
  for (const name of wb.SheetNames) {
    if (/LEGENDA|EXPLIC|TABELA|PADR/i.test(name)) continue;
    const ws = wb.Sheets[name];
    const data: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1 });
    for (const v of data) {
      if (!v || v.length < 20) continue;
      const logr = String(v[1] ?? "").trim();
      if (!logr) continue;
      const rawNum = v[2];
      const numero = rawNum != null ? String(Math.floor(Number(rawNum)) || rawNum).trim() : "";
      const compl = String(v[3] ?? "").trim();
      const bairro = String(v[4] ?? "").trim() || null;
      const venal = Number(v[12]) || 0;
      if (venal <= 0) continue;
      const area = Number(v[22]) || null;
      const tipo = String(v[24] ?? "").trim() || null;

      const parts = [logr];
      if (numero && numero !== "0" && numero !== "99999") parts.push(numero);
      if (compl) parts.push(compl);

      rows.push({
        address: parts.join(" ").slice(0, 500),
        neighborhood: bairro,
        area,
        venal_value: venal,
        property_type: tipo,
        year,
        price_per_sqm: area && area > 0 ? Math.round((venal / area) * 100) / 100 : null,
      });
    }
  }
  return rows;
}

/** 2025/2026 files have a header row with LOGRADOURO etc. */
function parse2025Plus(wb: XLSX.WorkBook, year: number): Row[] {
  const rows: Row[] = [];
  for (const name of wb.SheetNames) {
    if (/LEGENDA|EXPLIC|TABELA|PADR/i.test(name)) continue;
    const ws = wb.Sheets[name];
    const data: string[][] = XLSX.utils.sheet_to_json(ws, { header: 1 });
    if (!data.length) continue;

    let headerIdx = -1;
    const colMap: Record<string, number> = {};
    for (let i = 0; i < Math.min(5, data.length); i++) {
      const cells = (data[i] || []).map((c) => String(c ?? "").trim().toUpperCase());
      if (cells.some((c) => c.includes("LOGRADOURO"))) {
        headerIdx = i;
        cells.forEach((h, idx) => {
          if (h.includes("LOGRADOURO") && !h.includes("NUMERO")) colMap["logradouro"] = idx;
          else if (h === "NÚMERO" || h === "NUMERO") colMap["numero"] = idx;
          else if (h.includes("COMPLEMENTO")) colMap["complemento"] = idx;
          else if (h.includes("BAIRRO")) colMap["bairro"] = idx;
          else if (h.includes("CONSTRUÍD") || h.includes("CONSTRUID")) colMap["area"] = idx;
          else if (h.includes("VENAL") && h.includes("PROPORCIONAL")) colMap["venal"] = idx;
          else if (h.includes("VENAL") && !colMap["venal"]) colMap["venal"] = idx;
          else if (h.includes("DESCRI") && h.includes("USO")) colMap["tipo"] = idx;
        });
        break;
      }
    }
    if (headerIdx < 0) continue;

    for (let i = headerIdx + 1; i < data.length; i++) {
      const v = data[i];
      if (!v || v.length < 5) continue;
      const g = (k: string) => {
        const idx = colMap[k];
        return idx !== undefined && idx < v.length ? v[idx] : null;
      };
      const logr = String(g("logradouro") ?? "").trim();
      if (!logr) continue;
      const numero = String(g("numero") ?? "").trim();
      const compl = String(g("complemento") ?? "").trim();
      const bairro = String(g("bairro") ?? "").trim() || null;
      const area = g("area") ? Number(g("area")) || null : null;
      const venal = g("venal") ? Number(g("venal")) : null;
      if (!venal || venal <= 0) continue;
      const tipo = String(g("tipo") ?? "").trim() || null;

      const parts = [logr];
      if (numero && numero !== "0") parts.push(numero);
      if (compl) parts.push(compl);

      rows.push({
        address: parts.join(" ").slice(0, 500),
        neighborhood: bairro,
        area,
        venal_value: venal,
        property_type: tipo,
        year,
        price_per_sqm: area && area > 0 ? Math.round((venal / area) * 100) / 100 : null,
      });
    }
  }
  return rows;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
