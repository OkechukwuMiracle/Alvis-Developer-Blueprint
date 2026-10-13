import { readFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

// No environment files, credentials, or network connections are used here.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const names = [
  "202610120013_community.sql", "202610120014_community_learning.sql",
  "202610120015_community_feedback.sql", "202610120016_community_compatibility.sql",
  "202610120017_community_guards.sql",
];
const parts = await Promise.all(names.map(name => readFile(path.join(root, "supabase/migrations", name), "utf8")));
const sql = [
  "-- Apply only to an Alvis database with migrations 001–012 already installed.",
  "-- Back up the project first. This additive upgrade runs in one transaction.",
  "begin;",
  `do $$ begin
    if to_regprocedure('public.alvis_function_permissions()') is null then
      raise exception 'Install Alvis migrations 001–012 before this upgrade';
    end if;
    if exists(select 1 from information_schema.columns where table_schema='public' and table_name='organizations' and column_name='scope_kind') then
      raise exception 'Community migration already started or applied; inspect migration history before continuing';
    end if;
  end $$;`,
  ...parts.map((body, i) => `-- ${names[i]}\n${body}`),
  "notify pgrst, 'reload schema';",
  "commit;",
].join("\n\n");
const output = path.join(root, "var/tmp/community-upgrade.sql");
await mkdir(path.dirname(output), { recursive: true });
await writeFile(output, sql, "utf8");
console.log("Prepared server/var/tmp/community-upgrade.sql (migrations 013–017).");
console.log("Run its contents in the configured Supabase project's SQL Editor, then run npm run db:check --workspace @alvis/server.");
console.log("This command prepares SQL only; it does not change any database.");
