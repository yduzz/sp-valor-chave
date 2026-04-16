import { supabase } from "@/integrations/supabase/client";

const ABBREVIATIONS: Record<string, string[]> = {
  RUA: ["R", "RUA"],
  R: ["R", "RUA"],
  AVENIDA: ["AV", "AVENIDA"],
  AV: ["AV", "AVENIDA"],
  ALAMEDA: ["AL", "ALAMEDA"],
  AL: ["AL", "ALAMEDA"],
  TRAVESSA: ["TV", "TRAV", "TRAVESSA"],
  TV: ["TV", "TRAV", "TRAVESSA"],
  PRACA: ["PCA", "PRACA"],
  PCA: ["PCA", "PRACA"],
  DOUTOR: ["DR", "DOUTOR"],
  DR: ["DR", "DOUTOR"],
  PROFESSOR: ["PROF", "PROFESSOR"],
  PROF: ["PROF", "PROFESSOR"],
  SENADOR: ["SEN", "SENADOR"],
  SEN: ["SEN", "SENADOR"],
  PADRE: ["PE", "PADRE"],
  PE: ["PE", "PADRE"],
  SANTA: ["STA", "SANTA"],
  STA: ["STA", "SANTA"],
  SANTO: ["STO", "SANTO"],
  STO: ["STO", "SANTO"],
  GENERAL: ["GAL", "GENERAL"],
  GAL: ["GAL", "GENERAL"],
  CORONEL: ["CEL", "CORONEL"],
  CEL: ["CEL", "CORONEL"],
  MARECHAL: ["MAL", "MARECHAL"],
  MAL: ["MAL", "MARECHAL"],
  CARDEAL: ["CARD", "CARDEAL"],
  CARD: ["CARD", "CARDEAL"],
  PRESIDENTE: ["PRES", "PRESIDENTE"],
  PRES: ["PRES", "PRESIDENTE"],
  ENGENHEIRO: ["ENG", "ENGENHEIRO"],
  ENG: ["ENG", "ENGENHEIRO"],
  BARAO: ["BR", "BARAO"],
  VISCONDE: ["VISC", "VISCONDE"],
  LARGO: ["LG", "LARGO"],
  LG: ["LG", "LARGO"],
  ESTRADA: ["EST", "ESTRADA"],
  EST: ["EST", "ESTRADA"],
  RODOVIA: ["ROD", "RODOVIA"],
  ROD: ["ROD", "RODOVIA"],
};

export interface AddressSuggestion {
  street: string;
  example: string;
  count: number;
}

/**
 * Build multiple search variants by expanding abbreviations.
 * E.g. "Rua Cardeal Arcoverde" → ["R CARD ARCOVERDE", "RUA CARDEAL ARCOVERDE", ...]
 */
function buildSearchVariants(query: string): string[] {
  const normalized = query
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[.,]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const words = normalized.split(" ");
  
  // Get all distinctive words (skip numbers at the end)
  const numberMatch = normalized.match(/\s+(\d+[A-Za-z0-9/-]*)\s*$/);
  const withoutNumber = normalized.replace(/\s+\d+[A-Za-z0-9/-]*\s*$/, "").trim();
  const keyWords = withoutNumber.split(" ");

  // Build variants: for each word that has abbreviation mappings, try all variants
  const variants = new Set<string>();

  // Original as-is (without number for street search)
  variants.add(withoutNumber);

  // Try abbreviation expansion: replace first word and known words
  const expanded = keyWords.map(w => {
    const abbr = ABBREVIATIONS[w];
    return abbr ? abbr : [w];
  });

  // Generate combinations (limit to avoid explosion)
  function combine(parts: string[][], idx: number, current: string[]): void {
    if (idx === parts.length) {
      variants.add(current.join(" "));
      return;
    }
    for (const option of parts[idx]) {
      if (variants.size > 10) return;
      combine(parts, idx + 1, [...current, option]);
    }
  }
  combine(expanded, 0, []);

  return [...variants].filter(v => v.length >= 2);
}

export async function searchAddressesInDB(query: string): Promise<AddressSuggestion[]> {
  if (query.trim().length < 2) return [];

  const variants = buildSearchVariants(query);
  
  // Run queries for all variants in parallel
  const promises = variants.slice(0, 4).map(variant =>
    supabase
      .from("properties")
      .select("address")
      .ilike("address", `%${variant}%`)
      .limit(200)
  );

  const results = await Promise.all(promises);

  // Merge all addresses
  const allAddresses = new Map<string, { street: string; count: number; example: string }>();
  
  for (const { data } of results) {
    if (!data) continue;
    for (const row of data) {
      // Extract street name (without apartment/unit details)
      const street = extractStreetName(row.address);
      if (!allAddresses.has(street)) {
        allAddresses.set(street, { street, count: 0, example: row.address });
      }
      allAddresses.get(street)!.count++;
    }
  }

  // Sort by count descending and return top results
  return [...allAddresses.values()]
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);
}

/**
 * Extract the base street + number from a full address,
 * removing apartment/unit details like "AP 11 E VG", "CJ 01", "CASA 5" etc.
 */
function extractStreetName(address: string): string {
  // Remove unit details: AP, CJ, CASA, SALA, CONJ, BL, BLOCO, LJ, LOJA, SL, CS, lote
  return address
    .replace(/\s+(AP|CJ|CASA|SALA|CONJ|BL|BLOCO|LJ|LOJA|SL|CS|LOTE)\s+.*/i, "")
    .replace(/\s+\d+\.\d+$/, "") // remove trailing decimal numbers like "1001.0"
    .trim();
}

/**
 * Format a street name for display: capitalize properly
 */
export function formatStreetDisplay(street: string): string {
  const EXPAND: Record<string, string> = {
    R: "Rua", AV: "Avenida", AL: "Alameda", TV: "Travessa",
    TRAV: "Travessa", PCA: "Praça", DR: "Dr.", PROF: "Prof.",
    SEN: "Sen.", PE: "Pe.", STA: "Santa", STO: "Santo",
    GAL: "Gen.", CEL: "Cel.", MAL: "Mal.", CARD: "Cardeal",
    PRES: "Pres.", ENG: "Eng.", LG: "Largo", EST: "Estrada",
    ROD: "Rodovia", BR: "Barão", VISC: "Visconde",
  };

  return street
    .split(" ")
    .map((w, i) => {
      const upper = w.toUpperCase();
      if (i === 0 && EXPAND[upper]) return EXPAND[upper];
      if (EXPAND[upper]) return EXPAND[upper];
      // Capitalize first letter
      return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
    })
    .join(" ");
}
