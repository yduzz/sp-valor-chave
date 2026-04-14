import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import * as XLSX from "https://esm.sh/xlsx@0.18.5";

const PREFEITURA_PAGE_URL = "https://prefeitura.sp.gov.br/fazenda/w/acesso_a_informacao/31501";
const TARGET_YEARS = [2026, 2025, 2024, 2023];
const MAX_RESULTS = 40;
const USER_AGENT = "Mozilla/5.0 (compatible; SPValuation/1.0)";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SEARCH_STOPWORDS = new Set([
  "RUA",
  "AVENIDA",
  "ALAMEDA",
  "TRAVESSA",
  "PRACA",
  "LARGO",
  "RODOVIA",
  "DO",
  "DA",
  "DE",
  "DOS",
  "DAS",
  "E",
  "SAO",
  "PAULO",
  "SP",
  "BRASIL",
]);

const WORD_EXPANSIONS: Record<string, string> = {
  R: "RUA",
  AV: "AVENIDA",
  AL: "ALAMEDA",
  TV: "TRAVESSA",
  TRAV: "TRAVESSA",
  PCA: "PRACA",
  PCA.: "PRACA",
  DR: "DOUTOR",
  DRA: "DOUTORA",
  PROF: "PROFESSOR",
  PROFA: "PROFESSORA",
  SEN: "SENADOR",
  DEP: "DEPUTADO",
  PE: "PADRE",
  STA: "SANTA",
  STO: "SANTO",
  GAL: "GENERAL",
  CEL: "CORONEL",
  MAL: "MARECHAL",
  CAP: "CAPITAO",
  BRIG: "BRIGADEIRO",
  CARD: "CARDEAL",
};

const LOWERCASE_WORDS = new Set(["da", "de", "do", "dos", "das", "e"]);

type CellValue = string | number | boolean | null | undefined;

interface SearchPayload {
  query?: string;
}

interface ScrapedProperty {
  address: string;
  neighborhood: string | null;
  area: number | null;
  venal_value: number;
  property_type: string | null;
  year: number;
  fiscal_zone: string | null;
  price_per_sqm: number | null;
  ad_link: string | null;
}

type PropertyKey = Pick<ScrapedProperty, "address" | "year" | "venal_value" | "area">;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  try {
    const { query } = (await req.json().catch(() => ({}))) as SearchPayload;

    if (!query?.trim()) {
      return jsonResponse({ error: "Informe um endereço para busca." }, 400);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !supabaseKey) {
      return jsonResponse({ error: "Configuração do backend indisponível." }, 500);
    }

    const supabase = createClient(supabaseUrl, supabaseKey);
    const scrapedProperties = await searchPrefeituraFiles(query);

    if (scrapedProperties.length === 0) {
      return jsonResponse({
        message: "Nenhuma transação encontrada para este endereço nos arquivos públicos da Prefeitura.",
        properties: [],
      });
    }

    const propertyKeys = new Set(scrapedProperties.map(buildPropertyKey));
    const addresses = [...new Set(scrapedProperties.map((property) => property.address))];
    const years = [...new Set(scrapedProperties.map((property) => property.year))];

    const { data: existingRows, error: existingError } = await supabase
      .from("properties")
      .select("*")
      .in("address", addresses)
      .in("year", years);

    if (existingError) throw existingError;

    const existingProperties = (existingRows ?? []) as ScrapedProperty[];
    const existingKeys = new Set(existingProperties.map(buildPropertyKey));
    const missingProperties = scrapedProperties.filter((property) => !existingKeys.has(buildPropertyKey(property)));

    let insertedProperties: ScrapedProperty[] = [];

    if (missingProperties.length > 0) {
      const { data: insertedRows, error: insertError } = await supabase
        .from("properties")
        .insert(missingProperties)
        .select("*");

      if (insertError) throw insertError;
      insertedProperties = (insertedRows ?? []) as ScrapedProperty[];
    }

    const properties = [...existingProperties, ...insertedProperties]
      .filter((property) => propertyKeys.has(buildPropertyKey(property)))
      .sort((a, b) => b.year - a.year || b.venal_value - a.venal_value)
      .slice(0, MAX_RESULTS);

    return jsonResponse({
      message: `${properties.length} transação(ões) encontrada(s).`,
      properties,
    });
  } catch (error) {
    return jsonResponse(
      { error: error instanceof Error ? error.message : "Erro inesperado ao buscar transações." },
      500,
    );
  }
});

async function searchPrefeituraFiles(query: string) {
  const response = await fetch(PREFEITURA_PAGE_URL, {
    headers: { "User-Agent": USER_AGENT },
  });

  if (!response.ok) {
    throw new Error(`A Prefeitura respondeu com status ${response.status}.`);
  }

  const html = await response.text();
  const yearLinks = extractYearLinks(html);

  const results = await Promise.all(
    TARGET_YEARS.map(async (year) => {
      const fileUrl = yearLinks.get(year);
      if (!fileUrl) return [] as Array<{ property: ScrapedProperty; score: number }>;

      const workbook = await fetchWorkbook(fileUrl);
      return findMatchesInWorkbook(workbook, query, year);
    }),
  );

  const seenKeys = new Set<string>();

  return results
    .flat()
    .sort((a, b) => b.score - a.score || b.property.year - a.property.year || b.property.venal_value - a.property.venal_value)
    .map(({ property }) => property)
    .filter((property) => {
      const key = buildPropertyKey(property);
      if (seenKeys.has(key)) return false;
      seenKeys.add(key);
      return true;
    })
    .slice(0, MAX_RESULTS);
}

