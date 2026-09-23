const XLSX = require("xlsx");

const file = "data/itbi/itbi_2007.xlsx";
const wb = XLSX.readFile(file, { cellDates: true });

console.log("SHEETS:");
console.log(wb.SheetNames);

for (const name of wb.SheetNames.slice(0, 3)) {
  const ws = wb.Sheets[name];
  const rows = XLSX.utils.sheet_to_json(ws, {
    header: 1,
    defval: null,
    raw: true
  });

  console.log("\n==============================");
  console.log("SHEET:", name);
  console.log("ROWS:", rows.length);
  console.log("FIRST 5 ROWS:");

  console.dir(rows.slice(0, 5), { depth: null });
}
