import { readFileSync } from "node:fs";
import { Client } from "pg";

const c = new Client({
  host: process.env.PGHOST,
  port: Number(process.env.PGPORT ?? 5432),
  database: process.env.PGDATABASE ?? "postgres",
  user: process.env.PGUSER,
  password: process.env.PGPASSWORD,
  ssl: { rejectUnauthorized: false },
});
const sql = readFileSync(new URL("../supabase/grants.sql", import.meta.url), "utf8");
await c.connect();
await c.query(sql);
console.log("✓ grants applied");
await c.end();
