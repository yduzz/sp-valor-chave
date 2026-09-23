require("dotenv").config();

const fs = require("fs");
const path = require("path");

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;

const CSV_PATH = path.resolve(
  __dirname,
  "../data/itbi/converted/itbi_2010.csv"
);

const YEAR = 2010;
const IMPORT_ID = "5a2addf4-37f6-4ac9-b8de-6ea481226a0a";

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("ERRO: variaveis do Supabase nao encontradas no .env");
  process.exit(1);
}

if (!fs.existsSync(CSV_PATH)) {
  console.error("ERRO: CSV nao encontrado:");
  console.error(CSV_PATH);
  process.exit(1);
}

function parseCSVLine(line) {
  const result = [];
  let current = "";
  let insideQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (char === '"') {
      if (insideQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        insideQuotes = !insideQuotes;
      }
      continue;
    }

    if (char === "," && !insideQuotes) {
      result.push(current);
      current = "";
      continue;
    }

    current += char;
  }

  result.push(current);

  return result;
}

function normalize(value) {
  if (value === null || value === undefined) return "";
  return String(value).trim().toUpperCase();
}

function normalizeNumber(value) {
  if (value === null || value === undefined || value === "") {
    return "";
  }

  const number = Number(value);

  if (!Number.isFinite(number)) {
    return normalize(value);
  }

  return number.toFixed(2);
}

function makeKey(row) {
  return [
    normalize(row.address),
    normalize(row.neighborhood),
    normalize(row.transaction_date),
    normalizeNumber(row.transaction_value),
    normalizeNumber(row.area),
    normalizeNumber(row.venal_value),
    normalize(row.matricula),
  ].join("|");
}

async function supabaseFetch(url) {
  const response = await fetch(url, {
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      "Content-Type": "application/json",
    },
  });

  const text = await response.text();

  if (!response.ok) {
    throw new Error(
      `Supabase HTTP ${response.status}: ${text}`
    );
  }

  return text ? JSON.parse(text) : [];
}

async function fetchAllProperties() {
  const pageSize = 1000;
  let offset = 0;
  const rows = [];

  console.log("Consultando registros de 2010 no Supabase...\n");

  while (true) {
    const url =
      `${SUPABASE_URL}/rest/v1/properties` +
      `?select=address,neighborhood,area,venal_value,` +
      `transaction_value,transaction_date,matricula,year,import_id` +
      `&year=eq.${YEAR}` +
      `&import_id=eq.${IMPORT_ID}` +
      `&offset=${offset}` +
      `&limit=${pageSize}`;

    const batch = await supabaseFetch(url);

    rows.push(...batch);

    console.log(
      `Banco: ${rows.length.toLocaleString("pt-BR")} registros`
    );

    if (batch.length < pageSize) {
      break;
    }

    offset += pageSize;
  }

  return rows;
}

function readCSV() {
  console.log("Lendo CSV local...\n");

  const content = fs.readFileSync(CSV_PATH, "utf8");

  const lines = content
    .split(/\r?\n/)
    .filter((line) => line.trim() !== "");

  const headers = parseCSVLine(lines[0]);

  const rows = [];

  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i]);

    const row = {};

    headers.forEach((header, index) => {
      row[header] = values[index] ?? "";
    });

    row.__csv_offset = i - 1;

    rows.push(row);
  }

  return rows;
}

function csvEscape(value) {
  const text =
    value === null || value === undefined
      ? ""
      : String(value);

  if (
    text.includes(",") ||
    text.includes('"') ||
    text.includes("\n")
  ) {
    return `"${text.replace(/"/g, '""')}"`;
  }

  return text;
}

async function main() {
  console.log("==============================================");
  console.log("DIAGNOSTICO ITBI 2010");
  console.log("==============================================\n");

  console.log(`CSV: ${CSV_PATH}`);
  console.log(`Ano: ${YEAR}`);
  console.log(`Import ID: ${IMPORT_ID}\n`);

  const csvRows = readCSV();

  console.log(
    `CSV: ${csvRows.length.toLocaleString("pt-BR")} registros`
  );

  const dbRows = await fetchAllProperties();

  console.log(
    `\nBanco: ${dbRows.length.toLocaleString("pt-BR")} registros`
  );

  console.log(
    `Diferenca: ${(csvRows.length - dbRows.length).toLocaleString("pt-BR")}`
  );

  console.log("\nCriando indice dos registros do banco...");

  const dbKeys = new Set();

  for (const row of dbRows) {
    dbKeys.add(makeKey(row));
  }

  console.log(
    `Indice criado: ${dbKeys.size.toLocaleString("pt-BR")} chaves unicas`
  );

  console.log("\nComparando CSV com banco...\n");

  const missing = [];
  const found = [];

  for (const row of csvRows) {
    const key = makeKey(row);

    if (dbKeys.has(key)) {
      found.push(row);
    } else {
      missing.push(row);
    }
  }

  console.log("==============================================");
  console.log("RESULTADO");
  console.log("==============================================");

  console.log(
    `CSV total:       ${csvRows.length.toLocaleString("pt-BR")}`
  );

  console.log(
    `Encontrados:     ${found.length.toLocaleString("pt-BR")}`
  );

  console.log(
    `Ausentes:        ${missing.length.toLocaleString("pt-BR")}`
  );

  console.log(
    `Diferenca banco: ${(csvRows.length - dbRows.length).toLocaleString("pt-BR")}`
  );

  console.log("==============================================\n");

  if (missing.length === 0) {
    console.log("Nenhum registro do CSV esta faltando no banco.");
    return;
  }

  const buckets = {};

  for (const row of missing) {
    const bucket =
      Math.floor(row.__csv_offset / 1000) * 1000;

    buckets[bucket] = (buckets[bucket] || 0) + 1;
  }

  console.log("AUSENTES POR BLOCO DE OFFSET:\n");

  for (const [offset, count] of Object.entries(buckets)) {
    console.log(
      `${String(offset).padStart(6, "0")} -> ` +
      `${String(Number(offset) + 999).padStart(6, "0")}: ` +
      `${count} ausentes`
    );
  }

  console.log("\nPRIMEIROS 20 REGISTROS AUSENTES:\n");

  for (const row of missing.slice(0, 20)) {
    console.log(
      `Offset ${row.__csv_offset}: ` +
      `${row.address} | ` +
      `${row.transaction_date} | ` +
      `${row.transaction_value} | ` +
      `Matricula ${row.matricula}`
    );
  }

  const outputPath = path.resolve(
    __dirname,
    "../data/itbi/converted/itbi_2010_missing.csv"
  );

  const headers = [
    "csv_offset",
    "address",
    "neighborhood",
    "area",
    "venal_value",
    "property_type",
    "year",
    "price_per_sqm",
    "transaction_value",
    "transaction_value_full",
    "proportion_pct",
    "matricula",
    "transaction_date",
    "venal_reference",
  ];

  const output = [
    headers.join(","),
    ...missing.map((row) =>
      headers
        .map((header) => {
          if (header === "csv_offset") {
            return row.__csv_offset;
          }

          return csvEscape(row[header]);
        })
        .join(",")
    ),
  ].join("\n");

  fs.writeFileSync(outputPath, output, "utf8");

  console.log("\nRelatorio salvo em:");
  console.log(outputPath);

  console.log("\nNenhum dado foi alterado no banco.");
  console.log("Diagnostico concluido.");
}

main().catch((error) => {
  console.error("\nERRO:");
  console.error(error);
  process.exit(1);
});