async function fetchWorkbook(fileUrl: string) {
  const response = await fetch(fileUrl, {
    headers: { "User-Agent": USER_AGENT },
  });

  if (!response.ok) {
    throw new Error(`Não foi possível baixar o arquivo público ${fileUrl}.`);
  }

  return XLSX.read(await response.arrayBuffer(), { type: "array" });
}

function extractYearLinks(html: string) {
  const links = new Map<number, string>();
  const linkPattern = /<li[^>]*>\s*<strong>\s*(20\d{2})\s*\(<a href="([^"]+)"[^>]*>\s*Excel\/xlsx\s*<\/a>/gi;

  for (const match of html.matchAll(linkPattern)) {
    const year = Number(match[1]);
    if (!TARGET_YEARS.includes(year)) continue;

    links.set(year, new URL(decodeHtml(match[2]), PREFEITURA_PAGE_URL).href);
  }

  return links;
}

function findMatchesInWorkbook(workbook: XLSX.WorkBook, query: string, year: number) {
  const matches: Array<{ property: ScrapedProperty; score: number }> = [];

  for (const sheetName of workbook.SheetNames) {
    if (!isDataSheet(sheetName)) continue;

    const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], {
      header: 1,
      raw: true,
      defval: null,
      blankrows: false,
    }) as CellValue[][];

    for (const row of rows) {
      const property = mapRowToProperty(row, year);
      if (!property) continue;

      const score = scorePropertyMatch(property, query);
      if (score > 0) {
        matches.push({ property, score });
      }
    }
  }

  return matches;
}

function isDataSheet(sheetName: string) {
  return !/LEGENDA|EXPLICA|TABELA/i.test(sheetName);
}

function mapRowToProperty(row: CellValue[], year: number): ScrapedProperty | null {
  const street = normalizeStringCell(row[1]);
  const transactionValue = normalizeNumericCell(row[8]);

  if (!street || !transactionValue || transactionValue <= 0) {
    return null;
  }

  const houseNumber = normalizeHouseNumber(row[2]);
  const complement = normalizeStringCell(row[3]);
  const neighborhood = toDisplayCase(normalizeStringCell(row[4]));
  const area = normalizeNumericCell(row[22]);
  const propertyType = toDisplayCase(normalizeStringCell(row[24] || row[26]));
  const address = formatAddress(street, houseNumber, complement);

  return {
    address,
    neighborhood: neighborhood || null,
    area: area && area > 0 ? Math.round(area * 100) / 100 : null,
    venal_value: Math.round(transactionValue * 100) / 100,
    property_type: propertyType || null,
    year,
    fiscal_zone: null,
    price_per_sqm: area && area > 0 ? Math.round(transactionValue / area) : null,
    ad_link: null,
  };
}

function scorePropertyMatch(property: ScrapedProperty, query: string) {
  const queryTokens = extractTokens(query);
  if (queryTokens.length === 0) return 0;

  const propertyTokens = new Set(extractTokens(`${property.address} ${property.neighborhood ?? ""}`));
  const matchedTokens = queryTokens.filter((token) => propertyTokens.has(token));
  const minimumMatches = Math.max(1, Math.ceil(queryTokens.length * 0.5));

  if (matchedTokens.length < minimumMatches) {
    return 0;
  }

  let score = matchedTokens.length * 10;
  const queryNumber = extractFirstNumber(query);
  const propertyNumber = extractFirstNumber(property.address);

  if (queryNumber) {
    score += propertyNumber === queryNumber ? 25 : -5;
  }

  return score;
}

function extractTokens(value: string) {
  return normalizeText(value)
    .split(" ")
    .filter((token) => token.length > 1 && !SEARCH_STOPWORDS.has(token));
}

function normalizeText(value: string) {
  return expandAbbreviations(stripAccents(value).toUpperCase())
    .replace(/[^A-Z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function expandAbbreviations(value: string) {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .map((token) => WORD_EXPANSIONS[token.replace(/\./g, "")] ?? token)
    .join(" ");
}

function stripAccents(value: string) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function extractFirstNumber(value: string) {
  const match = stripAccents(value).toUpperCase().match(/\b\d+[A-Z0-9/-]*\b/);
  return match ? match[0] : null;
}

function formatAddress(street: string, houseNumber: string | null, complement: string | null) {
  let address = toDisplayCase(street);

  if (houseNumber) {
    address += `, ${houseNumber}`;
  }

  if (complement) {
    address += ` - ${toDisplayCase(complement)}`;
  }

  return address;
}

function toDisplayCase(value: string) {
  if (!value) return "";

  return expandAbbreviations(stripAccents(value).toUpperCase())
    .toLowerCase()
    .split(" ")
    .filter(Boolean)
    .map((word, index) => {
      if (LOWERCASE_WORDS.has(word) && index > 0) {
        return word;
      }

      return word.charAt(0).toUpperCase() + word.slice(1);
    })
    .join(" ");
}

function normalizeStringCell(value: CellValue) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeNumericCell(value: CellValue) {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  const text = normalizeStringCell(value);
  if (!text) return null;

  const normalized = text.includes(",") ? text.replace(/\./g, "").replace(",", ".") : text;
  const numericValue = Number(normalized);

  return Number.isFinite(numericValue) ? numericValue : null;
}

function normalizeHouseNumber(value: CellValue) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  if (typeof value === "number") {
    return String(Math.trunc(value));
  }

  const text = normalizeStringCell(value);
  return text ? text.replace(/\.0+$/, "") : null;
}

function decodeHtml(value: string) {
  return value.replace(/&amp;/g, "&");
}

function buildPropertyKey(property: PropertyKey) {
  return [
    normalizeText(property.address),
    String(property.year),
    property.venal_value.toFixed(2),
    property.area === null ? "null" : String(property.area),
  ].join("|");
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}
