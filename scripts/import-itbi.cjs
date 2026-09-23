require("dotenv").config();

const fs = require("fs");
const path = require("path");
const https = require("https");
const http = require("http");
const XLSX = require("xlsx");
const { Client } = require("pg");
const crypto = require("crypto");

const YEAR = Number(process.argv[2]);
const DISCOVER_ONLY = process.argv.includes("--discover-only");

if (!YEAR || YEAR < 2006 || YEAR > new Date().getFullYear()) {
  console.error("");
  console.error("Uso: node scripts/import-itbi.cjs ANO");
  console.error("Exemplo: node scripts/import-itbi.cjs 2011");
  console.error("");
  process.exit(1);
}

const OFFICIAL_PAGE =
  "https://www2.prefeitura.sp.gov.br/web/fazenda/w/acesso_a_informacao/31501";

const PROJECT_ROOT = path.resolve(__dirname, "..");

const DATA_DIR = path.join(
  PROJECT_ROOT,
  "data",
  "itbi"
);

const CONVERTED_DIR = path.join(
  DATA_DIR,
  "converted"
);

const SOURCE_PREFIX =
  "itbi_" + YEAR + "_source";

const SOURCE_DIR = path.join(
  DATA_DIR,
  "sources"
);

const CSV_PATH = path.join(
  CONVERTED_DIR,
  "itbi_" + YEAR + ".csv"
);

const SOURCE = "prefeitura-sp";

const DATABASE_CONFIG = {
  host: process.env.DATABASE_HOST,
  port: Number(process.env.DATABASE_PORT || 5432),
  user: process.env.DATABASE_USER,
  password: process.env.DATABASE_PASSWORD,
  database: process.env.DATABASE_NAME,
  ssl: {
    rejectUnauthorized: false,
  },
};

if (
  !DATABASE_CONFIG.host ||
  !DATABASE_CONFIG.user ||
  !DATABASE_CONFIG.password ||
  !DATABASE_CONFIG.database
) {
  console.error("");
  console.error(
    "ERRO: variáveis da Layerbase não encontradas."
  );
  console.error("");
  console.error(
    "Verifique se o ambiente possui:"
  );
  console.error("DATABASE_HOST");
  console.error("DATABASE_PORT");
  console.error("DATABASE_USER");
  console.error("DATABASE_PASSWORD");
  console.error("DATABASE_NAME");
  console.error("");
  process.exit(1);
}

function ensureDirectories() {
  fs.mkdirSync(DATA_DIR, {
    recursive: true,
  });

  fs.mkdirSync(CONVERTED_DIR, {
    recursive: true,
  });

  fs.mkdirSync(SOURCE_DIR, {
    recursive: true,
  });
}

function fetchText(url, redirects) {
  redirects = redirects || 0;

  return new Promise(function (resolve, reject) {
    if (redirects > 10) {
      reject(
        new Error("Muitos redirecionamentos.")
      );
      return;
    }

    const client = url.startsWith("https://")
      ? https
      : http;

    client
      .get(
        url,
        {
          headers: {
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131 Safari/537.36",
          },
        },
        function (res) {
          const status = res.statusCode || 0;

          if (
            status >= 300 &&
            status < 400 &&
            res.headers.location
          ) {
            const nextUrl = new URL(
              res.headers.location,
              url
            ).toString();

            res.resume();

            fetchText(
              nextUrl,
              redirects + 1
            )
              .then(resolve)
              .catch(reject);

            return;
          }

          if (status < 200 || status >= 300) {
            res.resume();

            reject(
              new Error(
                "HTTP " +
                  status +
                  " ao acessar " +
                  url
              )
            );

            return;
          }

          let data = "";

          res.setEncoding("utf8");

          res.on("data", function (chunk) {
            data += chunk;
          });

          res.on("end", function () {
            resolve(data);
          });
        }
      )
      .on("error", reject);
  });
}

function downloadFile(
  url,
  destination,
  redirects
) {
  redirects = redirects || 0;

  return new Promise(function (resolve, reject) {
    if (redirects > 10) {
      reject(
        new Error(
          "Muitos redirecionamentos no download."
        )
      );
      return;
    }

    const client = url.startsWith("https://")
      ? https
      : http;

    const request = client.get(
      url,
      {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131 Safari/537.36",
        },
      },
      function (res) {
        const status = res.statusCode || 0;

        if (
          status >= 300 &&
          status < 400 &&
          res.headers.location
        ) {
          const nextUrl = new URL(
            res.headers.location,
            url
          ).toString();

          res.resume();

          downloadFile(
            nextUrl,
            destination,
            redirects + 1
          )
            .then(resolve)
            .catch(reject);

          return;
        }

        if (status < 200 || status >= 300) {
          res.resume();

          reject(
            new Error(
              "HTTP " +
                status +
                " ao baixar " +
                url
            )
          );

          return;
        }

        const file =
          fs.createWriteStream(destination);

        res.pipe(file);

        file.on("finish", function () {
          file.close(function () {
            resolve();
          });
        });

        file.on("error", function (error) {
          file.close();
          reject(error);
        });
      }
    );

    request.on("error", reject);
  });
}

