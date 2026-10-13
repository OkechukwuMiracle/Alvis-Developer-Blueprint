// Actual additive-upgrade test against synthetic pre-extension organization records.
// Fixed local endpoint and a separate disposable database; never loads hosted credentials.
import pg from "pg";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { execFileSync } from "node:child_process";
const root = path.resolve(import.meta.dirname, "..");
const connection = { host: "127.0.0.1", port: 54322, user: "postgres", password: process.env.ALVIS_LOCAL_TEST_DB_PASSWORD || "postgres", connectionTimeoutMillis: 10000 };
const database = "alvis_community_migration_verified";
const operator = new pg.Client({ ...connection, database: "postgres" });
await operator.connect();
if (!(await operator.query("select 1 from pg_database where datname=$1", [database])).rowCount) await operator.query(`create database ${database}`);
await operator.end();
const client = new pg.Client({ ...connection, database });
await client.connect();
try {
  await client.query("begin");
  await client.query((await readFile(path.join(root, "tests/integration/bootstrap.sql"), "utf8")).replace(/^create role .*;\r?\n/gm, ""));
  const files = (await readdir(path.join(root, "supabase/migrations"))).filter(f => f.endsWith(".sql")).sort();
  for (const file of files.filter(f => f < "202610120013")) {
    if (file.includes("004_private_storage")) await client.query(await readFile(path.join(root, "tests/integration/storage-harness.sql"), "utf8"));
    await client.query(await readFile(path.join(root, "supabase/migrations", file), "utf8"));
  }
  const fixture = await readFile(path.join(root, "tests/integration/authorization.sql"), "utf8");
  await client.query(fixture.slice(0, fixture.indexOf("set local role authenticated;")).replace(/^\\.*$/gm, "").replace(/^begin;/m, ""));
  await client.query("insert into reviews(organization_id,revision_id,reviewer_id,decision,comment,content_hash) select organization_id,id,'00000000-0000-4000-8000-000000000002','approve','Historical synthetic review',content_hash from knowledge_revisions where id='60000000-0000-4000-8000-000000000001'");
  const tables = ["organizations", "memberships", "knowledge_units", "knowledge_revisions", "sources", "revision_sources", "reviews", "audit_events"];
  const before = new Map();
  for (const table of tables) before.set(table, (await client.query(`select coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text),'[]') records from public.${table} t`)).rows[0].records);
  execFileSync(process.execPath, [path.join(root, "scripts/community-upgrade.mjs")], { stdio: "pipe" });
  const bundle = await readFile(path.join(root, "var/tmp/community-upgrade.sql"), "utf8");
  // Preserve the enclosing disposable test transaction instead of committing it.
  await client.query(bundle.replace(/^begin;$/m, "").replace(/^commit;$/m, ""));
  for (const table of tables) {
    const extra = table === "organizations" ? "array['scope_kind','personal_owner']" : ["knowledge_revisions", "sources"].includes(table) ? "array['audience']" : "array[]::text[]";
    const after = (await client.query(`select coalesce(jsonb_agg(to_jsonb(t)-${extra} order by (to_jsonb(t)-${extra})::text),'[]') records from public.${table} t`)).rows[0].records;
    if (JSON.stringify(after) !== JSON.stringify(before.get(table))) throw new Error("Existing records changed during upgrade: " + table);
  }
  if ((await client.query("select exists(select 1 from organizations where scope_kind<>'organization' or personal_owner is not null) or exists(select 1 from knowledge_revisions where audience<>'organization_private') or exists(select 1 from sources where audience<>'organization_private') as exposed")).rows[0].exposed) throw new Error("Existing audience backfill is not private.");
  if ((await client.query("select jsonb_array_length(alvis_public_library()) as count")).rows[0].count !== 0) throw new Error("Existing organization knowledge entered public discovery.");
  if (!(await client.query("select alvis_function_permissions() as ok")).rows[0].ok) throw new Error("Upgrade changed function access controls.");
  console.log("PASS: additive migration preserves existing organization IDs, roles, content, history and private audiences");
} finally { await client.query("rollback"); await client.end(); }
