import { Client } from "pg";

const c = new Client({
  host: process.env.PGHOST,
  port: Number(process.env.PGPORT ?? 5432),
  database: process.env.PGDATABASE ?? "postgres",
  user: process.env.PGUSER,
  password: process.env.PGPASSWORD,
  ssl: { rejectUnauthorized: false },
});
await c.connect();
await c.query(`notify pgrst, 'reload schema'`);
console.log("✓ notified pgrst reload schema");
await c.end();
