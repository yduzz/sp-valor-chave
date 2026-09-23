/**
 * NormalizaÃ§Ã£o canÃ´nica de endereÃ§os.
 * Usada tanto pelo autocomplete quanto pela busca no banco, para que
 * "Av. Brig. Faria Lima" e "AV BRIG FARIA LIMA" gerem os mesmos tokens.
 */

/** Forma canÃ´nica (sempre a versÃ£o POR EXTENSO) de cada abreviaÃ§Ã£oconhecida. */
export const CANONICAL_TOKEN: Record<string, string> = {
  R: "RUA", RUA: "RUA",
  AV: "AVENIDA", AVE: "AVENIDA", AVENIDA: "AVENIDA",
  AL: "ALAMEDA", ALAMEDA: "ALAMEDA",
  TV: "TRAVESSA", TRAV: "TRAVESSA", TRAVESSA: "TRAVESSA",
  PCA: "PRACA", PC: "PRACA", PRACA: "PRACA",
  LG: "LARGO", LARGO: "LARGO",
  EST: "ESTRADA", ESTR: "ESTRADA", ESTRADA: "ESTRADA",
  ROD: "RODOVIA", RODOVIA: "RODOVIA",
  VD: "VIADUTO", VIADUTO: "VIADUTO",
  MARG: "MARGINAL", MARGINAL: "MARGINAL",
  DR: "DOUTOR", DOUTOR: "DOUTOR",
  DRA: "DOUTORA", DOUTORA: "DOUTORA",
  PROF: "PROFESSOR", PROFESSOR: "PROFESSOR",
  PROFA: "PROFESSORA", PROFESSORA: "PROFESSORA",
  SEN: "SENADOR", SENADOR: "SENADOR",
  DEP: "DEPUTADO", DEPUTADO: "DEPUTADO",
  PE: "PADRE", PADRE: "PADRE",
  STA: "SANTA", SANTA: "SANTA",
  STO: "SANTO", SANTO: "SANTO",
  S: "SAO", SAO: "SAO",
  GAL: "GENERAL", GEN: "GENERAL", GENERAL: "GENERAL",
  CEL: "CORONEL", CORONEL: "CORONEL",
  MAL: "MARECHAL", MARECHAL: "MARECHAL",
  CAP: "CAPITAO", CAPITAO: "CAPITAO",
  BRIG: "BRIGADEIRO", BRIGADEIRO: "BRIGADEIRO",
  CARD: "CARDEAL", CARDEAL: "CARDEAL",
  PRES: "PRESIDENTE", PRESIDENTE: "PRESIDENTE",
  ENG: "ENGENHEIRO", ENGENHEIRO: "ENGENHEIRO",
  MIN: "MINISTRO", MINISTRO: "MINISTRO",
  CONS: "CONSELHEIRO", CONSELHEIRO: "CONSELHEIRO",
  DES: "DESEMBARGADOR", DESEMBARGADOR: "DESEMBARGADOR",
  BR: "BARAO", BAR: "BARAO", BARAO: "BARAO",
  VISC: "VISCONDE", VISCONDE: "VISCONDE",
  MAR: "MARQUES", MARQUES: "MARQUES",
  CDE: "CONDE", CONDE: "CONDE",
  DQ: "DUQUE", DUQUE: "DUQUE",
  DOM: "DOM", D: "DOM",
  JD: "JARDIM", JARDIM: "JARDIM",
  PQ: "PARQUE", PARQUE: "PARQUE",
  VL: "VILA", VILA: "VILA",
  CJ: "CONJUNTO", CONJ: "CONJUNTO", CONJUNTO: "CONJUNTO",
};

/** Todas as grafias equivalentes de um token canÃ´nico (para ILIKE no banco). */
const VARIANTS_BY_CANONICAL: Record<string, string[]> = (() => {
  const map: Record<string, string[]> = {};
  for (const [variant, canonical] of Object.entries(CANONICAL_TOKEN)) {
    (map[canonical] ??= []).push(variant);
  }
  return map;
})();

/** Palavras de ligaÃ§Ã£o â€” irrelevantes para a busca. */
export const CONNECTORS = new Set(["DE", "DA", "DO", "DAS", "DOS", "E","EM", "AO", "A", "O"]);

/**
 * Normaliza uma string de endereÃ§o:
 * - remove acentos
 * - maiÃºsculas
 * - remove pontuaÃ§Ã£o (pontos, vÃrgulas, hÃfens soltos, aspas, parÃªnteses)
 * - colapsa espaÃ§os
 */
export function normalizeAddress(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    // separador de milhar em nÃºmeros de porta: "1.500" / "1 500" â†’ "1500"
    .replace(/(\d)[.\s](\d{3})\b/g, "$1$2")
    .replace(/[.,;:'"()\[\]]/g, " ")
    .replace(/\s-\s/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}


/** Converte um token para sua forma canÃ´nica por extenso. */
export function canonicalToken(token: string): string {
  return CANONICAL_TOKEN[token] ?? token;
}

/** Retorna todas as grafias equivalentes de um token (inclui ele mesmo). */
export function tokenVariants(token: string): string[] {
  const canonical = canonicalToken(token);
  const variants = VARIANTS_BY_CANONICAL[canonical] ?? [];
  return [...new Set([canonical, token, ...variants])];
}

export interface ParsedAddress {
  /** EndereÃ§o normalizado completo (sem acentos/pontuaÃ§Ã£o). */
  normalized: string;
  /** Parte do logradouro, sem o nÃºmero final. */
  street: string;
  /** NÃºmero da porta, se digitado. */
  number: string | null;
  /** Tokens do logradouro em forma canÃ´nica, sem conectores. */
  tokens: string[];
}

const UNIT_DETAILS_RE =
  /\s+(AP|APTO|APT|APARTAMENTO|CJ|CONJ|CONJUNTO|CASA|SALA|BL|BLOCO|LJ|LOJA|SL|CS|LOTE|UNID|UNIDADE|VG|BOX|FLAT|STUDIO|ANDAR|TORRE|N|NO)\b.*$/;

/** Remove complementos (Ap 42, Bloco B, ...) de um endereÃ§o normalizado. */
export function stripUnitDetails(normalizedAddress: string): string {
  return normalizedAddress.replace(UNIT_DETAILS_RE, "").trim();
}

/** Faz o parse completo de um endereÃ§o digitado ou vindo do banco. */
export function parseAddress(value: string): ParsedAddress {
  const normalized = normalizeAddress(value);
  const withoutUnit = stripUnitDetails(normalized);

  let number: string | null = null;
  let streetPart = withoutUnit;

  const trailing = withoutUnit.match(/\s(\d+[A-Z0-9/-]*)\s*$/);
  if (trailing) {
    number = trailing[1];
    streetPart = withoutUnit.slice(0, withoutUnit.length - trailing[0].length);
  } else {
    // NÃºmero no meio da string: "Alameda Santos 700, Jardim Paulista".
    const parts = withoutUnit.split(" ");
    const idx = parts.findIndex((w, i) => i > 0 && /^\d{1,6}[A-Z]?$/.test(w));
    if (idx > 0) {
      number = parts[idx];
      streetPart = parts.slice(0, idx).join(" ");
    }
  }

  const street = streetPart.trim();

  const tokens = street

    .split(" ")
    .filter((w) => w.length > 0 && !CONNECTORS.has(w))
    .map(canonicalToken)
    .filter((w) => w.length >= 2);

  return { normalized, street, number, tokens };
}