// db.js
import pkg from "pg";
import dotenv from "dotenv";

dotenv.config();

const { Pool } = pkg;

export const pool = new Pool({
  host: process.env.PG_HOST,
  port: process.env.PG_PORT,
  user: process.env.PG_USER,
  password: process.env.PG_PASSWORD,
  database: process.env.PG_DATABASE
});

// Check connection
try {
  const res = await pool.query("SELECT NOW()");
  console.log("✅ Connected to PostgreSQL at:", res.rows[0].now);
} catch (err) {
  console.error("❌ Failed to connect to PostgreSQL:", err);
  process.exit(1);
}

// Optional: Create table if not exists
await pool.query(`
  CREATE TABLE IF NOT EXISTS products (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    price NUMERIC(10,2) NOT NULL,
    stock INTEGER NOT NULL
  );
`);


// // db.js
// import sqlite3 from "sqlite3";
// import { open } from "sqlite";
// import dotenv from "dotenv";

// dotenv.config();

// const dbPath = process.env.DB_PATH || "./database.sqlite";

// export const db = await open({
//   filename: dbPath,
//   driver: sqlite3.Database
// });

// await db.exec(`
//   CREATE TABLE IF NOT EXISTS products (
//     id INTEGER PRIMARY KEY AUTOINCREMENT,
//     name TEXT,
//     price REAL,
//     stock INTEGER,
//     created_at DATETIME DEFAULT CURRENT_TIMESTAMP
//   )
// `);
