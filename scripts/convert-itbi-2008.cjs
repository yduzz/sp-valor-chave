const XLSX = require("xlsx");
const fs = require("fs");
const path = require("path");

const INPUT = path.resolve("data/itbi/itbi_2008.xlsx");
const OUTPUT = path.resolve("data/itbi/converted/itbi_2008.csv");

const HEADERS = [
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

const MONTH_SHEETS = [
  "JAN-2008",
  "FEV-2008",
  "MAR-2008",
  "ABR-2008",
  "MAI-2008",
  "JUN-2008",
  "JUL-2008",
  "AGO-2008",
  "SET-2008",
  "OUT-2008",
  "NOV-2008",
  "DEZ-2008",
];

function cleanText(value) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function numberValue(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  let text = String(value).trim();

  if (!text) return null;

  if (text.includes(",") && text.includes(".")) {
    if (text.lastIndexOf(",") > text.lastIndexOf(".")) {
      text = text.replace(/\./g, "").replace(",", ".");
    } else {
      text = text.replace(/,/g, "");
    }
  } else if (text.includes(",")) {
    text = text.replace(",", ".");
  }

  text = text.replace(/[^\d.-]/g, "");

  const n = Number(text);

  return Number.isFinite(n) ? n : null;
}

function excelDateToISO(value) {
  if (value === null || value === undefined || value === "") {
    return "";
  }

  if (typeof value === "number") {
    const parsed = XLSX.SSF.parse_date_code(value);

    if (parsed && parsed.y && parsed.m && parsed.d) {
      return `${String(parsed.y).padStart(4, "0")}-${String(parsed.m).padStart(2, "0")}-${String(parsed.d).padStart(2, "0")}`;
    }
  }

  const text = String(value).trim();

  if (!text) return "";

  let match = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/);

  if (match) {
    const month = Number(match[1]);
    const day = Number(match[2]);
    let year = Number(match[3]);

    if (year < 100) {
      year += year >= 50 ? 1900 : 2000;
    }

    return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }

  match = text.match(/^(\d{4})-(\d{2})-(\d{2})/);

  if (match) {
    return match[0];
  }

  return "";
}

function fullValue(transaction, proportion) {
  if (!transaction || transaction <= 0) {
    return null;
  }

  if (
    proportion === null ||
    proportion === undefined ||
    proportion < 1 ||
    proportion >= 99.5
  ) {
    return transaction;
  }

  return Math.round(
    (transaction / (proportion / 100)) * 100
  ) / 100;
}

function csvEscape(value) {
  if (value === null || value === undefined) {
    return "";
  }

  const text = String(value);

  if (
    text.includes(",") ||
    text.includes('"') ||
    text.includes("\n") ||
    text.includes("\r")
  ) {
    return `"${text.replace(/"/g, '""')}"`;
  }

  return text;
}

if (!fs.existsSync(INPUT)) {
  console.error(`Arquivo não encontrado: ${INPUT}`);
  process.exit(1);
}

console.log("Abrindo:", INPUT);

const workbook = XLSX.readFile(INPUT, {
  cellDates: false,
  raw: true,
});

console.log("\nPlanilhas encontradas:");
console.log(workbook.SheetNames);

const availableMonths = MONTH_SHEETS.filter(
  (sheetName) => workbook.Sheets[sheetName]
);

console.log("\nAbas mensais encontradas:");
console.log(availableMonths);

if (availableMonths.length !== 12) {
  console.error(
    `ATENÇÃO: eram esperadas 12 abas mensais, mas foram encontradas ${availableMonths.length}.`
  );
  process.exit(1);
}

const output = [HEADERS.join(",")];

let total = 0;
let imported = 0;
let rejected = 0;

let transactionFullCalculated = 0;
let transactionFullDirect = 0;

const monthlyStats = [];

