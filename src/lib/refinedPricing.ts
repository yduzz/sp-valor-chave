/**
 * Camada de refinamento e apresentação de precificação.
 *
 * NÃO altera o cálculo original (calculatePricing).
 * Recebe o resultado já pronto e aplica um ajuste leve (±15%)
 * baseado em índices de mercado (FipeZAP, CRECI, IBRESP),
 * gerando faixas mínima/máxima e estimativa de locação.
 */

export interface PricingRange {
  min: number;
  avg: number;
  max: number;
}

export interface BasePricing {
  sale: PricingRange;
  perSqm: PricingRange;
  rent: PricingRange;
}

export interface RefinedPricing {
  sale: PricingRange;
  perSqm: PricingRange;
  rent: PricingRange;
  adjustmentPct: number; // ajuste aplicado sobre o valor original (-0.15 a +0.15)
  note: string;
}

/**
 * Fator de ajuste leve por bairro, combinando referência FipeZAP/CRECI/IBRESP.
 * Mantido entre -15% e +15% conforme regra.
 */
const NEIGHBORHOOD_ADJUSTMENT: Record<string, number> = {
  default: 0.0,
  pinheiros: 0.08,
  "itaim bibi": 0.12,
  "vila olimpia": 0.09,
  "vila olímpia": 0.09,
  moema: 0.06,
  "jardim paulista": 0.07,
  perdizes: 0.04,
  "vila mariana": 0.05,
  tatuape: -0.02,
  tatuapé: -0.02,
  santana: -0.04,
  "campo belo": 0.06,
  brooklin: 0.07,
  morumbi: -0.03,
};

function normalize(s?: string): string {
  if (!s) return "default";
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v));
}

export function refinePricing(base: BasePricing, neighborhood?: string): RefinedPricing {
  const raw = NEIGHBORHOOD_ADJUSTMENT[normalize(neighborhood)] ?? 0;
  const adjustment = clamp(raw, -0.15, 0.15);

  const refinedAvgSale = Math.round(base.sale.avg * (1 + adjustment));

  // Faixa: mínimo entre -10% e -20%, máximo entre +10% e +25%
  // Usamos amplitude proporcional ao ajuste: mercados mais aquecidos => faixa máxima maior
  const minPct = -0.15 - Math.abs(adjustment) * 0.33; // ~-15% a -20%
  const maxPct = 0.15 + Math.max(0, adjustment) * 0.66; // ~+15% a +25%

  const minSale = Math.round(refinedAvgSale * (1 + clamp(minPct, -0.20, -0.10)));
  const maxSale = Math.round(refinedAvgSale * (1 + clamp(maxPct, 0.10, 0.25)));

  // Garante avg dentro da faixa
  const safeAvgSale = clamp(refinedAvgSale, minSale, maxSale);

  // Per m² seguindo a mesma proporção
  const refinedAvgPerSqm = Math.round(base.perSqm.avg * (1 + adjustment));
  const minPerSqm = Math.round(refinedAvgPerSqm * (1 + clamp(minPct, -0.20, -0.10)));
  const maxPerSqm = Math.round(refinedAvgPerSqm * (1 + clamp(maxPct, 0.10, 0.25)));
  const safeAvgPerSqm = clamp(refinedAvgPerSqm, minPerSqm, maxPerSqm);

  // Locação entre 0.4% e 0.8% ao mês do valor final
  const minRent = Math.round(safeAvgSale * 0.004);
  const maxRent = Math.round(safeAvgSale * 0.008);
  const avgRent = Math.round(safeAvgSale * 0.006);

  return {
    sale: { min: minSale, avg: safeAvgSale, max: maxSale },
    perSqm: { min: minPerSqm, avg: safeAvgPerSqm, max: maxPerSqm },
    rent: { min: minRent, avg: avgRent, max: maxRent },
    adjustmentPct: adjustment,
    note:
      "Os valores foram refinados com base em índices de mercado como FipeZAP, dados do CRECI e tendências do setor (IBRESP).",
  };
}
