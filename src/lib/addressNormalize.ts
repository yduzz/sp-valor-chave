/**
 * Normalização canônica de endereços.
 * Usada tanto pelo autocomplete quanto pela busca no banco, para que
 * "Av. Brig. Faria Lima" e "AV BRIG FARIA LIMA" gerem os mesmos tokens.
 */

/** Forma canônica (sempre a versão POR EXTENSO) de cada abreviação conhecida. */
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

/** Todas as grafias equivalentes de um token canônico (para ILIKE no banco). */
const VARIANTS_BY_CANONICAL: Record<string, string[]> = (() => {
  const map: Record<string, string[]> = {};
  for (const [variant, canonical] of Object.entries(CANONICAL_TOKEN)) {
    (map[canonical] ??= []).push(variant);
  }
  return map;
})();

/** Palavras de ligação — irrelevantes para a busca. */
export const CONNECTORS = new Set(["DE", "DA", "DO", "DAS", "DOS", "E", "EM", "AO", "A", "O"]);

/**
 * Normaliza uma string de endereço:
 * - remove acentos
 * - maiúsculas
 * - remove pontuação (pontos, vírgulas, hífens soltos, aspas, parênteses)
 * - colapsa espaços
 */
export function normalizeAddress(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[.,;:'"()\[\]]/g, " ")
    .replace(/\s-\s/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Converte um token para sua forma canônica por extenso. */
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
  /** Endereço normalizado completo (sem acentos/pontuação). */
  normalized: string;
  /** Parte do logradouro, sem o número final. */
  street: string;
  /** Número da porta, se digitado. */
  number: string | null;
  /** Tokens do logradouro em forma canônica, sem conectores. */
  tokens: string[];
}

const UNIT_DETAILS_RE =
  /\s+(AP|APTO|APT|APARTAMENTO|CJ|CONJ|CONJUNTO|CASA|SALA|BL|BLOCO|LJ|LOJA|SL|CS|LOTE|UNID|UNIDADE|VG|BOX|FLAT|STUDIO|ANDAR|TORRE|N|NO)\b.*$/;

/** Remove complementos (Ap 42, Bloco B, ...) de um endereço normalizado. */
export function stripUnitDetails(normalizedAddress: string): string {
  return normalizedAddress.replace(UNIT_DETAILS_RE, "").trim();
}

/** Faz o parse completo de um endereço digitado ou vindo do banco. */
export function parseAddress(value: string): ParsedAddress {
  const normalized = normalizeAddress(value);
  const withoutUnit = stripUnitDetails(normalized);

  const numberMatch = withoutUnit.match(/\s(\d+[A-Z0-9/-]*)\s*$/);
  const number = numberMatch ? numberMatch[1] : null;
  const street = (number
    ? withoutUnit.slice(0, withoutUnit.length - numberMatch![0].length)
    : withoutUnit
  ).trim();

  const tokens = street
    .split(" ")
    .filter((w) => w.length > 0 && !CONNECTORS.has(w))
    .map(canonicalToken)
    .filter((w) => w.length >= 2);

  return { normalized, street, number, tokens };
}
