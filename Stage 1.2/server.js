// server.js
import express from "express";
import Joi from "joi";
import dotenv from "dotenv";
import { pool } from "./db.js"; // PostgreSQL pool
import logger from "./logger.js";
import cors from "cors";


dotenv.config();

const app = express();
app.use(express.json());

// allow CORS for all origins
app.use(cors());

const PORT = process.env.PORT || 3000;

// --- JOI VALIDATION SCHEMA ---
const productSchema = Joi.object({
  name: Joi.string().min(2).max(100).required(),
  price: Joi.number().positive().required(),
  stock: Joi.number().integer().min(0).required(),
});

// --- GET all products ---
app.get("/products", async (_, res) => {
  try {
    const { rows } = await pool.query("SELECT * FROM products ORDER BY id ASC");
    logger.info("Fetched all products");
    res.json(rows);
  } catch (error) {
    logger.error("Error fetching products:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// --- GET single product by ID ---
app.get("/products/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { rows } = await pool.query("SELECT * FROM products WHERE id = $1", [id]);
    const product = rows[0];

    if (!product) {
      logger.warn(`Product not found: ID ${id}`);
      return res.status(404).json({ error: "Product not found" });
    }

    logger.info(`Fetched product ID: ${id}`);
    res.json(product);
  } catch (error) {
    logger.error("Error fetching product:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// --- CREATE new product ---
app.post("/products", async (req, res) => {
  try {
    const { error, value } = productSchema.validate(req.body);
    if (error) {
      logger.warn("Validation failed for product creation");
      return res.status(400).json({ error: error.details[0].message });
    }

    const { name, price, stock } = value;
    const query = "INSERT INTO products (name, price, stock) VALUES ($1, $2, $3) RETURNING *";
    const { rows } = await pool.query(query, [name, price, stock]);

    logger.info(`Product added: ${name}`);
    res.status(201).json({ message: "Product added", product: rows[0] });
  } catch (error) {
    logger.error("Error adding product:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// --- UPDATE a product ---
app.put("/products/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { error, value } = productSchema.validate(req.body);
    if (error) {
      logger.warn("Validation failed for product update");
      return res.status(400).json({ error: error.details[0].message });
    }

    const { name, price, stock } = value;
    const query = "UPDATE products SET name = $1, price = $2, stock = $3 WHERE id = $4 RETURNING *";
    const { rows } = await pool.query(query, [name, price, stock, id]);

    if (rows.length === 0) {
      logger.warn(`Update failed, product not found: ID ${id}`);
      return res.status(404).json({ error: "Product not found" });
    }

    logger.info(`Product updated: ID ${id}`);
    res.json({ message: "Product updated", product: rows[0] });
  } catch (error) {
    logger.error("Error updating product:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// --- DELETE a product ---
app.delete("/products/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const query = "DELETE FROM products WHERE id = $1 RETURNING *";
    const { rows } = await pool.query(query, [id]);

    if (rows.length === 0) {
      logger.warn(`Delete failed, product not found: ID ${id}`);
      return res.status(404).json({ error: "Product not found" });
    }

    logger.info(`Product deleted: ID ${id}`);
    res.json({ message: "Product deleted", product: rows[0] });
  } catch (error) {
    logger.error("Error deleting product:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// --- Start server ---
app.listen(PORT, () => logger.info(`Server running on port ${PORT}`));