function normalizeText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

/**
 * Verifica se o ano aparece como ano isolado.
 *
 * Isso evita considerar:
 *
 * 28012026
 *
 * como se fosse uma referência explícita ao ano 2026.
 */
function hasStandaloneYear(value, year) {
  const text = String(value || "");

  const regex = new RegExp(
    "(?:^|[^0-9])" +
      String(year) +
      "(?:[^0-9]|$)"
  );

  return regex.test(text);
}

/**
 * Extrai uma data DDMMAAAA encontrada em uma URL/texto.
 *
 * Exemplos:
 *
 * 28012026
 * 27082026
 * (28012026)
 * %2828012026%29
 */
function extractPublicationDate(value) {
  let text = String(value || "");

  try {
    text = decodeURIComponent(text);
  } catch (error) {
    // Mantém o texto original.
  }

  const match = text.match(
    /(?:^|[^0-9])(\d{2})(\d{2})(\d{4})(?:[^0-9]|$)/
  );

  if (!match) {
    return null;
  }

  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);

  if (
    day < 1 ||
    day > 31 ||
    month < 1 ||
    month > 12 ||
    year < 2000 ||
    year > 2100
  ) {
    return null;
  }

  const date = new Date(
    year,
    month - 1,
    day
  );

  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }

  return {
    day,
    month,
    year,
    date,
  };
}

/**
 * Retorna a extensão/formato do arquivo.
 *
 * A Prefeitura possui links atuais como:
 *
 * .../guias-de-itbi-pagas-27082026-xls-xlsx
 *
 * Portanto não podemos depender apenas de .xlsx no final da URL.
 */
function getFileFormat(item) {
  const url = String(item.url || "").toLowerCase();
  const text = String(item.text || "").toLowerCase();
  const combined = url + " " + text;

  const cleanUrl = url.split("?")[0];

  if (
    cleanUrl.endsWith(".xlsx") ||
    combined.includes("xls-xlsx") ||
    combined.includes("xlsx")
  ) {
    return "xlsx";
  }

  if (
    cleanUrl.endsWith(".xls") ||
    combined.includes(".xls")
  ) {
    return "xls";
  }

  if (
    cleanUrl.endsWith(".ods") ||
    combined.includes(".ods") ||
    combined.includes(" ods")
  ) {
    return "ods";
  }

  return null;
}

/**
 * Prioridade dos formatos:
 *
 * XLSX > XLS > ODS
 */
function prioritizeFormat(items) {
  const xlsx = items.find(function (item) {
    return getFileFormat(item) === "xlsx";
  });

  if (xlsx) {
    return xlsx;
  }

  const xls = items.find(function (item) {
    return getFileFormat(item) === "xls";
  });

  if (xls) {
    return xls;
  }

  const ods = items.find(function (item) {
    return getFileFormat(item) === "ods";
  });

  if (ods) {
    return ods;
  }

  return items[0] || null;
}

/**
 * Localiza o arquivo oficial correspondente ao ano solicitado.
 *
 * Estratégia:
 *
 * 1. Procura ano explicitamente indicado.
 *
 * 2. Não considera datas como 28012026 como referência
 *    explícita ao ano 2026.
 *
 * 3. Se não houver ano explícito, procura publicação
 *    no ano seguinte.
 *
 *    Exemplo:
 *
 *    YEAR = 2025
 *    publicação = 28/01/2026
 *
 *    Essa publicação corresponde aos dados consolidados
 *    de 2025.
 *
 * 4. Para YEAR = 2026, se não houver ano explícito,
 *    procura a publicação mais recente de 2026.
 *
 * 5. Para YEAR = 2025, procura a publicação mais antiga
 *    do ano seguinte.
 *
 * 6. XLSX > XLS > ODS.
 */
