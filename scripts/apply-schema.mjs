// Apply supabase/schema.sql to Supabase Postgres via direct connection.
// Reads password from PGPASSWORD or DATABASE_URL.
import { readFileSync } from "node:fs";
import { Client } from "pg";

const password = process.env.PGPASSWORD;
const url = process.env.DATABASE_URL;
const projectRef = process.env.SUPABASE_PROJECT_REF ?? "vdprfnhwdbrwdbjmbjfy";

if (!password && !url) {
  console.error("Missing PGPASSWORD or DATABASE_URL env var");
  process.exit(1);
}

const config = url
  ? { connectionString: url, ssl: { rejectUnauthorized: false } }
  : {
      host: process.env.PGHOST ?? `db.${projectRef}.supabase.co`,
      port: Number(process.env.PGPORT ?? 5432),
      database: process.env.PGDATABASE ?? "postgres",
      user: process.env.PGUSER ?? "postgres",
      password,
      ssl: { rejectUnauthorized: false },
      connectionTimeoutMillis: 15_000,
    };

const sql = readFileSync(new URL("../supabase/schema.sql", import.meta.url), "utf8");

const client = new Client(config);

try {
  await client.connect();
  console.log("✓ Connected to", config.host ?? "via DATABASE_URL");
  await client.query(sql);
  console.log("✓ Schema applied");
  const { rows } = await client.query(
    "select user_id from users where user_id in ('hun','min') order by user_id"
  );
  console.log("✓ Seeded users:", rows.map((r) => r.user_id).join(", "));
  const counts = await client.query(`
    select table_name from information_schema.tables
    where table_schema = 'public' and table_name in
      ('users','pack_opens','pulls','card_ownership','gifts')
    order by table_name`);
  console.log("✓ Tables:", counts.rows.map((r) => r.table_name).join(", "));
  const funcs = await client.query(`
    select routine_name from information_schema.routines
    where routine_schema = 'public' and routine_name in
      ('auth_signup','auth_login','record_pack_pull','gift_card')
    order by routine_name`);
  console.log("✓ RPCs:", funcs.rows.map((r) => r.routine_name).join(", "));
} catch (err) {
  console.error("✗ Failed:", err.message);
  if (err.code) console.error("  code:", err.code);
  process.exitCode = 1;
} finally {
  await client.end();
}
