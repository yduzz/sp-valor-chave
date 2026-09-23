import "dotenv/config";
import express from "express";
import cors from "cors";
import { pool } from "./db.js";

const app = express();
const PORT = 3001;

app.use(cors());
app.use(express.json());

/**
 * Health check
 */
app.get("/api/health", async (_req, res) => {
  try {
    await pool.query("SELECT 1");

    res.json({
      ok: true,
      database: "connected",
    });
  } catch (error) {
    console.error("Erro no health check:", error);

    res.status(500).json({
      ok: false,
      database: "error",
    });
  }
});

/**
 * Busca propriedades por endereço.
 */
app.get("/api/properties", async (req, res) => {
  try {
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

    res.json(result.rows);
  } catch (error) {
    console.error("Erro em /api/properties:", error);

    res.status(500).json({
      error: "Erro ao consultar propriedades.",
    });
  }
});

/**
 * Busca de endereços para o autocomplete.
 *
 * Toda a lógica de:
 * - agrupamento
 * - normalização
 * - contagem
 * - formatação
 * - tratamento de número
 *
 * continua no frontend.
 */
app.get("/api/address-search", async (req, res) => {
  try {
    const query = String(req.query.query ?? "").trim();

    if (query.length < 2) {
      return res.json([]);
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

    res.json(result.rows);
  } catch (error) {
    console.error("Erro em /api/address-search:", error);

    res.status(500).json({
      error: "Erro ao consultar endereços.",
    });
  }
});

/**
 * Busca propriedades para o motor de busca do frontend.
 *
 * Aceita:
 *
 * keyword=FERREIRA
 *
 * ou:
 *
 * keywords=PAULA,FERREIRA
 *
 * O segundo formato permite que o PostgreSQL
 * encontre registros contendo TODOS os termos,
 * evitando buscar apenas os primeiros 1000 registros
 * de uma palavra genérica.
 *
 * A lógica de número, distância e seleção continua
 * no frontend.
 */
app.get("/api/property-search", async (req, res) => {
  try {
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
      return res.json([]);
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

    res.json(result.rows);
  } catch (error) {
    console.error("Erro em /api/property-search:", error);

    res.status(500).json({
      error: "Erro ao consultar propriedades.",
    });
  }
});

/**
 * Salvar avaliação
 */
app.post("/api/evaluations", async (req, res) => {
  try {
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

    res.json(result.rows[0]);
  } catch (error) {
    console.error("Erro ao salvar avaliação:", error);

    res.status(500).json({
      error: "Erro ao salvar avaliação.",
    });
  }
});

/**
 * Histórico de avaliações
 */
app.get("/api/evaluations", async (_req, res) => {
  try {
    const result = await pool.query(
      `
      SELECT *
      FROM public.evaluations
      ORDER BY created_at DESC
      LIMIT 20
      `
    );

    res.json(result.rows);
  } catch (error) {
    console.error("Erro ao buscar histórico:", error);

    res.status(500).json({
      error: "Erro ao buscar histórico.",
    });
  }
});

app.get("/api/db-columns", async (_req, res) => {
  try {
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

    res.json(result.rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Erro ao consultar estrutura." });
  }
});

app.listen(PORT, () => {
  console.log(
    `API VALOR SP rodando em http://localhost:${PORT}`
  );
});