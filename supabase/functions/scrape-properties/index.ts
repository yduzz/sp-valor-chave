import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "https://esm.sh/@supabase/supabase-js@2/cors";

const PREFEITURA_URL = "https://prefeitura.sp.gov.br/fazenda/w/acesso_a_informacao/31501";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Attempt to fetch and parse data from Prefeitura SP
    // Note: The actual scraping depends on the page structure which may change
    const response = await fetch(PREFEITURA_URL, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; SPValuation/1.0)",
      },
    });

    if (!response.ok) {
      return new Response(
        JSON.stringify({
          error: "Failed to fetch from Prefeitura SP",
          status: response.status,
          message: `A página da Prefeitura retornou status ${response.status}. O scraper precisará ser ajustado conforme a estrutura real da página.`,
        }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const html = await response.text();

    // Parse the HTML to extract property data
    // This is a simplified parser - needs to be adapted to the actual page structure
    const properties = parsePropertiesFromHTML(html);

    if (properties.length === 0) {
      return new Response(
        JSON.stringify({
          message: "Nenhum imóvel novo encontrado. A estrutura da página pode ter mudado.",
          html_preview: html.substring(0, 500),
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Upsert properties (avoid duplicates based on address + year + area)
    let inserted = 0;
    for (const prop of properties) {
      const { data: existing } = await supabase
        .from("properties")
        .select("id")
        .eq("address", prop.address)
        .eq("year", prop.year)
        .eq("venal_value", prop.venal_value)
        .maybeSingle();

      if (!existing) {
        const { error } = await supabase.from("properties").insert(prop);
        if (!error) inserted++;
      }
    }

    return new Response(
      JSON.stringify({
        message: `Scraping concluído. ${inserted} novos imóveis inseridos de ${properties.length} encontrados.`,
        total_found: properties.length,
        new_inserted: inserted,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

interface ScrapedProperty {
  address: string;
  neighborhood: string | null;
  area: number | null;
  venal_value: number;
  property_type: string | null;
  year: number;
  fiscal_zone: string | null;
  price_per_sqm: number | null;
}

function parsePropertiesFromHTML(html: string): ScrapedProperty[] {
  const properties: ScrapedProperty[] = [];

  // Look for table rows with property data
  // This regex-based parser handles common table structures
  // It needs to be adapted once the actual page structure is known
  const tableRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  const cellRegex = /<td[^>]*>([\s\S]*?)<\/td>/gi;

  let tableMatch;
  while ((tableMatch = tableRegex.exec(html)) !== null) {
    const row = tableMatch[1];
    const cells: string[] = [];
    let cellMatch;

    while ((cellMatch = cellRegex.exec(row)) !== null) {
      cells.push(cellMatch[1].replace(/<[^>]+>/g, "").trim());
    }

    // Expected columns: address, neighborhood, area, venal_value, type, year, fiscal_zone
    if (cells.length >= 5) {
      const year = parseInt(cells[5] || cells[4]);
      if (year >= 2023 && year <= 2026) {
        const area = parseFloat(cells[2]) || null;
        const venalValue = parseFloat(cells[3]?.replace(/[^\d.,]/g, "").replace(",", ".")) || 0;

        if (venalValue > 0) {
          properties.push({
            address: cells[0],
            neighborhood: cells[1] || null,
            area,
            venal_value: venalValue,
            property_type: cells[4] || null,
            year,
            fiscal_zone: cells[6] || null,
            price_per_sqm: area && area > 0 ? Math.round(venalValue / area) : null,
          });
        }
      }
    }
  }

  return properties;
}
