/**
 * Módulo independente de índices de mercado.
 *
 * Fornece — sem alterar nenhuma lógica existente — :
 *  - índice vigente
 *  - índice histórico
 *  - fator acumulado entre duas competências
 *  - data da última atualização
 *  - valor atualizado (valor presente) dos comparáveis históricos
 *
 * Nenhuma função aqui é obrigatória para o fluxo atual: o motor de avaliação
 * pode consumi-la opcionalmente e continua funcionando caso não haja dados.
 */
import { supabase } from "@/integrations/supabase/client";

export interface MarketIndexRow {
  competence: string;
  source: string;
  city: string | null;
  neighborhood: string | null;
  property_type: string | null;
  avg_price_per_sqm: number | null;
  monthly_variation: number | null;
  yearly_variation: number | null;
}

export interface IndexFilter {
  source?: string;
  city?: string;
  propertyType?: string;
}

const DEFAULT_SOURCE = "fipezap";
/** Fallback conservador (a.a.) usado apenas quando não há série no banco. */
const FALLBACK_ANNUAL_RATE = 0.062;

function competenceOf(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-01`;
}

function monthsBetween(from: string, to: string): number {
  const [fy, fm] = from.split("-").map(Number);
  const [ty, tm] = to.split("-").map(Number);
  return Math.max(0, (ty - fy) * 12 + (tm - fm));
}

function applyFilter<T>(query: T, filter: IndexFilter): T {
  // deno-lint-ignore no-explicit-any
  let q: any = query;
  q = q.eq("source", filter.source ?? DEFAULT_SOURCE);
  if (filter.city) q = q.ilike("city", `%${filter.city}%`);
  if (filter.propertyType) q = q.eq("property_type", filter.propertyType);
  return q as T;
}

/** Índice vigente (competência mais recente disponível). */
export async function getCurrentIndex(filter: IndexFilter = {}): Promise<MarketIndexRow | null> {
  const { data } = await applyFilter(
    supabase
      .from("market_indexes")
      .select("competence, source, city, neighborhood, property_type, avg_price_per_sqm, monthly_variation, yearly_variation"),
    filter,
  )
    .order("competence", { ascending: false })
    .limit(1);
  return (data?.[0] as MarketIndexRow) ?? null;
}

/** Série histórica de índices dentro de um intervalo de competências. */
export async function getIndexHistory(
  fromCompetence: string,
  toCompetence: string = competenceOf(new Date()),
  filter: IndexFilter = {},
): Promise<MarketIndexRow[]> {
  const { data } = await applyFilter(
    supabase
      .from("market_indexes")
      .select("competence, source, city, neighborhood, property_type, avg_price_per_sqm, monthly_variation, yearly_variation"),
    filter,
  )
    .gte("competence", fromCompetence)
    .lte("competence", toCompetence)
    .order("competence", { ascending: true });
  return (data as MarketIndexRow[]) ?? [];
}

/** Data/hora da última atualização bem-sucedida do módulo. */
export async function getLastUpdate(source = DEFAULT_SOURCE): Promise<string | null> {
  const { data } = await supabase
    .from("market_update_logs")
    .select("executed_at")
    .eq("source", source)
    .eq("status", "success")
    .order("executed_at", { ascending: false })
    .limit(1);
  return data?.[0]?.executed_at ?? null;
}

export interface AccumulatedFactor {
  factor: number;
  fromCompetence: string;
  toCompetence: string;
  monthsApplied: number;
  basis: "index_series" | "fallback";
}

/**
 * Fator acumulado entre duas competências.
 * Prioridade: preço médio por m² da série → variações mensais → fallback anual.
 */
export async function getAccumulatedFactor(
  fromCompetence: string,
  toCompetence: string = competenceOf(new Date()),
  filter: IndexFilter = {},
): Promise<AccumulatedFactor> {
  const months = monthsBetween(fromCompetence, toCompetence);
  const base: Omit<AccumulatedFactor, "factor" | "basis"> = {
    fromCompetence,
    toCompetence,
    monthsApplied: months,
  };

  const series = await getIndexHistory(fromCompetence, toCompetence, filter);

  const withPrice = series.filter((r) => (r.avg_price_per_sqm ?? 0) > 0);
  if (withPrice.length >= 2) {
    const first = withPrice[0].avg_price_per_sqm!;
    const last = withPrice[withPrice.length - 1].avg_price_per_sqm!;
    if (first > 0) return { ...base, factor: last / first, basis: "index_series" };
  }

  const withVar = series.filter((r) => r.monthly_variation != null);
  if (withVar.length > 0) {
    const factor = withVar.reduce((acc, r) => acc * (1 + (r.monthly_variation ?? 0) / 100), 1);
    return { ...base, factor, basis: "index_series" };
  }

  return {
    ...base,
    factor: Math.pow(1 + FALLBACK_ANNUAL_RATE, months / 12),
    basis: "fallback",
  };
}

export interface ComparableInput {
  /** valor da transação */
  value: number;
  /** data da transação (Date, ISO ou ano) */
  date: Date | string | number;
  city?: string;
  propertyType?: string;
}

export interface UpdatedComparable extends AccumulatedFactor {
  originalValue: number;
  presentValue: number;
}

function toCompetence(date: Date | string | number): string {
  if (typeof date === "number") return `${date}-01-01`;
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return `${new Date().getUTCFullYear()}-01-01`;
  return competenceOf(d);
}

/** Converte um comparável histórico para valor presente. */
export async function updateComparableToPresent(
  input: ComparableInput,
  referenceDate: Date = new Date(),
): Promise<UpdatedComparable> {
  const from = toCompetence(input.date);
  const to = competenceOf(referenceDate);
  const acc = await getAccumulatedFactor(from, to, {
    city: input.city,
    propertyType: input.propertyType,
  });
  return {
    ...acc,
    originalValue: input.value,
    presentValue: Math.round(input.value * acc.factor),
  };
}

/** Versão em lote — um único fator por (cidade, tipo, competência de origem). */
export async function updateComparablesToPresent(
  items: ComparableInput[],
  referenceDate: Date = new Date(),
): Promise<UpdatedComparable[]> {
  const cache = new Map<string, AccumulatedFactor>();
  const to = competenceOf(referenceDate);
  const out: UpdatedComparable[] = [];

  for (const item of items) {
    const from = toCompetence(item.date);
    const key = `${from}|${item.city ?? ""}|${item.propertyType ?? ""}`;
    let acc = cache.get(key);
    if (!acc) {
      acc = await getAccumulatedFactor(from, to, {
        city: item.city,
        propertyType: item.propertyType,
      });
      cache.set(key, acc);
    }
    out.push({
      ...acc,
      originalValue: item.value,
      presentValue: Math.round(item.value * acc.factor),
    });
  }

  return out;
}
