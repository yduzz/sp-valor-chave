import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { read, utils } from "https://cdn.sheetjs.com/xlsx-0.20.3/package/xlsx.mjs";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const URLS: Record<number, string> = {
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

      // Get current count for this year
      const { count: existingCount } = await supabase
        .from("properties")
        .select("*", { count: "exact", head: true })
        .eq("year", year);

      // Download XLSX
      const resp = await fetch(url, { signal: AbortSignal.timeout(120_000) });
      if (!resp.ok) {
        results[yearStr] = -1;
        continue;
      }
      const buf = new Uint8Array(await resp.arrayBuffer());
      const wb = read(buf, { type: "array" });

      // Parse all sheets
      const rows: Row[] = [];
      for (const name of wb.SheetNames) {
        const ws = wb.Sheets[name];
        const data: string[][] = utils.sheet_to_json(ws, { header: 1 });
        if (!data.length) continue;

        // Find header row
        let headerIdx = -1;
        let colMap: Record<string, number> = {};
        for (let i = 0; i < Math.min(5, data.length); i++) {
          const cells = (data[i] || []).map((c) =>
            String(c ?? "").trim().toUpperCase()
          );
          if (cells.some((c) => c.includes("LOGRADOURO"))) {
            headerIdx = i;
            cells.forEach((h, idx) => {
              if (h.includes("LOGRADOURO") && !h.includes("NUMERO"))
                colMap["logradouro"] = idx;
              else if (h === "NÚMERO" || h === "NUMERO") colMap["numero"] = idx;
              else if (h.includes("COMPLEMENTO")) colMap["complemento"] = idx;
              else if (h.includes("BAIRRO")) colMap["bairro"] = idx;
              else if (h.includes("CONSTRUÍD") || h.includes("CONSTRUID"))
                colMap["area"] = idx;
              else if (h.includes("VENAL") && h.includes("PROPORCIONAL"))
                colMap["venal"] = idx;
              else if (h.includes("VENAL") && !colMap["venal"])
                colMap["venal"] = idx;
              else if (h.includes("DESCRI") && h.includes("USO"))
                colMap["tipo"] = idx;
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
          const logradouro = String(g("logradouro") ?? "").trim();
          if (!logradouro) continue;
          const numero = String(g("numero") ?? "").trim();
          const complemento = String(g("complemento") ?? "").trim();
          const bairro = String(g("bairro") ?? "").trim() || null;
          const area = g("area") ? Number(g("area")) || null : null;
          const venal = g("venal") ? Number(g("venal")) : null;
          if (!venal || venal <= 0) continue;
          const tipo = String(g("tipo") ?? "").trim() || null;

          const parts = [logradouro];
          if (numero && numero !== "0") parts.push(numero);
          if (complemento) parts.push(complemento);

          rows.push({
            address: parts.join(" ").slice(0, 500),
            neighborhood: bairro,
            area,
            venal_value: venal,
            property_type: tipo,
            year,
            price_per_sqm:
              area && area > 0 ? Math.round((venal / area) * 100) / 100 : null,
          });
        }
      }

      // If we already have same or more rows, skip
      if (existingCount !== null && rows.length <= existingCount) {
        results[yearStr] = 0;
        continue;
      }

      // Delete old data for this year and re-insert
      await supabase.from("properties").delete().eq("year", year);

      // Insert in batches of 500
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

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
