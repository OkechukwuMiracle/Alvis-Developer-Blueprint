// Local disposable SQL verification; never loads hosted environment credentials.
import pg from "pg";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { completeSyntheticLesson } from "../../scripts/testing/synthetic-lesson.mjs";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const database = "alvis_community_verified";
const connection = { host: "127.0.0.1", port: 54322, user: "postgres", password: process.env.ALVIS_LOCAL_TEST_DB_PASSWORD || "postgres", connectionTimeoutMillis: 10000 };
// Port/host/database are deliberately fixed to the local Supabase test instance.
const operator = new pg.Client({ ...connection, database: "postgres" });
await operator.connect();
const exists = await operator.query("select 1 from pg_database where datname=$1", [database]);
if (!exists.rowCount) await operator.query(`create database ${database}`);
await operator.end();
const client = new pg.Client({ ...connection, database });
await client.connect();
try {
  const existing = await client.query("select to_regclass('public.organizations') as schema");
  await client.query("create table if not exists public._alvis_test_migrations(name text primary key)");
  if (!existing.rows[0].schema) {
    let bootstrap = await readFile(path.join(root, "tests/integration/bootstrap.sql"), "utf8");
    bootstrap = bootstrap.replace(/^create role .*;\r?\n/gm, "");
    await client.query(bootstrap);
  }
    for (const file of (await readdir(path.join(root, "supabase/migrations"))).filter(f => f.endsWith(".sql")).sort()) {
      if ((await client.query("select 1 from public._alvis_test_migrations where name=$1", [file])).rowCount) continue;
      if (file.includes("004_private_storage")) await client.query(await readFile(path.join(root, "tests/integration/storage-harness.sql"), "utf8"));
      await client.query("begin");
      try { await client.query(await readFile(path.join(root, "supabase/migrations", file), "utf8")); await client.query("insert into public._alvis_test_migrations(name) values($1)", [file]); await client.query("commit"); }
      catch (e) { await client.query("rollback"); console.error("Migration failed:", file, e.code, e.message); throw e; }
      console.log("Migration applied:", file);
    }
  const fixtures = JSON.parse(await readFile(path.join(root, "../alvis-blueprint/data/manufacturing-fixtures.json"), "utf8"));
  let lesson = JSON.parse(await readFile(path.join(root, "../alvis-blueprint/data/demo-lesson.json"), "utf8")).content;
  const content = fixtures.knowledge_units[0].content;
  content.asset_code = "PERSONAL";
  lesson = completeSyntheticLesson(lesson, content);
  const ids = [...new Set(JSON.stringify(content).match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g))];
  const quote = text => String(text).replaceAll("'", "''");
  const sources = ids.map(id => fixtures.sources.find(s => s.id === id));
  const sourceSQL = sources.map(s => `insert into sources(id,organization_id,capture_id,kind,locator,text_content,synthetic) values('${s.id}',:'scope','ac100000-0000-4000-8000-000000000001','manual','Synthetic excerpt','${quote(s.text)}',true);`).join("\n");
  lesson.revision_id = "ac300000-0000-4000-8000-000000000001";
  const responses = Object.fromEntries(lesson.questions.map(q => [q.id, q.correct_index]));
  const indexHarness = await readFile(path.join(root, "tests/integration/index-harness.sql"), "utf8");
  const authorization = await readFile(path.join(root, "tests/integration/authorization.sql"), "utf8");
  const cases = ["community", "onboarding", "authorization", "capture", "learning", "storage", "withdrawal"];
  for (const name of cases) {
    let sql = await readFile(path.join(root, `tests/integration/${name}.sql`), "utf8");
    if (name === "community") sql = sql.replace("-- __SOURCES__", () => sourceSQL).replaceAll("__CONTENT__", () => quote(JSON.stringify(content))).replaceAll("__SELECTIONS__", () => quote(JSON.stringify(sources.map(s => ({ id: s.id, excerpt: s.text }))))).replaceAll("__LESSON__", () => quote(JSON.stringify(lesson))).replaceAll("__RESPONSES__", () => quote(JSON.stringify(responses))).replace("begin;", () => "begin;\n" + indexHarness);
    if (["learning", "capture", "withdrawal"].includes(name)) sql = authorization.slice(0, authorization.indexOf("set local role authenticated;")) + indexHarness + "\n" + sql;
    if (name === "authorization") {
      sql = sql.replace("set local role authenticated;", () => indexHarness + "\nset local role authenticated;");
    }
    if (["authorization", "capture"].includes(name)) sql = sql.split("\n").map(line => line.startsWith("select alvis_transition") && line.includes("'approve'") ? line + "\nselect pg_temp.flush_indexes();" : line).join("\n");
    const vars = {};
    for (const statement of statements(sql)) {
      const command = statement.sql.replace(/:'(\w+)'/g, (_, key) => {
        if (!(key in vars)) throw new Error(`Missing test variable ${key}`);
        const value = typeof vars[key] === "object" ? JSON.stringify(vars[key]) : vars[key];
        return `'${quote(value)}'`;
      });
      try {
        const result = await client.query(command);
        if (statement.gset) Object.assign(vars, result.rows[0]);
      } catch (e) { console.error("SQL test failed:", name, e.code, e.message, "Statement:", command.slice(0, 160)); throw e; }
    }
    console.log("PASS: PostgreSQL", name);
  }
  const permissions = await client.query("select public.alvis_function_permissions() as violations");
  if (permissions.rows[0].violations !== true) throw new Error("Function permission regression.");
  console.log("PASS: PostgreSQL function permissions");
} finally { await client.end(); }

function* statements(script) {
  script = script.replace(/^\\(?:set|echo).*$/gm, "");
  let buffer = "", quoteChar = "", dollar = "", comment = false;
  for (let i = 0; i < script.length; i++) {
    const ch = script[i], next = script[i + 1];
    if (comment) { if (ch === "\n") { comment = false; buffer += ch; } continue; }
    if (dollar) {
      if (script.startsWith(dollar, i)) { buffer += dollar; i += dollar.length - 1; dollar = ""; } else buffer += ch;
      continue;
    }
    if (quoteChar) {
      buffer += ch;
      if (ch === quoteChar) { if (next === quoteChar) { buffer += next; i++; } else quoteChar = ""; }
      continue;
    }
    if (ch === "-" && next === "-") { comment = true; i++; continue; }
    if (ch === "'" || ch === '"') { quoteChar = ch; buffer += ch; continue; }
    if (ch === "$") {
      const match = script.slice(i).match(/^\$[\w]*\$/);
      if (match) { dollar = match[0]; buffer += dollar; i += dollar.length - 1; continue; }
    }
    if (script.startsWith("\\gset", i)) {
      if (buffer.trim()) yield { sql: buffer.trim(), gset: true }; buffer = ""; i += 4; continue;
    }
    if (ch === ";") { if (buffer.trim()) yield { sql: buffer.trim(), gset: false }; buffer = ""; }
    else buffer += ch;
  }
  if (buffer.trim()) yield { sql: buffer.trim(), gset: false };
}
