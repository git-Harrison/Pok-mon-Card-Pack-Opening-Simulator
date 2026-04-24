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

const r = await c.query(`
  select u.user_id, u.display_name, co.card_id, co.count
  from card_ownership co
  join users u on u.id = co.user_id
  order by u.user_id, co.card_id
`);
console.log("--- all card_ownership rows ---");
r.rows.forEach((row) =>
  console.log(`  ${row.user_id.padEnd(10)} ${row.card_id.padEnd(14)} x${row.count}`)
);

// Distinct card ids
const ids = [...new Set(r.rows.map((x) => x.card_id))].sort();
console.log(`\n--- ${ids.length} distinct card_ids held ---`);
console.log(ids.join("\n"));

await c.end();
