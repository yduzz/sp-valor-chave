export interface PropertyData {
  id: string;
  address: string;
  neighborhood: string;
  area: number;
  venalValue: number;
  type: string;
  year: number;
  fiscalZone: string;
  pricePerSqm: number;
  adLink?: string;
  /** Valor de transação declarado, normalizado para 100% do imóvel. */
  marketValue?: number | null;
  /** Valor de transação declarado exatamente como consta na guia (pode ser parcial). */
  transactionValue?: number | null;
  /** Proporção transmitida na guia (%). */
  proportionPct?: number | null;
  matricula?: string | null;
  transactionDate?: string | null;
}

/**
 * Valor de referência do imóvel: valor de transação declarado na guia de ITBI,
 * exatamente como divulgado pela Prefeitura (mesma base usada pelo mercado).
 * O valor venal só é usado quando não há transação declarada.
 */
export function referenceValue(p: PropertyData): number {
  if (p.transactionValue && p.transactionValue > 0) return p.transactionValue;
  if (p.marketValue && p.marketValue > 0) return p.marketValue;
  return p.venalValue;
}

/** Valor projetado para 100% do imóvel (útil em transmissões parciais). */
export function fullEquivalentValue(p: PropertyData): number | null {
  if (!p.marketValue || p.marketValue <= 0) return null;
  if (p.proportionPct == null || Number(p.proportionPct) >= 99.5) return null;
  return p.marketValue;
}

/** R$/m² coerente com o valor de referência. */
export function referencePerSqm(p: PropertyData): number {
  const value = referenceValue(p);
  return p.area > 0 ? Math.round(value / p.area) : p.pricePerSqm;
}

export const mockProperties: PropertyData[] = [
  {
    id: "1",
    address: "Rua Cardeal Arcoverde, 1070",
    neighborhood: "Pinheiros",
    area: 85,
    venalValue: 620000,
    type: "Apartamento",
    year: 2024,
    fiscalZone: "Z1",
    pricePerSqm: 7294,
  },
  {
    id: "2",
    address: "Rua Cardeal Arcoverde, 1070",
    neighborhood: "Pinheiros",
    area: 120,
    venalValue: 890000,
    type: "Apartamento",
    year: 2025,
    fiscalZone: "Z1",
    pricePerSqm: 7417,
  },
  {
    id: "3",
    address: "Rua Cardeal Arcoverde, 1070",
    neighborhood: "Pinheiros",
    area: 65,
    venalValue: 480000,
    type: "Apartamento",
    year: 2023,
    fiscalZone: "Z1",
    pricePerSqm: 7385,
  },
  {
    id: "4",
    address: "Rua Cardeal Arcoverde, 1070",
    neighborhood: "Pinheiros",
    area: 150,
    venalValue: 1120000,
    type: "Cobertura",
    year: 2024,
    fiscalZone: "Z1",
    pricePerSqm: 7467,
  },
  {
    id: "5",
    address: "Rua Cardeal Arcoverde, 1070",
    neighborhood: "Pinheiros",
    area: 45,
    venalValue: 340000,
    type: "Studio",
    year: 2026,
    fiscalZone: "Z1",
    pricePerSqm: 7556,
  },
];

export const IPCA_FACTOR_2026 = 1.048;
export const FIPEZAP_FACTOR_2026 = 1.062;

export function adjustToPresent(value: number, year: number): number {
  const yearDiff = 2026 - year;
  if (yearDiff <= 0) return value;
  const avgFactor = (IPCA_FACTOR_2026 + FIPEZAP_FACTOR_2026) / 2;
  return Math.round(value * Math.pow(avgFactor, yearDiff));
}

export function calculatePricing(properties: PropertyData[]) {
  const adjustedValues = properties.map((p) => adjustToPresent(referenceValue(p), p.year));
  const adjustedPerSqm = properties.map((p, i) =>
    p.area > 0 ? Math.round(adjustedValues[i] / p.area) : 0,
  );

  const minValue = Math.min(...adjustedValues);
  const maxValue = Math.max(...adjustedValues);
  const avgValue = Math.round(adjustedValues.reduce((a, b) => a + b, 0) / adjustedValues.length);

  const minPerSqm = Math.min(...adjustedPerSqm);
  const maxPerSqm = Math.max(...adjustedPerSqm);
  const avgPerSqm = Math.round(adjustedPerSqm.reduce((a, b) => a + b, 0) / adjustedPerSqm.length);

  const rentFactor = 0.005;
  const minRent = Math.round(minValue * rentFactor);
  const maxRent = Math.round(maxValue * rentFactor);
  const avgRent = Math.round(avgValue * rentFactor);

  return {
    sale: { min: minValue, avg: avgValue, max: maxValue },
    perSqm: { min: minPerSqm, avg: avgPerSqm, max: maxPerSqm },
    rent: { min: minRent, avg: avgRent, max: maxRent },
  };
}

export function formatCurrency(value: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(value);
}
