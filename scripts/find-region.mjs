// Probe Supabase poolers across regions to find where this project lives.
import { Client } from "pg";

const REGIONS = [
  "ap-northeast-2", // Seoul
  "ap-northeast-1", // Tokyo
  "us-east-1",
  "us-east-2",
  "us-west-1",
  "us-west-2",
  "eu-west-1",
  "eu-west-2",
  "eu-central-1",
  "eu-central-2",
  "ap-southeast-1",
  "ap-southeast-2",
  "ap-south-1",
  "sa-east-1",
  "ca-central-1",
];

const password = process.env.PGPASSWORD;
const projectRef = "vdprfnhwdbrwdbjmbjfy";

for (const region of REGIONS) {
  const host = `aws-0-${region}.pooler.supabase.com`;
  const c = new Client({
    host,
    port: 5432,
    database: "postgres",
    user: `postgres.${projectRef}`,
    password,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 8000,
  });
  try {
    await c.connect();
    console.log(`✓ Connected in region: ${region}`);
    const { rows } = await c.query("select current_database() db, version() v");
    console.log("  db:", rows[0].db);
    await c.end();
    console.log(`CONNECTION_STRING: postgresql://postgres.${projectRef}:***@${host}:5432/postgres`);
    process.exit(0);
  } catch (err) {
    await c.end().catch(() => {});
    const msg = err.message.split("\n")[0].slice(0, 80);
    console.log(`✗ ${region}: ${msg}`);
  }
}
console.error("No region matched");
process.exit(1);
