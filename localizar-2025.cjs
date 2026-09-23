const https = require("https");

const URL =
  "https://smartsampa.prefeitura.sp.gov.br/web/fazenda/w/acesso_a_informacao/31501";

https.get(URL, (res) => {
  let html = "";

  res.on("data", (chunk) => {
    html += chunk;
  });

  res.on("end", () => {
    console.log("Status:", res.statusCode);
    console.log("\nLinks relacionados a 2025:\n");

    const regex = /href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;

    let match;
    let found = 0;

    while ((match = regex.exec(html)) !== null) {
      const href = match[1];
      const text = match[2]
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim();

      if (
        href.toLowerCase().includes("2025") ||
        text.toLowerCase().includes("2025") ||
        href.toLowerCase().includes("itbi")
      ) {
        console.log("TEXTO:", text);
        console.log("URL:", href);
        console.log("----------------------------------------");
        found++;
      }
    }

    console.log("\nTotal encontrado:", found);
  });
}).on("error", (error) => {
  console.error("Erro:", error);
});