function discoverOfficialFile(html) {
  const links = [];

  /**
   * Captura:
   *
   * <a href="...">texto</a>
   */
  const regex =
    /<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;

  let match;

  while ((match = regex.exec(html)) !== null) {
    const href = match[1];

    const text = match[2]
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    const combined =
      normalizeText(text) +
      " " +
      normalizeText(href);

    const lowerHref =
      href.toLowerCase();

    const isSpreadsheet =
      lowerHref.includes(".xlsx") ||
      lowerHref.includes(".xls") ||
      lowerHref.includes(".ods") ||
      lowerHref.includes("xls-xlsx") ||
      normalizeText(text).includes("xlsx") ||
      normalizeText(text).includes("xls") ||
      normalizeText(text).includes("ods");

    if (!isSpreadsheet) {
      continue;
    }

    links.push({
      href,
      text,
      combined,
    });
  }

  if (!links.length) {
    return null;
  }

  const absoluteLinks =
    links.map(function (item) {
      const absoluteUrl =
        new URL(
          item.href,
          OFFICIAL_PAGE
        ).toString();

      const publication =
        extractPublicationDate(
          absoluteUrl + " " + item.text
        );

      return {
        url: absoluteUrl,
        text: item.text,
        combined: item.combined,
        publicationDate: publication
          ? publication.date
          : null,
        publicationYear: publication
          ? publication.year
          : null,
      };
    });

  /**
   * ============================================================
   * 1. PROCURA ANO EXPLÍCITO
   * ============================================================
   *
   * Exemplo:
   *
   * GUIAS DE ITBI PAGAS 2024.xlsx
   *
   * deve ser considerado explicitamente 2024.
   *
   * Já:
   *
   * GUIAS DE ITBI PAGAS (28012026) XLS.xlsx
   *
   * NÃO deve ser considerado explicitamente 2026.
   */
  const explicitYearLinks =
    absoluteLinks.filter(function (item) {
      return hasStandaloneYear(
        item.text + " " + item.url,
        YEAR
      );
    });

  if (explicitYearLinks.length) {
    const selected =
      prioritizeFormat(
        explicitYearLinks
      );

    if (selected) {
      console.log(
        "Arquivo selecionado por ano explícito."
      );

      return selected;
    }
  }

  /**
   * ============================================================
   * 2. ARQUIVOS COM DATA DE PUBLICAÇÃO
   * ============================================================
   */
  const datedLinks =
    absoluteLinks.filter(function (item) {
      return (
        item.publicationYear &&
        item.publicationDate
      );
    });

  /**
   * ============================================================
   * 3. PUBLICAÇÃO NO PRÓPRIO ANO
   * ============================================================
   *
   * Isso é especialmente importante para 2026.
   *
   * Se houver:
   *
   * 28/01/2026
   * 27/08/2026
   *
   * para YEAR = 2026, usamos a mais recente:
   *
   * 27/08/2026
   */
  const sameYearLinks =
    datedLinks
      .filter(function (item) {
        return (
          item.publicationYear === YEAR
        );
      })
      .sort(function (a, b) {
        return (
          b.publicationDate -
          a.publicationDate
        );
      });

  if (sameYearLinks.length) {
    const selected =
      prioritizeFormat(
        sameYearLinks
      );

    if (selected) {
      console.log(
        "Arquivo selecionado pela publicação mais recente do próprio ano."
      );

      return selected;
    }
  }

  /**
   * ============================================================
   * 4. PUBLICAÇÃO NO ANO SEGUINTE
   * ============================================================
   *
   * Exemplo:
   *
   * YEAR = 2025
   *
   * Publicação:
   * 28/01/2026
   *
   * Portanto usamos a publicação mais antiga
   * encontrada no ano seguinte.
   */
  const nextYearLinks =
    datedLinks
      .filter(function (item) {
        return (
          item.publicationYear ===
          YEAR + 1
        );
      })
      .sort(function (a, b) {
        return (
          a.publicationDate -
          b.publicationDate
        );
      });

  if (nextYearLinks.length) {
    const selected =
      prioritizeFormat(
        nextYearLinks
      );

    if (selected) {
      console.log(
        "Arquivo selecionado pela publicação do ano seguinte."
      );

      return selected;
    }
  }

  return null;
}

function getExtension(url) {
  const clean =
    url.split("?")[0].toLowerCase();

  if (
    clean.endsWith(".xlsx") ||
    clean.includes("xls-xlsx")
  ) {
    return ".xlsx";
  }

  if (clean.endsWith(".xls")) {
    return ".xls";
  }

  if (clean.endsWith(".ods")) {
    return ".ods";
  }

  return ".xlsx";
}

function numberValue(value) {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return null;
  }

  if (typeof value === "number") {
    return Number.isFinite(value)
      ? value
      : null;
  }

  let text =
    String(value).trim();

  if (!text) {
    return null;
  }

  text = text
    .replace(/R\$/gi, "")
    .replace(/\s/g, "");

  if (
    text.includes(",") &&
    text.includes(".")
  ) {
    text = text
      .replace(/\./g, "")
      .replace(",", ".");
  } else if (
    text.includes(",")
  ) {
    text = text.replace(",", ".");
  }

  text =
    text.replace(
      /[^\d.-]/g,
      ""
    );

  if (!text) {
    return null;
  }

  const result =
    Number(text);

  return Number.isFinite(result)
    ? result
    : null;
}

