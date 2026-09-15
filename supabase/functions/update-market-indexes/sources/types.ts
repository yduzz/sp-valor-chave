// Contrato genérico de fonte de índice de mercado.
// Novas fontes (IBGE, BACEN, IPCA, IGP-M, SECOVI...) só precisam implementar
// esta interface e ser registradas em sources/index.ts — sem refatorar o módulo.

export interface DiscoveredReport {
  /** URL absoluta do arquivo (xlsx/pdf/csv) */
  url: string;
  title?: string;
  /** Competência YYYY-MM-01 quando identificável */
  competence?: string | null;
  fileType?: string;
}

export interface ExtractedIndex {
  competence: string; // YYYY-MM-01
  city?: string | null;
  neighborhood?: string | null;
  property_type?: string | null;
  avg_price_per_sqm?: number | null;
  monthly_variation?: number | null;
  yearly_variation?: number | null;
  metrics?: Record<string, unknown>;
}

export interface MarketSource {
  /** identificador estável, usado na coluna `source` */
  id: string;
  label: string;
  pageUrl: string;
  /** Localiza os arquivos publicados mais recentes */
  discover(): Promise<DiscoveredReport[]>;
  /** Converte o arquivo baixado em linhas de índice */
  extract(
    report: DiscoveredReport,
    bytes: Uint8Array,
  ): Promise<ExtractedIndex[]>;
}

export const MONTHS: Record<string, number> = {
  janeiro: 1, fevereiro: 2, marco: 3, março: 3, abril: 4, maio: 5, junho: 6,
  julho: 7, agosto: 8, setembro: 9, outubro: 10, novembro: 11, dezembro: 12,
  jan: 1, fev: 2, mar: 3, abr: 4, mai: 5, jun: 6, jul: 7, ago: 8, set: 9,
  out: 10, nov: 11, dez: 12,
};

export function normalize(text: string): string {
  return text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

/** Tenta identificar a competência (mês/ano) em um texto livre ou nome de arquivo. */
export function parseCompetence(text: string): string | null {
  const t = normalize(text);
  const named = t.match(
    /(jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez)[a-z]*[\s._\-/de]*((19|20)\d{2})/,
  );
  if (named) {
    const m = MONTHS[named[1]];
    return `${named[2]}-${String(m).padStart(2, "0")}-01`;
  }
  const numeric = t.match(/(0[1-9]|1[0-2])[._\-/]((19|20)\d{2})/);
  if (numeric) return `${numeric[2]}-${numeric[1]}-01`;
  const iso = t.match(/((19|20)\d{2})[._\-/](0[1-9]|1[0-2])/);
  if (iso) return `${iso[1]}-${iso[3]}-01`;
  return null;
}

export function toNumber(raw: unknown): number | null {
  if (raw == null) return null;
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : null;
  const s = String(raw)
    .replace(/[R$\s%]/g, "")
    .replace(/\.(?=\d{3}(\D|$))/g, "")
    .replace(",", ".");
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

export function absoluteUrl(href: string, base: string): string {
  try {
    return new URL(href, base).toString();
  } catch {
    return href;
  }
}

export function fileTypeOf(url: string): string {
  const m = url.toLowerCase().match(/\.(xlsx|xls|csv|pdf)(\?|$)/);
  return m ? m[1] : "html";
}
