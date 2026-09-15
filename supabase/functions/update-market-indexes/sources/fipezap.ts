import * as XLSX from "npm:xlsx@0.18.5";
import { fetchTextWithMirror } from "../lib/http.ts";
import {
  absoluteUrl,
  DiscoveredReport,
  ExtractedIndex,
  fileTypeOf,
  MarketSource,
  normalize,
  parseCompetence,
  toNumber,
} from "./types.ts";

const PAGE = "https://www.fipe.org.br/pt-br/publicacoes/relatorios/#relatorio-fipezap";
const BASE = "https://www.fipe.org.br/";
/** Série histórica oficial (planilha) — fonte principal quando disponível. */
const SERIES_FALLBACKS = [
  "https://downloads.fipe.org.br/indices/fipezap/fipezap-serieshistoricas.xlsx",
];

async function discover(): Promise<DiscoveredReport[]> {
  const found: DiscoveredReport[] = [];
  try {
    const html = await fetchTextWithMirror(PAGE, 45_000);
    {
      const hrefs = [...html.matchAll(/href="([^"]+\.(?:xlsx|xls|pdf))"/gi)].map((m) => m[1]);
      for (const href of hrefs) {
        const url = absoluteUrl(href, BASE);
        const n = normalize(url);
        if (!n.includes("fipezap") && !n.includes("zap")) continue;
        found.push({
          url,
          title: url.split("/").pop(),
          competence: parseCompetence(url),
          fileType: fileTypeOf(url),
        });
      }
    }
  } catch (_) {
    // página indisponível: cai para a série histórica conhecida
  }

  // Planilha da série histórica tem prioridade como fonte principal.
  const series = SERIES_FALLBACKS.map((url) => ({
    url,
    title: "FipeZAP - Séries Históricas",
    competence: null,
    fileType: fileTypeOf(url),
  }));

  const all = [...series, ...found];
  const seen = new Set<string>();
  return all.filter((r) => (seen.has(r.url) ? false : (seen.add(r.url), true))).slice(0, 6);
}

/** Localiza a linha de cabeçalho com datas e extrai a série por cidade. */
function extractFromWorkbook(wb: XLSX.WorkBook): ExtractedIndex[] {
  const out: ExtractedIndex[] = [];

  for (const sheetName of wb.SheetNames) {
    const n = normalize(sheetName);
    const propertyType = n.includes("comercial")
      ? "comercial"
      : n.includes("locacao") || n.includes("aluguel")
      ? "residencial-locacao"
      : "residencial-venda";

    const ws = wb.Sheets[sheetName];
    const data: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true });
    if (!data.length) continue;

    // cabeçalho = primeira linha com >= 3 nomes de cidade/coluna textual
    let headerIdx = -1;
    for (let i = 0; i < Math.min(15, data.length); i++) {
      const cells = (data[i] || []).map((c) => String(c ?? "").trim());
      const textual = cells.filter((c) => c.length > 2 && Number.isNaN(Number(c))).length;
      if (textual >= 3) { headerIdx = i; break; }
    }
    if (headerIdx < 0) continue;
    const header = (data[headerIdx] || []).map((c) => String(c ?? "").trim());

    for (let i = headerIdx + 1; i < data.length; i++) {
      const row = data[i] || [];
      const competence = competenceFromCell(row[0]);
      if (!competence) continue;

      for (let c = 1; c < header.length; c++) {
        const city = header[c];
        if (!city) continue;
        const value = toNumber(row[c]);
        if (value == null) continue;
        out.push({
          competence,
          city,
          property_type: propertyType,
          avg_price_per_sqm: value > 200 ? value : null,
          monthly_variation: value <= 200 ? value : null,
          metrics: { sheet: sheetName, raw_value: value },
        });
      }
    }
  }

  return dedupe(out);
}

function competenceFromCell(cell: unknown): string | null {
  if (cell == null || cell === "") return null;
  if (cell instanceof Date) {
    return `${cell.getUTCFullYear()}-${String(cell.getUTCMonth() + 1).padStart(2, "0")}-01`;
  }
  if (typeof cell === "number" && cell > 20000 && cell < 80000) {
    const d = XLSX.SSF.parse_date_code(cell);
    if (d) return `${d.y}-${String(d.m).padStart(2, "0")}-01`;
    return null;
  }
  return parseCompetence(String(cell));
}

function dedupe(rows: ExtractedIndex[]): ExtractedIndex[] {
  const map = new Map<string, ExtractedIndex>();
  for (const r of rows) {
    const key = `${r.competence}|${r.city ?? ""}|${r.neighborhood ?? ""}|${r.property_type ?? ""}`;
    const prev = map.get(key);
    if (prev) {
      map.set(key, {
        ...prev,
        avg_price_per_sqm: prev.avg_price_per_sqm ?? r.avg_price_per_sqm,
        monthly_variation: prev.monthly_variation ?? r.monthly_variation,
        yearly_variation: prev.yearly_variation ?? r.yearly_variation,
      });
    } else {
      map.set(key, r);
    }
  }
  return [...map.values()];
}

export const fipezapSource: MarketSource = {
  id: "fipezap",
  label: "Índice FipeZAP",
  pageUrl: PAGE,
  discover,
  async extract(report, bytes) {
    if (report.fileType === "pdf") {
      const { extractPdfText } = await import("../lib/pdf.ts");
      const text = await extractPdfText(bytes);
      const competence = report.competence ?? parseCompetence(text.slice(0, 4000));
      if (!competence) return [];
      const monthly = text.match(/varia[çc][ãa]o\s+mensal[^0-9\-+]{0,40}(-?\d+[.,]\d+)/i);
      const yearly = text.match(/(?:12\s*meses|acumulad[oa]\s+em\s+12)[^0-9\-+]{0,40}(-?\d+[.,]\d+)/i);
      const perSqm = text.match(/R\$\s?([\d.]+,\d{2})\s*\/?\s*m/i);
      return [{
        competence,
        city: null,
        property_type: "residencial-venda",
        avg_price_per_sqm: perSqm ? toNumber(perSqm[1]) : null,
        monthly_variation: monthly ? toNumber(monthly[1]) : null,
        yearly_variation: yearly ? toNumber(yearly[1]) : null,
        metrics: { extracted_from: "pdf" },
      }];
    }
    // limita o parse às planilhas relevantes para caber no limite de memória
    const names = XLSX.read(bytes, { type: "array", bookSheets: true }).SheetNames ?? [];
    const targets = names
      .filter((n) => /venda|locac|aluguel|indice|índice/i.test(n))
      .slice(0, 2);
    const wb = XLSX.read(bytes, {
      type: "array",
      cellDates: true,
      sheets: targets.length ? targets : names.slice(0, 1),
    });
    return extractFromWorkbook(wb);
  },
};
