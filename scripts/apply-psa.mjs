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
const sql = readFileSync(new URL("../supabase/psa.sql", import.meta.url), "utf8");
await c.query(sql);
console.log("✓ PSA migration applied");

const t = await c.query(`
  select column_name, data_type from information_schema.columns
  where table_schema='public' and table_name='psa_gradings'
  order by ordinal_position`);
console.log("--- psa_gradings columns ---");
t.rows.forEach((r) => console.log(`  ${r.column_name}: ${r.data_type}`));
await c.end();
