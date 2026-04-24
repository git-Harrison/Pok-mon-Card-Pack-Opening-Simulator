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
await c.query(
  readFileSync(new URL("../supabase/center-v5.sql", import.meta.url), "utf8")
);
console.log("✓ center-v5 applied");
await c.end();
