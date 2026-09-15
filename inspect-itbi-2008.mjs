import XLSX from "xlsx";

const file = "./data/itbi/itbi_2008.xlsx";

const workbook = XLSX.readFile(file, {
  cellDates: true,
  dense: true
});

console.log("PLANILHAS:");
console.log(workbook.SheetNames);

for (const name of workbook.SheetNames) {
  const sheet = workbook.Sheets[name];
  const rows = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    defval: null,
    raw: false
  });

  console.log("\n==============================");
  console.log("PLANILHA:", name);
  console.log("LINHAS:", rows.length);
  console.log("==============================");

  console.log("\nPRIMEIRAS 15 LINHAS:");
  console.dir(rows.slice(0, 15), { depth: null });
}