function dateValue(value) {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return null;
  }

  if (
    value instanceof Date &&
    !isNaN(value.getTime())
  ) {
    return value
      .toISOString()
      .slice(0, 10);
  }

  if (typeof value === "number") {
    const parsed =
      XLSX.SSF.parse_date_code(
        value
      );

    if (
      parsed &&
      parsed.y &&
      parsed.m &&
      parsed.d
    ) {
      return (
        String(parsed.y).padStart(4, "0") +
        "-" +
        String(parsed.m).padStart(2, "0") +
        "-" +
        String(parsed.d).padStart(2, "0")
      );
    }
  }

  const text =
    String(value).trim();

  const brDate =
    text.match(
      /^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/
    );

  if (brDate) {
    return (
      brDate[3] +
      "-" +
      brDate[2].padStart(2, "0") +
      "-" +
      brDate[1].padStart(2, "0")
    );
  }

  const isoDate =
    text.match(
      /^(\d{4})-(\d{1,2})-(\d{1,2})/
    );

  if (isoDate) {
    return (
      isoDate[1] +
      "-" +
      isoDate[2].padStart(2, "0") +
      "-" +
      isoDate[3].padStart(2, "0")
    );
  }

  return null;
}

function normalizeHeader(value) {
  return normalizeText(value)
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function findColumn(headers, aliases) {
  for (const alias of aliases) {
    const normalizedAlias =
      normalizeHeader(alias);

    const index =
      headers.findIndex(function (header) {
        return (
          normalizeHeader(header) ===
          normalizedAlias
        );
      });

    if (index >= 0) {
      return index;
    }
  }

  return -1;
}

function buildColumnMap(headers) {
  return {
    address: findColumn(headers, [
      "Endereço",
      "Endereco",
      "Logradouro",
      "Nome do Logradouro",
    ]),

    neighborhood: findColumn(headers, [
      "Bairro",
    ]),

    area: findColumn(headers, [
      "Área Construída (m2)",
      "Area Construida (m2)",
      "Área Construída",
      "Area Construida",
    ]),

    venal_value: findColumn(headers, [
      "Valor Venal de Referência (proporcional)",
      "Valor Venal de Referencia (proporcional)",
      "Valor Venal de Referência",
      "Valor Venal de Referencia",
    ]),

    property_type: findColumn(headers, [
      "Descrição do uso (IPTU)",
      "Descricao do uso (IPTU)",
      "Descrição do uso",
      "Descricao do uso",
      "Uso",
    ]),

    transaction_value: findColumn(headers, [
      "Valor de Transação (declarado pelo contribuinte)",
      "Valor de Transacao (declarado pelo contribuinte)",
      "Valor de Transação",
      "Valor de Transacao",
    ]),

    proportion_pct: findColumn(headers, [
      "Proporção Transmitida (%)",
      "Proporcao Transmitida (%)",
      "Proporção Transmitida",
      "Proporcao Transmitida",
    ]),

    matricula: findColumn(headers, [
      "Matrícula do Imóvel",
      "Matricula do Imovel",
      "Matrícula",
      "Matricula",
    ]),

    transaction_date: findColumn(headers, [
      "Data de Transação",
      "Data de Transacao",
      "Data da Transação",
      "Data da Transacao",
    ]),

    venal_reference: findColumn(headers, [
      "Valor Venal de Referência",
      "Valor Venal de Referencia",
    ]),
  };
}

function fullValue(
  transaction,
  proportion
) {
  if (
    !transaction ||
    transaction <= 0
  ) {
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

  return (
    Math.round(
      (transaction /
        (proportion / 100)) *
        100
    ) / 100
  );
}

function escapeCsv(value) {
  if (
    value === null ||
    value === undefined
  ) {
    return "";
  }

  const text =
    String(value);

  if (
    text.includes(",") ||
    text.includes('"') ||
    text.includes("\n") ||
    text.includes("\r")
  ) {
    return (
      '"' +
      text.replace(
        /"/g,
        '""'
      ) +
      '"'
    );
  }

  return text;
}

function csvLine(values) {
  return values
    .map(escapeCsv)
    .join(",");
}

function extractWorkbook(workbook) {
  const sheetNames =
    workbook.SheetNames;

  console.log("");
  console.log(
    "Planilhas encontradas:"
  );
  console.log(
    sheetNames.join(", ")
  );
  console.log("");

  /**
   * Segurança adicional:
   *
   * tenta identificar o ano nas próprias planilhas.
   */
  const detectedSheetYears = [
    ...new Set(
      sheetNames
        .map(function (sheetName) {
          const match =
            String(sheetName).match(
              /\b(20\d{2})\b/
            );

          return match
            ? Number(match[1])
            : null;
        })
        .filter(Boolean)
    ),
  ];

  console.log(
    "Anos identificados nas planilhas: " +
      (
        detectedSheetYears.length
          ? detectedSheetYears.join(", ")
          : "nenhum"
      )
  );

  if (
    detectedSheetYears.length > 0 &&
    !detectedSheetYears.includes(YEAR)
  ) {
    throw new Error(
      [
        "",
        "ERRO DE SEGURANÇA: o arquivo oficial encontrado não corresponde ao ano solicitado.",
        "",
        "Ano solicitado: " + YEAR,
        "Anos encontrados nas planilhas: " +
          detectedSheetYears.join(", "),
        "",
        "A importação foi CANCELADA antes de inserir dados no PostgreSQL.",
        "",
      ].join("\n")
    );
  }

  const selectedSheets = [];

  const yearText =
    String(YEAR);

  for (const sheetName of sheetNames) {
    const normalized =
      normalizeText(sheetName);

    if (
      normalized.includes(yearText) &&
      !normalized.includes("legenda") &&
      !normalized.includes("explic")
    ) {
      selectedSheets.push(
        sheetName
      );
    }
  }

  if (!selectedSheets.length) {
    for (const sheetName of sheetNames) {
      const normalized =
        normalizeText(sheetName);

      if (
        !normalized.includes("legenda") &&
        !normalized.includes("explic") &&
        !normalized.includes("tabela")
      ) {
        selectedSheets.push(
          sheetName
        );
      }
    }
  }

  if (!selectedSheets.length) {
    throw new Error(
      "Não foi encontrada nenhuma planilha de dados para o ano " +
        YEAR
    );
  }

  console.log(
    "Planilhas selecionadas: " +
      selectedSheets.join(", ")
  );

  const output = [];

  output.push(
    csvLine([
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
    ])
  );

  let totalRecords = 0;
  let addressMissingCount = 0;

  for (const sheetName of selectedSheets) {
    console.log("");
    console.log(
      "Processando: " +
        sheetName
    );

    const sheet =
      workbook.Sheets[
        sheetName
      ];

    const rows =
      XLSX.utils.sheet_to_json(
        sheet,
        {
          header: 1,
          defval: null,
          raw: true,
        }
      );

    if (!rows.length) {
      console.log(
        "Planilha vazia."
      );
      continue;
    }

    let headerIndex = -1;

    for (
      let i = 0;
      i < Math.min(rows.length, 20);
      i++
    ) {
      const row =
        rows[i] || [];

      const normalizedRow =
        row.map(
          normalizeHeader
        );

      const hasAddress =
        normalizedRow.some(
          function (item) {
            return (
              item.includes(
                "endereco"
              ) ||
              item.includes(
                "logradouro"
              )
            );
          }
        );

      const hasValue =
        normalizedRow.some(
          function (item) {
            return (
              item.includes(
                "transacao"
              ) ||
              item.includes(
                "valor"
              )
            );
          }
        );

      if (
        hasAddress &&
        hasValue
      ) {
        headerIndex = i;
        break;
      }
    }

    if (headerIndex < 0) {
      console.log(
        "Cabeçalho não identificado em " +
          sheetName +
          "."
      );
      continue;
    }

    const headers =
      rows[headerIndex];

    const map =
      buildColumnMap(
        headers
      );

    console.log(
      "Cabeçalho encontrado na linha " +
        (headerIndex + 1)
    );

    console.log(
      "Mapeamento:"
    );

    console.log(
      JSON.stringify(
        map,
        null,
        2
      )
    );

    if (
      map.address < 0 ||
      map.neighborhood < 0 ||
      map.transaction_value < 0
    ) {
      console.log(
        "ATENÇÃO: estrutura da planilha " +
          sheetName +
          " não corresponde ao formato esperado."
      );
      continue;
    }

    for (
      let i = headerIndex + 1;
      i < rows.length;
      i++
    ) {
      const row =
        rows[i];

      if (
        !row ||
        !row.length
      ) {
        continue;
      }

      const originalAddress =
        map.address >= 0
          ? String(
              row[
                map.address
              ] || ""
            ).trim()
          : "";

      const neighborhood =
        map.neighborhood >= 0
          ? String(
              row[
                map.neighborhood
              ] || ""
            ).trim()
          : "";

      let address =
        originalAddress;

      if (!address) {
        if (!neighborhood) {
          continue;
        }

        address =
          "[ENDEREÇO NÃO INFORMADO]";

        addressMissingCount++;

        const matriculaPreview =
          map.matricula >= 0
            ? String(
                row[
                  map.matricula
                ] || ""
              ).trim()
            : "";

        console.log(
          "AVISO: endereço não informado | " +
            "planilha: " +
            sheetName +
            " | matrícula: " +
            (
              matriculaPreview ||
              "não informada"
            ) +
            " | bairro: " +
            neighborhood
        );
      }

      const area =
        map.area >= 0
          ? numberValue(
              row[map.area]
            )
          : null;

      const venalValue =
        map.venal_value >= 0
          ? numberValue(
              row[
                map.venal_value
              ]
            )
          : null;

      const propertyType =
        map.property_type >= 0
          ? String(
              row[
                map.property_type
              ] || ""
            ).trim()
          : "";

      const transactionValue =
        map.transaction_value >= 0
          ? numberValue(
              row[
                map.transaction_value
              ]
            )
          : null;

      const proportion =
        map.proportion_pct >= 0
          ? numberValue(
              row[
                map.proportion_pct
              ]
            )
          : null;

      const transactionFull =
        fullValue(
          transactionValue,
          proportion
        );

      let pricePerSqm = null;

      if (
        area &&
        area > 0 &&
        transactionFull &&
        transactionFull > 0
      ) {
        pricePerSqm =
          Math.round(
            (transactionFull /
              area) *
              100
          ) / 100;
      }

      const matricula =
        map.matricula >= 0
          ? String(
              row[
                map.matricula
              ] || ""
            ).trim()
          : "";

      const transactionDate =
        map.transaction_date >= 0
          ? dateValue(
              row[
                map.transaction_date
              ]
            )
          : null;

      const venalReference =
        map.venal_reference >= 0
          ? numberValue(
              row[
                map.venal_reference
              ]
            )
          : null;

      output.push(
        csvLine([
          address,
          neighborhood,
          area,
          venalValue,
          propertyType,
          YEAR,
          pricePerSqm,
          transactionValue,
          transactionFull,
          proportion,
          matricula,
          transactionDate,
          venalReference,
        ])
      );

      totalRecords++;
    }

    console.log(
      "Registros acumulados: " +
        totalRecords
    );
  }

  fs.writeFileSync(
    CSV_PATH,
    output.join("\n"),
    "utf8"
  );

  console.log("");
  console.log(
    "CSV criado: " +
      CSV_PATH
  );

  console.log(
    "Total de registros: " +
      totalRecords
  );

  if (
    addressMissingCount > 0
  ) {
    console.log(
      "Registros sem endereço original: " +
        addressMissingCount
    );

    console.log(
      "Esses registros receberam: [ENDEREÇO NÃO INFORMADO]"
    );
  }

  return totalRecords;
}

function parseCsvLine(line) {
  const result = [];
  let current = "";
  let insideQuotes = false;

  for (
    let i = 0;
    i < line.length;
    i++
  ) {
    const char =
      line[i];

    if (char === '"') {
      if (
        insideQuotes &&
        line[i + 1] === '"'
      ) {
        current += '"';
        i++;
      } else {
        insideQuotes =
          !insideQuotes;
      }

      continue;
    }

    if (
      char === "," &&
      !insideQuotes
    ) {
      result.push(
        current
      );

      current = "";

      continue;
    }

    current += char;
  }

  result.push(
    current
  );

  return result;
}

function toNumber(value) {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return null;
  }

  const result =
    Number(value);

  return Number.isFinite(result)
    ? result
    : null;
}

async function importCsvToLayerbase(
  totalRecords
) {
  console.log("");
  console.log(
    "Importando CSV diretamente na Layerbase..."
  );

  const client =
    new Client(
      DATABASE_CONFIG
    );

  await client.connect();

  console.log(
    "Conectado à Layerbase."
  );

  const importId =
    crypto.randomUUID();

  try {
    const existing =
      await client.query(
        `
        SELECT COUNT(*)::int AS total
        FROM public.properties
        WHERE year = $1
        `,
        [YEAR]
      );

    const existingCount =
      Number(
        existing.rows[0].total
      );

    if (
      existingCount > 0
    ) {
      throw new Error(
        "IMPORTAÇÃO CANCELADA: o ano " +
          YEAR +
          " já possui " +
          existingCount +
          " registros na Layerbase."
      );
    }

    const csvText =
      fs.readFileSync(
        CSV_PATH,
        "utf8"
      );

    const lines =
      csvText
        .split(/\r?\n/)
        .filter(Boolean);

    const header =
      lines.shift();

    if (!header) {
      throw new Error(
        "CSV sem cabeçalho."
      );
    }

    const rows =
      lines.map(
        parseCsvLine
      );

    console.log(
      "Registros encontrados no CSV: " +
        rows.length
    );

    if (
      rows.length !==
      totalRecords
    ) {
      throw new Error(
        "Quantidade diferente do esperado. " +
          "CSV: " +
          rows.length +
          " | Esperado: " +
          totalRecords
      );
    }

    console.log(
      "Import ID: " +
        importId
    );

    console.log(
      "Iniciando transação..."
    );

    await client.query(
      "BEGIN"
    );

    const BATCH_SIZE = 500;

    let imported = 0;

    for (
      let start = 0;
      start < rows.length;
      start += BATCH_SIZE
    ) {
      const batch =
        rows.slice(
          start,
          start + BATCH_SIZE
        );

      const placeholders = [];
      const values = [];

      batch.forEach(
        function (row, index) {
          if (
            row.length !== 13
          ) {
            throw new Error(
              "Linha CSV inválida na posição " +
                (start + index + 2) +
                ". Esperados 13 campos, encontrados " +
                row.length +
                "."
            );
          }

          const base =
            index * 14;

          const address =
            String(
              row[0] || ""
            ).trim();

          if (!address) {
            throw new Error(
              "Endereço vazio na linha CSV " +
                (start + index + 2) +
                ". Importação cancelada para preservar os dados."
            );
          }

          const venalValue =
            toNumber(
              row[3]
            );

          if (
            venalValue === null
          ) {
            throw new Error(
              "Valor venal vazio na linha CSV " +
                (start + index + 2) +
                ". Importação cancelada para preservar os dados."
            );
          }

          placeholders.push(
            `(
              $${base + 1},
              $${base + 2},
              $${base + 3},
              $${base + 4},
              $${base + 5},
              $${base + 6},
              $${base + 7},
              $${base + 8},
              $${base + 9},
              $${base + 10},
              $${base + 11},
              $${base + 12},
              $${base + 13},
              $${base + 14}
            )`
          );

          values.push(
            address,
            row[1] || null,
            toNumber(row[2]),
            venalValue,
            row[4] || null,
            Number(row[5]),
            toNumber(row[6]),
            toNumber(row[7]),
            toNumber(row[8]),
            toNumber(row[9]),
            row[10] || null,
            row[11] || null,
            toNumber(row[12]),
            importId
          );
        }
      );

      await client.query(
        `
        INSERT INTO public.properties (
          address,
          neighborhood,
          area,
          venal_value,
          property_type,
          year,
          price_per_sqm,
          transaction_value,
          transaction_value_full,
          proportion_pct,
          matricula,
          transaction_date,
          venal_reference,
          import_id
        )
        VALUES ${placeholders.join(",")}
        `,
        values
      );

      imported +=
        batch.length;

      console.log(
        "Importados: " +
          imported +
          "/" +
          totalRecords
      );
    }

    await client.query(
      "COMMIT"
    );

    console.log("");
    console.log(
      "Transação concluída."
    );

    console.log(
      "Importação Layerbase concluída."
    );

    console.log(
      "Import ID: " +
        importId
    );

    console.log(
      "Importados: " +
        imported
    );

    return {
      imported,
      rejected:
        totalRecords -
        imported,
      processed:
        totalRecords,
      importId,
    };
  } catch (error) {
    console.error("");
    console.error(
      "ERRO durante a importação."
    );

    try {
      await client.query(
        "ROLLBACK"
      );

      console.error(
        "ROLLBACK executado. Nenhum registro parcial foi mantido."
      );
    } catch (rollbackError) {
      console.error(
        "Não foi possível executar o ROLLBACK:",
        rollbackError
      );
    }

    throw error;
  } finally {
    await client.end();
  }
}

async function validateLayerbase(
  expectedRecords,
  importResult
) {
  console.log("");
  console.log(
    "Validando Layerbase..."
  );

  const client =
    new Client(
      DATABASE_CONFIG
    );

  await client.connect();

  try {
    const result =
      await client.query(
        `
        SELECT
          COUNT(*)::int AS total,
          COUNT(*) FILTER (
            WHERE import_id = $2
          )::int AS imported_by_id
        FROM public.properties
        WHERE year = $1
        `,
        [
          YEAR,
          importResult.importId,
        ]
      );

    const total =
      Number(
        result.rows[0].total
      );

    const importedById =
      Number(
        result.rows[0]
          .imported_by_id
      );

    console.log(
      "Registros encontrados na Layerbase: " +
        total
    );

    console.log(
      "Registros deste import_id: " +
        importedById
    );

    if (
      total !==
      expectedRecords
    ) {
      throw new Error(
        "Quantidade na Layerbase diferente do CSV. " +
          "CSV: " +
          expectedRecords +
          " | Layerbase: " +
          total
      );
    }

    if (
      importedById !==
      expectedRecords
    ) {
      throw new Error(
        "Quantidade associada ao import_id diferente do esperado. " +
          "Esperado: " +
          expectedRecords +
          " | Encontrado: " +
          importedById
      );
    }

    if (
      importResult.processed !==
      expectedRecords
    ) {
      throw new Error(
        "Quantidade processada diferente do CSV."
      );
    }

    console.log("");
    console.log(
      "VALIDAÇÃO OK: " +
        total +
        " registros de " +
        YEAR +
        " encontrados na Layerbase."
    );

    console.log(
      "Import ID validado: " +
        importResult.importId
    );
  } finally {
    await client.end();
  }
}

async function main() {
  console.log("");
  console.log(
    "=============================================="
  );
  console.log(
    " IMPORTADOR AUTOMÁTICO DE ITBI - " +
      YEAR
  );
  console.log(
    "=============================================="
  );

  if (DISCOVER_ONLY) {
    console.log("");
    console.log(
      "MODO DESCOBERTA: nenhuma importação será executada."
    );
  }

  ensureDirectories();

  console.log("");
  console.log(
    "1. Consultando página oficial da Prefeitura..."
  );

  const html =
    await fetchText(
      OFFICIAL_PAGE
    );

  console.log(
    "Página oficial acessada."
  );

  console.log("");
  console.log(
    "2. Procurando arquivo oficial de " +
      YEAR +
      "..."
  );

  const discovered =
    discoverOfficialFile(
      html
    );

  if (!discovered) {
    throw new Error(
      "Não foi encontrado automaticamente o arquivo oficial de " +
        YEAR +
        " na página da Prefeitura."
    );
  }

  console.log("");
  console.log(
    "Arquivo encontrado:"
  );

  console.log(
    discovered.url
  );

  console.log(
    "Formato detectado: " +
      (
        getFileFormat(
          discovered
        ) || "desconhecido"
      )
  );

  if (
    discovered.publicationDate
  ) {
    console.log(
      "Data de publicação detectada: " +
        discovered.publicationDate
          .toISOString()
          .slice(0, 10)
    );
  }

  /**
   * MODO SEGURO DE TESTE:
   *
   * não baixa,
   * não converte,
   * não insere no banco.
   */
  if (DISCOVER_ONLY) {
    console.log("");
    console.log(
      "Modo descoberta concluído."
    );

    console.log(
      "Nenhum arquivo foi baixado."
    );

    console.log(
      "Nenhum dado foi inserido na Layerbase."
    );

    console.log("");

    return;
  }

  const extension =
    getExtension(
      discovered.url
    );

  const sourcePath =
    path.join(
      SOURCE_DIR,
      SOURCE_PREFIX +
        extension
    );

  console.log("");
  console.log(
    "3. Baixando arquivo oficial..."
  );

  await downloadFile(
    discovered.url,
    sourcePath
  );

  console.log(
    "Download concluído:"
  );

  console.log(
    sourcePath
  );

  console.log("");
  console.log(
    "4. Abrindo planilha..."
  );

  const workbook =
    XLSX.readFile(
      sourcePath,
      {
        cellDates: true,
        raw: false,
      }
    );

  console.log(
    "Planilha aberta."
  );

  /**
   * VALIDAÇÃO CRÍTICA:
   *
   * Antes de converter/importar, verificamos se
   * o conteúdo da planilha corresponde ao ano solicitado.
   */
  const detectedWorkbookYears = [
    ...new Set(
      workbook.SheetNames
        .map(function (sheetName) {
          const match =
            String(sheetName).match(
              /\b(20\d{2})\b/
            );

          return match
            ? Number(match[1])
            : null;
        })
        .filter(Boolean)
    ),
  ];

  console.log("");
  console.log(
    "Anos identificados no workbook: " +
      (
        detectedWorkbookYears.length
          ? detectedWorkbookYears.join(", ")
          : "nenhum"
      )
  );

  if (
    detectedWorkbookYears.length > 0 &&
    !detectedWorkbookYears.includes(YEAR)
  ) {
    throw new Error(
      [
        "",
        "ERRO DE SEGURANÇA: o workbook baixado não corresponde ao ano solicitado.",
        "",
        "Ano solicitado: " + YEAR,
        "Anos encontrados: " +
          detectedWorkbookYears.join(", "),
        "",
        "A importação foi CANCELADA.",
        "Nenhum INSERT foi executado.",
        "",
      ].join("\n")
    );
  }

  console.log("");
  console.log(
    "5. Convertendo para CSV..."
  );

  const totalRecords =
    extractWorkbook(
      workbook
    );

  if (!totalRecords) {
    throw new Error(
      "Nenhum registro foi convertido."
    );
  }

  console.log("");
  console.log(
    "6. Importando CSV diretamente na Layerbase..."
  );

  const importResult =
    await importCsvToLayerbase(
      totalRecords
    );

  console.log("");
  console.log(
    "7. Validando resultado..."
  );

  await validateLayerbase(
    totalRecords,
    importResult
  );

  console.log("");
  console.log(
    "=============================================="
  );

  console.log(
    " IMPORTAÇÃO DE " +
      YEAR +
      " CONCLUÍDA"
  );

  console.log(
    "=============================================="
  );

  console.log("");
}

main().catch(function (error) {
  console.error("");
  console.error(
    "=============================================="
  );
  console.error(
    " ERRO NA IMPORTAÇÃO"
  );
  console.error(
    "=============================================="
  );
  console.error("");

  console.error(
    error && error.stack
      ? error.stack
      : error
  );

  console.error("");

  process.exit(1);
});