import { MarketSource } from "./types.ts";
import { fipezapSource } from "./fipezap.ts";
import { creciSpSource } from "./crecisp.ts";

/**
 * Registro de fontes. Para adicionar IBGE, BACEN, IPCA, IGP-M, SECOVI, etc.,
 * basta criar um novo arquivo que implemente `MarketSource` e incluí-lo aqui.
 */
export const SOURCES: MarketSource[] = [fipezapSource, creciSpSource];

export function getSources(ids?: string[]): MarketSource[] {
  if (!ids || ids.length === 0) return SOURCES;
  return SOURCES.filter((s) => ids.includes(s.id));
}