for (const sheetName of availableMonths) {
  console.log("\n----------------------------------------");
  console.log(`Processando ${sheetName}...`);
  console.log("----------------------------------------");

  const sheet = workbook.Sheets[sheetName];

  const rows = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    defval: null,
    raw: true,
  });

  if (!rows.length) {
    console.log(`${sheetName}: aba vazia.`);
    monthlyStats.push({
      sheet: sheetName,
      total: 0,
      imported: 0,
      rejected: 0,
    });
    continue;
  }

  const headers = rows[0].map(cleanText);

  const index = {};

  headers.forEach((header, i) => {
    index[header] = i;
  });

  const requiredColumns = [
    "Nome do Logradouro",
    "Número",
    "Complemento",
    "Bairro",
    "Valor de Transação (declarado pelo contribuinte)",
    "Data de Transação",
    "Valor Venal de Referência",
    "Proporção Transmitida (%)",
    "Valor Venal de Referência (proporcional)",
    "Matrícula do Imóvel",
    "Área Construída (m2)",
    "Descrição do uso (IPTU)",
  ];

  for (const required of requiredColumns) {
    if (!(required in index)) {
      console.error(
        `Coluna obrigatória não encontrada na aba ${sheetName}: ${required}`
      );
      process.exit(1);
    }
  }

  const COL = {
    logradouro: index["Nome do Logradouro"],
    numero: index["Número"],
    complemento: index["Complemento"],
    bairro: index["Bairro"],
    transacao: index[
      "Valor de Transação (declarado pelo contribuinte)"
    ],
    data: index["Data de Transação"],
    vvr: index["Valor Venal de Referência"],
    proporcao: index["Proporção Transmitida (%)"],
    vvrProporcional: index[
      "Valor Venal de Referência (proporcional)"
    ],
    matricula: index["Matrícula do Imóvel"],
    areaConstruida: index["Área Construída (m2)"],
    tipo: index["Descrição do uso (IPTU)"],
  };

  let sheetTotal = 0;
  let sheetImported = 0;
  let sheetRejected = 0;

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];

    if (!row || row.length === 0) {
      continue;
    }

    total++;
    sheetTotal++;

    const logradouro = cleanText(row[COL.logradouro]);

    if (!logradouro) {
      rejected++;
      sheetRejected++;
      continue;
    }

    const numero = cleanText(row[COL.numero]);
    const complemento = cleanText(row[COL.complemento]);
    const bairro = cleanText(row[COL.bairro]);

    const transaction = numberValue(row[COL.transacao]);
    const proportion = numberValue(row[COL.proporcao]);

    const venal =
      numberValue(row[COL.vvrProporcional]) ?? 0;

    const venalReference =
      numberValue(row[COL.vvr]);

    const area =
      numberValue(row[COL.areaConstruida]);

    const transactionDate =
      excelDateToISO(row[COL.data]);

    const matricula =
      cleanText(row[COL.matricula]);

    const propertyType =
      cleanText(row[COL.tipo]);

    const transactionFull =
      fullValue(transaction, proportion);

    if (transactionFull !== null) {
      if (
        proportion !== null &&
        proportion >= 1 &&
        proportion < 99.5
      ) {
        transactionFullCalculated++;
      } else {
        transactionFullDirect++;
      }
    }

    const base =
      transactionFull ?? venal;

    let pricePerSqm = null;

    if (
      area &&
      area > 0 &&
      base !== null &&
      base > 0
    ) {
      pricePerSqm =
        Math.round((base / area) * 100) / 100;
    }

    const addressParts = [logradouro];

    if (
      numero &&
      numero !== "0" &&
      numero !== "99999"
    ) {
      addressParts.push(numero);
    }

    if (complemento) {
      addressParts.push(complemento);
    }

    const address =
      addressParts.join(" ").slice(0, 500);

    const values = [
      address,
      bairro,
      area,
      venal,
      propertyType,
      2008,
      pricePerSqm,
      transaction,
      transactionFull,
      proportion,
      matricula,
      transactionDate,
      venalReference,
    ];

    output.push(
      values.map(csvEscape).join(",")
    );

    imported++;
    sheetImported++;
  }

  monthlyStats.push({
    sheet: sheetName,
    total: sheetTotal,
    imported: sheetImported,
    rejected: sheetRejected,
  });

  console.log(
    `${sheetName}: ${sheetImported.toLocaleString("pt-BR")} registros convertidos.`
  );
}

fs.writeFileSync(
  OUTPUT,
  output.join("\n"),
  "utf8"
);

console.log("\n========================================");
console.log("RESUMO POR MÊS");
console.log("========================================");

for (const stat of monthlyStats) {
  console.log(
    `${stat.sheet}: ${stat.imported.toLocaleString("pt-BR")} convertidos | ${stat.rejected.toLocaleString("pt-BR")} rejeitados`
  );
}

console.log("\n========================================");
console.log("CONVERSÃO CONCLUÍDA");
console.log("========================================");

console.log(
  `Linhas analisadas: ${total.toLocaleString("pt-BR")}`
);

console.log(
  `Registros convertidos: ${imported.toLocaleString("pt-BR")}`
);

console.log(
  `Registros rejeitados: ${rejected.toLocaleString("pt-BR")}`
);

console.log(
  `transaction_value_full calculado por proporção: ${transactionFullCalculated.toLocaleString("pt-BR")}`
);

console.log(
  `transaction_value_full usado diretamente: ${transactionFullDirect.toLocaleString("pt-BR")}`
);

console.log(`\nCSV criado em:`);
console.log(OUTPUT);