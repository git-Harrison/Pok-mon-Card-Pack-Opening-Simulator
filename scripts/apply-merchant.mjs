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
const sql = readFileSync(new URL("../supabase/merchant.sql", import.meta.url), "utf8");
await c.query(sql);
console.log("✓ merchant migration applied");

const tables = await c.query(`
  select column_name, data_type from information_schema.columns
  where table_schema = 'public' and table_name = 'gifts' order by ordinal_position`);
console.log("--- gifts columns ---");
tables.rows.forEach((r) => console.log(`  ${r.column_name}: ${r.data_type}`));

const users = await c.query(`select user_id, points from users order by user_id`);
console.log("--- users + points ---");
users.rows.forEach((r) => console.log(`  ${r.user_id}: ${r.points}p`));

await c.end();
