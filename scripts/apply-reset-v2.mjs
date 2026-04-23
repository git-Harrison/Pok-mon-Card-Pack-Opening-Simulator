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
const sql = readFileSync(new URL("../supabase/reset-v2.sql", import.meta.url), "utf8");
await c.query(sql);
console.log("✓ reset-v2 applied");

const r = await c.query(`select user_id, points from users order by user_id`);
console.log("--- users after reset ---");
r.rows.forEach((row) => console.log(`  ${row.user_id}: ${row.points}p`));

const counts = await c.query(`
  select
    (select count(*) from pulls) as pulls,
    (select count(*) from pack_opens) as packs,
    (select count(*) from card_ownership) as owned,
    (select count(*) from gifts) as gifts,
    (select count(*) from psa_gradings) as psa,
    (select count(*) from merchant_state) as merchants
`);
console.log("--- counts ---");
console.log(counts.rows[0]);

await c.end();
