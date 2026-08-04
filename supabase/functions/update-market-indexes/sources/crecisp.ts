import { extractPdfText } from "../lib/pdf.ts";
import { httpFetch } from "../lib/http.ts";
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

const PAGE = "https://www.crecisp.gov.br/comunicacao/pesquisasmercado/capital";
const BASE = "https://www.crecisp.gov.br/";

async function discover(): Promise<DiscoveredReport[]> {
  const resp = await httpFetch(PAGE, 45_000);
  if (!resp.ok) throw new Error(`CRECI-SP respondeu ${resp.status}`);
  const html = await resp.text();

  const anchors = [...html.matchAll(/<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi)];
  const reports: DiscoveredReport[] = [];
  for (const [, href, inner] of anchors) {
    if (!/\.pdf(\?|$)/i.test(href)) continue;
    const title = inner.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    const url = absoluteUrl(href, BASE);
    reports.push({
      url,
      title: title || url.split("/").pop(),
      competence: parseCompetence(`${title} ${url}`),
      fileType: fileTypeOf(url),
    });
  }

  const seen = new Set<string>();
  return reports
    .filter((r) => (seen.has(r.url) ? false : (seen.add(r.url), true)))
    .sort((a, b) => (b.competence ?? "").localeCompare(a.competence ?? ""))
    .slice(0, 6);
}

function pick(text: string, patterns: RegExp[]): number | null {
  for (const re of patterns) {
    const m = text.match(re);
    if (m) {
      const n = toNumber(m[1]);
      if (n != null) return n;
    }
  }
  return null;
}

function priceBands(text: string): Record<string, number> {
  const bands: Record<string, number> = {};
  const re = /(at[ée]|acima de|de)\s*R\$\s?([\d.]+(?:,\d+)?)\s*(?:mil|milh[õo]es)?[^%\n]{0,60}?(\d+[.,]\d+)\s*%/gi;
  for (const m of text.matchAll(re)) {
    bands[`${m[1]} R$ ${m[2]}`.toLowerCase()] = toNumber(m[3]) ?? 0;
  }
  return bands;
}

export const creciSpSource: MarketSource = {
  id: "crecisp",
  label: "Pesquisa de Mercado CRECI-SP (Capital)",
  pageUrl: PAGE,
  discover,
  async extract(report, bytes) {
    const raw = await extractPdfText(bytes);
    if (!raw.trim()) return [];
    const text = raw.replace(/\s+/g, " ");
    const n = normalize(text);

    const competence = report.competence ?? parseCompetence(text.slice(0, 3000));
    if (!competence) return [];

    const result: ExtractedIndex = {
      competence,
      city: "São Paulo",
      neighborhood: null,
      property_type: "geral",
      avg_price_per_sqm: pick(text, [/R\$\s?([\d.]+,\d{2})\s*\/?\s*m²/i]),
      monthly_variation: pick(n, [/varia(?:cao|ção)\s+mensal[^0-9\-+]{0,40}(-?\d+[.,]\d+)/]),
      yearly_variation: pick(n, [/(?:12\s*meses)[^0-9\-+]{0,40}(-?\d+[.,]\d+)/]),
      metrics: {
        sales_count: pick(n, [/(\d[\d.]*)\s*(?:im[oó]veis\s+)?vendid/, /quantidade de vendas[^0-9]{0,20}(\d[\d.]*)/]),
        rentals_count: pick(n, [/(\d[\d.]*)\s*(?:im[oó]veis\s+)?locad/, /quantidade de loca[cç][oõ]es[^0-9]{0,20}(\d[\d.]*)/]),
        average_discount: pick(n, [/desconto\s+m[eé]dio[^0-9\-+]{0,40}(\d+[.,]\d+)/]),
        avg_days_to_sell: pick(n, [/prazo\s+m[eé]dio\s+(?:de\s+)?venda[^0-9]{0,40}(\d+[.,]?\d*)/]),
        avg_days_to_rent: pick(n, [/prazo\s+m[eé]dio\s+(?:de\s+)?loca[cç][aã]o[^0-9]{0,40}(\d+[.,]?\d*)/]),
        price_bands: priceBands(text),
        source_title: report.title ?? null,
      },
    };

    return [result];
  },
};
