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

  // Detect if user typed a number at the end (e.g. "Rua Augusta 500")
  const userTypedNumber = /\s+\d+[A-Za-z0-9/-]*\s*$/.test(query.trim());

  // Common neighborhood/city words to drop when matching addresses
  const STOP_WORDS = new Set([
    "PINHEIROS", "PERDIZES", "ITAIM", "BIBI", "MOEMA", "JARDINS", "JARDIM",
    "VILA", "MADALENA", "OLIMPIA", "PAULISTA", "BROOKLIN", "MORUMBI",
    "CONSOLACAO", "LIBERDADE", "BELA", "SANTANA", "TATUAPE", "MOOCA",
    "IPIRANGA", "SAUDE", "CAMPO", "BELO", "CENTRO", "REPUBLICA",
    "HIGIENOPOLIS", "SUMARE", "LAPA", "BUTANTA", "PACAEMBU",
    "SAO", "PAULO", "SP", "BRASIL",
  ]);

  const variants = buildSearchVariants(query);

  // Also build a "core" variant: drop stop words (neighborhoods/city)
  const coreVariants = variants.map(v => {
    const filtered = v.split(" ").filter(w => !STOP_WORDS.has(w));
    return filtered.join(" ").trim();
  }).filter(v => v.length >= 2);

  // Build a key-words variant using ILIKE wildcards between words
  // e.g. "RUA CARDEAL ARCOVERDE" → "%CARDEAL%ARCOVERDE%"
  const keyWordPatterns = new Set<string>();
  for (const v of [...variants, ...coreVariants]) {
    const words = v.split(" ").filter(w => w.length >= 3 && !["RUA","R","AVENIDA","AV","ALAMEDA","AL","TRAVESSA","TV","PRACA","PCA","ESTRADA","EST","RODOVIA","ROD","LARGO","LG"].includes(w));
    if (words.length >= 1) {
      keyWordPatterns.add("%" + words.join("%") + "%");
    }
  }

  const allPatterns = [
    ...new Set([
      ...variants.slice(0, 3).map(v => `%${v}%`),
      ...coreVariants.slice(0, 2).map(v => `%${v}%`),
      ...[...keyWordPatterns].slice(0, 3),
    ]),
  ];

  // Run queries in parallel
  const promises = allPatterns.slice(0, 6).map(pattern =>
    supabase
      .from("properties")
      .select("address")
      .ilike("address", pattern)
      .limit(200)
  );

  const results = await Promise.all(promises);

  // Merge addresses; if user did NOT type a number, group by street name only
  const grouped = new Map<string, { street: string; count: number; example: string }>();

  for (const { data } of results) {
    if (!data) continue;
    for (const row of data) {
      const cleaned = stripUnitDetails(row.address);
      const key = userTypedNumber ? cleaned : stripStreetNumber(cleaned);
      if (!grouped.has(key)) {
        grouped.set(key, { street: key, count: 0, example: row.address });
      }
      grouped.get(key)!.count++;
    }
  }

  // Sort by count descending and return top results
  return [...grouped.values()]
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);
}

/**
 * Remove unit/apartment details from an address (AP, CJ, CASA, etc.).
 */
function stripUnitDetails(address: string): string {
  return address
    .replace(/\s+(AP|APTO|APT|CJ|CASA|SALA|CONJ|BL|BLOCO|LJ|LOJA|SL|CS|LOTE)\s+.*/i, "")
    .replace(/\s+\d+\.\d+$/, "")
    .trim();
}

/**
 * Remove the trailing street number from a cleaned address.
 * "RUA CARDEAL ARCOVERDE 1070" → "RUA CARDEAL ARCOVERDE"
 * "RUA X 1980 A 2004" → "RUA X"
 */
function stripStreetNumber(address: string): string {
  return address
    .replace(/\s+\d+(\s*[A-Z]?\s+A\s+\d+)?\s*$/i, "")
    .replace(/\s+\d+[A-Za-z0-9/-]*\s*$/, "")
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
