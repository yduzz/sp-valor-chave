require("dotenv").config();

const fs = require("fs");
const path = require("path");

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;

const IMPORT_ID = "5a2addf4-37f6-4ac9-b8de-6ea481226a0a";
const YEAR = 2010;
const BUCKET = "itbi-staging";

const SOURCE_CSV = path.resolve(
  __dirname,
  "../data/itbi/converted/itbi_2010_missing.csv"
);

const REPAIR_CSV = path.resolve(
  __dirname,
  "../data/itbi/converted/itbi_2010_repair.csv"
);

const STORAGE_PATH = `repair/itbi_2010_repair_${Date.now()}.csv`;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("ERRO: configuracao do Supabase nao encontrada.");
  process.exit(1);
}

if (!fs.existsSync(SOURCE_CSV)) {
  console.error("ERRO: arquivo de registros faltantes nao encontrado:");
  console.error(SOURCE_CSV);
  process.exit(1);
}

function parseCSVLine(line) {
  const result = [];
  let current = "";
  let quoted = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (quoted) {
      if (char === '"') {
        if (line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          quoted = false;
        }
      } else {
        current += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === ",") {
      result.push(current);
      current = "";
    } else {
      current += char;
    }
  }

  result.push(current);
  return result;
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

function prepareRepairCSV() {
  console.log("Preparando CSV compativel com a Edge Function...");

  const content = fs.readFileSync(SOURCE_CSV, "utf8");

  const lines = content
    .split(/\r?\n/)
    .filter((line) => line.trim() !== "");

  const sourceHeaders = parseCSVLine(lines[0]);

  const offsetIndex = sourceHeaders.indexOf("csv_offset");

  if (offsetIndex !== 0) {
    throw new Error(
      "Formato inesperado: csv_offset nao esta na primeira coluna."
    );
  }

  const headers = sourceHeaders.slice(1);

  const output = [headers.join(",")];

  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i]);

    // Remove somente csv_offset.
    const row = values.slice(1);

    output.push(
      row.map(csvEscape).join(",")
    );
  }

  fs.writeFileSync(
    REPAIR_CSV,
    output.join("\n"),
    "utf8"
  );

  console.log(
    `CSV preparado: ${output.length - 1} registros`
  );

  console.log(`Arquivo: ${REPAIR_CSV}`);
}

async function request(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      ...(options.headers || {}),
    },
  });

  const text = await response.text();

  let data;

  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }

  if (!response.ok) {
    throw new Error(
      `HTTP ${response.status}: ${
        typeof data === "string"
          ? data
          : JSON.stringify(data)
      }`
    );
  }

  return data;
}

async function uploadCSV() {
  console.log("\nEnviando CSV corrigido para o Storage...");

  const file = fs.readFileSync(REPAIR_CSV);

  const url =
    `${SUPABASE_URL}/storage/v1/object/` +
    `${BUCKET}/${STORAGE_PATH}`;

  await request(url, {
    method: "POST",
    headers: {
      "Content-Type": "text/csv",
      "x-upsert": "true",
    },
    body: file,
  });

  console.log("Upload concluido.");
  console.log(`Storage: ${STORAGE_PATH}`);
}

async function processBatch(offset, maxRows) {
  const url =
    `${SUPABASE_URL}/functions/v1/ingest-itbi-csv`;

  const payload = {
    file_path: STORAGE_PATH,
    path: STORAGE_PATH,
    year: YEAR,
    source: "prefeitura-sp",

    offset,
    max_rows: maxRows,

    import_id: IMPORT_ID,

    finalize: false,
  };

  return await request(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
}

async function finalizeImport() {
  console.log("\nFinalizando importacao...");

  const url =
    `${SUPABASE_URL}/functions/v1/ingest-itbi-csv`;

  const payload = {
    file_path: STORAGE_PATH,
    path: STORAGE_PATH,
    year: YEAR,
    source: "prefeitura-sp",
    import_id: IMPORT_ID,
    finalize: true,
  };

  return await request(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
}

async function main() {
  console.log("==============================================");
  console.log("REPARO ITBI 2010");
  console.log("==============================================");
  console.log(`Import ID: ${IMPORT_ID}`);
  console.log("");

  console.log(
    "Os 120.970 registros existentes serao preservados."
  );

  console.log(
    "Somente os 7.000 registros faltantes serao processados."
  );

  console.log("");

  prepareRepairCSV();

  await uploadCSV();

  const TOTAL = 7000;
  const BATCH_SIZE = 500;

  let offset = 0;

  while (offset < TOTAL) {
    const remaining = TOTAL - offset;
    const maxRows = Math.min(
      BATCH_SIZE,
      remaining
    );

    console.log(
      `Processando offset ${offset} -> ${
        offset + maxRows - 1
      }...`
    );

    const result = await processBatch(
      offset,
      maxRows
    );

    console.log(
      `Processados: ${result.processed ?? 0}`
    );

    console.log(
      `Inseridos: ${result.imported ?? 0}`
    );

    console.log(
      `Rejeitados: ${result.rejected ?? 0}`
    );

    console.log(
      `Proximo offset: ${result.next_offset ?? "?"}`
    );

    if (
      result.success !== true ||
      result.processed !== maxRows
    ) {
      throw new Error(
        `Lote inesperado no offset ${offset}.`
      );
    }

    if (result.rejected > 0) {
      throw new Error(
        `O lote ${offset} teve ${result.rejected} rejeicoes.`
      );
    }

    offset = result.next_offset;
  }

  const finalResult =
    await finalizeImport();

  console.log("\n==============================================");
  console.log("RESULTADO FINAL");
  console.log("==============================================");

  console.log(
    JSON.stringify(
      finalResult,
      null,
      2
    )
  );

  console.log("\nReparo concluido.");
}

main().catch((error) => {
  console.error("\nERRO:");
  console.error(error.message);
  process.exit(1);
});