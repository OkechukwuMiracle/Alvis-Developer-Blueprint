import path from "node:path";
import { fileURLToPath } from "node:url";

const serverRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
process.loadEnvFile(path.resolve(serverRoot, process.env.ALVIS_ENV_FILE || ".env.local"));
const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the server environment.");
let failed = false;
for (const [table, columns] of [
  ["organizations", "id,demo_only,scope_kind,personal_owner"], ["memberships", "organization_id,role,revoked_at"],
  ["assets", "id"], ["knowledge_units", "id,active_revision_id"],
  ["knowledge_revisions", "id,index_ready,audience"], ["audit_events", "id"],
  ["community_profiles", "user_id,role"], ["community_publications", "id,audience,state"],
]) {
  try {
    const response = await fetch(`${url}/rest/v1/${table}?select=${columns}&limit=0`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) {
      failed = true;
      const result = await response.json();
      const setup = ["PGRST205", "PGRST204", "42P01", "42703"].includes(result.code);
      console.error(`${table}: ${setup ? "missing database schema; apply migrations 001–017" : `unavailable (HTTP ${response.status})`}`);
    } else console.log(`${table}: accessible`);
  } catch {
    failed = true;
    console.error(`${table}: connection unavailable; check the configured Supabase project`);
  }
}
process.exitCode = failed ? 1 : 0;
