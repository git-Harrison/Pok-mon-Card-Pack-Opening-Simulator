import { readFileSync } from "node:fs";
import { Client } from "pg";
const c = new Client({
  host: process.env.PGHOST,
  port: 5432,
  database: "postgres",
  user: process.env.PGUSER,
  password: process.env.PGPASSWORD,
  ssl: { rejectUnauthorized: false },
});
await c.connect();
const sql = readFileSync(new URL("../supabase/gift-v2.sql", import.meta.url), "utf8");
await c.query(sql);
console.log("✓ gift-v2 applied");
await c.end();
