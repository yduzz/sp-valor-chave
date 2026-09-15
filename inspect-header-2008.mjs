import XLSX from "xlsx";

const file = "./data/itbi/itbi_2008.xlsx";

const workbook = XLSX.readFile(file, {
  cellDates: false,
  dense: true
});

const sheetName = workbook.SheetNames[0];
const sheet = workbook.Sheets[sheetName];

const rows = XLSX.utils.sheet_to_json(sheet, {
  header: 1,
  defval: null,
  raw: false
});

console.log("PLANILHA PRINCIPAL:", sheetName);
console.log("TOTAL DE LINHAS:", rows.length);

for (let i = 0; i < Math.min(20, rows.length); i++) {
  console.log(`\nLINHA ${i}:`);
  console.dir(rows[i], { depth: null });
}
