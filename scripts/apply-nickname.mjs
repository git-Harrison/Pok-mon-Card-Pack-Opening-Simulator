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
  readFileSync(new URL("../supabase/nickname.sql", import.meta.url), "utf8")
);
console.log("✓ nickname migration applied");

const r = await c.query(
  `select user_id, display_name, points from users order by user_id`
);
console.log("--- users ---");
r.rows.forEach((row) =>
  console.log(`  ${row.user_id} → ${row.display_name} (${row.points}p)`)
);

await c.end();
