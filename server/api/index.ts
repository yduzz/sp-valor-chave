import type { VercelRequest, VercelResponse } from "@vercel/node";
import pg from "pg";

const { Pool } = pg;

const pool = new Pool({
  host: process.env.DATABASE_HOST,
  port: Number(process.env.DATABASE_PORT),
  user: process.env.DATABASE_USER,
  password: process.env.DATABASE_PASSWORD,
  database: process.env.DATABASE_NAME,
  ssl: {
    rejectUnauthorized: false,
  },
});

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
) {
  try {
    const path = req.url?.split("?")[0] ?? "/api";

    /*
     * Health check
     */
    if (path === "/api/health") {
      await pool.query("SELECT 1");

      return res.status(200).json({
        ok: true,
        database: "connected",
      });
    }

    /*
     * Busca propriedades por endereço.
     */
    if (path === "/api/properties" && req.method === "GET") {
      const address = String(req.query.address ?? "").trim();

      if (!address) {
        return res.status(400).json({
          error: "Informe o endereço.",
        });
      }

      const result = await pool.query(
        `
        SELECT *
        FROM public.properties
        WHERE address ILIKE $1
        ORDER BY transaction_date DESC NULLS LAST
        LIMIT 1000
        `,
        [`%${address}%`]
      );

      return res.status(200).json(result.rows);
    }

    /*
     * Busca de endereços para autocomplete.
     */
    if (path === "/api/address-search" && req.method === "GET") {
      const query = String(req.query.query ?? "").trim();

      if (query.length < 2) {
        return res.status(200).json([]);
      }

      const result = await pool.query(
        `
        SELECT
          address,
          neighborhood
        FROM public.properties
        WHERE address ILIKE $1
        LIMIT 500
        `,
        [`%${query}%`]
      );

      return res.status(200).json(result.rows);
    }

    /*
     * Busca de propriedades para o motor de busca.
     */
    if (path === "/api/property-search" && req.method === "GET") {
      const keywordsParam = String(
        req.query.keywords ?? ""
      ).trim();

      const keywordParam = String(
        req.query.keyword ?? ""
      ).trim();

      const keywords = keywordsParam
        ? keywordsParam
            .split(",")
            .map((value) => value.trim())
            .filter(Boolean)
        : keywordParam
          ? [keywordParam]
          : [];

      if (keywords.length === 0) {
        return res.status(200).json([]);
      }

      const conditions: string[] = [];
      const values: string[] = [];

      keywords.forEach((keyword, index) => {
        conditions.push(
          `address ILIKE $${index + 1}`
        );

        values.push(`%${keyword}%`);
      });

      const result = await pool.query(
        `
        SELECT *
        FROM public.properties
        WHERE ${conditions.join(" AND ")}
        ORDER BY transaction_date DESC NULLS LAST
        LIMIT 5000
        `,
        values
      );

      return res.status(200).json(result.rows);
    }

    /*
     * Salvar avaliação.
     */
    if (path === "/api/evaluations" && req.method === "POST") {
      const evaluation = req.body;

      const result = await pool.query(
        `
        INSERT INTO public.evaluations (
          address,
          selected_property_ids,
          sale_min,
          sale_avg,
          sale_max,
          per_sqm_min,
          per_sqm_avg,
          per_sqm_max,
          rent_min,
          rent_avg,
          rent_max
        )
        VALUES (
          $1, $2, $3, $4, $5,
          $6, $7, $8,
          $9, $10, $11
        )
        RETURNING *
        `,
        [
          evaluation.address,
          evaluation.selected_property_ids,
          evaluation.sale.min,
          evaluation.sale.avg,
          evaluation.sale.max,
          evaluation.perSqm.min,
          evaluation.perSqm.avg,
          evaluation.perSqm.max,
          evaluation.rent.min,
          evaluation.rent.avg,
          evaluation.rent.max,
        ]
      );

      return res.status(200).json(result.rows[0]);
    }

    /*
     * Histórico de avaliações.
     */
    if (path === "/api/evaluations" && req.method === "GET") {
      const result = await pool.query(
        `
        SELECT *
        FROM public.evaluations
        ORDER BY created_at DESC
        LIMIT 20
        `
      );

      return res.status(200).json(result.rows);
    }

    /*
     * Índices de mercado.
     *
     * Consulta:
     * - source
     * - cidade
     * - tipo de imóvel
     * - competência inicial
     * - competência final
     */
    if (
      path === "/api/market-indexes" &&
      req.method === "GET"
    ) {
      const source = String(
        req.query.source ?? "fipezap"
      ).trim();

      const city = String(
        req.query.city ?? ""
      ).trim();

      const propertyType = String(
        req.query.propertyType ?? ""
      ).trim();

      const from = String(
        req.query.from ?? ""
      ).trim();

      const to = String(
        req.query.to ?? ""
      ).trim();

      const requestedLimit = Number(
        req.query.limit ?? 500
      );

      const limit =
        Number.isFinite(requestedLimit) &&
        requestedLimit > 0
          ? Math.min(Math.floor(requestedLimit), 5000)
          : 500;

      const conditions: string[] = [];
      const values: string[] = [];

      conditions.push(
        `source = $${values.length + 1}`
      );

      values.push(source);

      if (city) {
        conditions.push(
          `city ILIKE $${values.length + 1}`
        );

        values.push(`%${city}%`);
      }

      if (propertyType) {
        conditions.push(
          `property_type = $${values.length + 1}`
        );

        values.push(propertyType);
      }

      if (from) {
        conditions.push(
          `competence >= $${values.length + 1}`
        );

        values.push(from);
      }

      if (to) {
        conditions.push(
          `competence <= $${values.length + 1}`
        );

        values.push(to);
      }

      const result = await pool.query(
        `
        SELECT
          competence,
          source,
          city,
          neighborhood,
          property_type,
          avg_price_per_sqm,
          monthly_variation,
          yearly_variation
        FROM public.market_indexes
        WHERE ${conditions.join(" AND ")}
        ORDER BY competence ASC
        LIMIT $${values.length + 1}
        `,
        [...values, limit]
      );

      return res.status(200).json(result.rows);
    }

    /*
     * Última atualização dos índices de mercado.
     */
    if (
      path === "/api/market-index-last-update" &&
      req.method === "GET"
    ) {
      const source = String(
        req.query.source ?? "fipezap"
      ).trim();

      const result = await pool.query(
        `
        SELECT executed_at
        FROM public.market_update_logs
        WHERE source = $1
          AND status = 'success'
        ORDER BY executed_at DESC
        LIMIT 1
        `,
        [source]
      );

      return res.status(200).json({
        executed_at:
          result.rows[0]?.executed_at ?? null,
      });
    }

    /*
     * Estrutura da tabela properties.
     */
    if (
      path === "/api/db-columns" &&
      req.method === "GET"
    ) {
      const result = await pool.query(`
        SELECT
          column_name,
          data_type,
          is_nullable,
          column_default
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'properties'
        ORDER BY ordinal_position
      `);

      return res.status(200).json(result.rows);
    }

    /*
     * Endpoint não encontrado.
     */
    return res.status(404).json({
      error: "Endpoint não encontrado.",
      path,
    });
  } catch (error) {
    console.error("Erro na API:", error);

    return res.status(500).json({
      error: "Erro interno na API.",
    });
  }
}