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

const funcs = await c.query(`
  select n.nspname as schema, p.proname as name,
         pg_get_function_identity_arguments(p.oid) as args,
         pg_get_function_result(p.oid) as result
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where p.proname in ('auth_login','auth_signup','record_pack_pull','gift_card')
  order by p.proname`);
console.log("--- Functions ---");
funcs.rows.forEach((r) =>
  console.log(`${r.schema}.${r.name}(${r.args}) → ${r.result}`)
);

const grants = await c.query(`
  select routine_name, grantee, privilege_type
  from information_schema.routine_privileges
  where routine_schema = 'public'
    and routine_name in ('auth_login','auth_signup','record_pack_pull','gift_card')
  order by routine_name, grantee`);
console.log("\n--- Grants ---");
grants.rows.forEach((r) =>
  console.log(`${r.routine_name} → ${r.grantee} (${r.privilege_type})`)
);

const users = await c.query(`select user_id, age from users order by user_id`);
console.log("\n--- Seeded users ---");
users.rows.forEach((r) => console.log(`${r.user_id} (age ${r.age})`));

await c.end();
