import { createClient } from "@supabase/supabase-js";
import { mkdir, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
type Check = {
  name: string;
  status: "passed" | "failed" | "blocked" | "untested";
  detail: string;
};
const checks: Check[] = [];
const add = (name: string, status: Check["status"], detail: string) =>
  checks.push({ name, status, detail });
const required = [
  "SUPABASE_URL",
  "SUPABASE_PUBLISHABLE_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "OPENAI_API_KEY",
  "OPENAI_MODEL_TEXT",
  "OPENAI_MODEL_EMBED",
  "SUPABASE_S3_ENDPOINT",
  "SUPABASE_S3_REGION",
  "SUPABASE_S3_ACCESS_KEY_ID",
  "SUPABASE_S3_SECRET_ACCESS_KEY",
  "ALVIS_SITE_URL",
  "ALVIS_AUTH_FLOW_SECRET",
];
for (const name of required)
  add(
    name,
    process.env[name] ? "passed" : "blocked",
    process.env[name] ? "Present; value withheld." : "Missing configuration.",
  );
for (const [name, key, fallback] of [
  ["FFmpeg", "FFMPEG_PATH", "ffmpeg"],
  ["ffprobe", "FFPROBE_PATH", "ffprobe"],
]) {
  const result = spawnSync(process.env[key] || fallback, ["-version"], {
    encoding: "utf8",
    timeout: 10000,
    windowsHide: true,
  });
  add(
    name,
    result.status === 0 ? "passed" : "blocked",
    result.status === 0
      ? "Executable responds to -version."
      : "Install binary, configure absolute path, or use the worker container.",
  );
}
const url = process.env.SUPABASE_URL,
  key = process.env.SUPABASE_PUBLISHABLE_KEY,
  service = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (url && key && service) {
  const client = createClient(url, service, {
    auth: { persistSession: false },
  });
  for (const table of [
    "organizations",
    "memberships",
    "member_invitations",
    "extraction_proposals",
    "knowledge_chunks",
  ]) {
    const { error } = await client
      .from(table)
      .select("id", { head: true, count: "exact" })
      .limit(0);
    // Membership has a composite key rather than id.
    if (table === "memberships") {
      const { error: e } = await client
        .from(table)
        .select("revoked_at", { head: true })
        .limit(0);
      add(
        table,
        e ? "blocked" : "passed",
        e
          ? "Onboarding migration or server access unavailable."
          : "Onboarding column is accessible.",
      );
    } else
      add(
        table,
        error ? "blocked" : "passed",
        error
          ? "Table unavailable; inspect migrations and staging credentials."
          : "Schema accessible through server credentials.",
      );
  }
  const { data: dimensions, error } = await client.rpc(
    "alvis_vector_dimensions",
  );
  const {data:permissions,error:aclError}=await client.rpc("alvis_function_permissions");
  add("RPC function permissions",!aclError&&permissions===true?"passed":"blocked",!aclError&&permissions===true?"Anonymous execution is revoked and worker/publication roles are separated.":"Apply migration 010 and the read-only checker 012; confirm Alvis RPC ACLs before release.");
  add(
    "vector dimensions",
    !error && dimensions === 1536 ? "passed" : "blocked",
    !error && dimensions === 1536
      ? "Database column reports 1536; provider output is checked during indexing."
      : "Apply retrieval migration and verify dimensions.",
  );
  const { data: bucket, error: storage } = await client.storage.getBucket(
    process.env.ALVIS_STORAGE_BUCKET || "alvis-recordings",
  );
  add(
    "private bucket",
    !storage && bucket?.public === false ? "passed" : "blocked",
    !storage && bucket?.public === false
      ? "Bucket is private. Signed upload/download still require an end-to-end recording test."
      : "Private bucket unavailable or incorrectly public.",
  );
  try {
    const response = await fetch(url + "/auth/v1/settings", {
      headers: { apikey: key },
      signal: AbortSignal.timeout(15000),
    });
    const settings = await response.json();
    add(
      "public signup + verification",
      response.ok &&
        settings.disable_signup === false &&
        settings.mailer_autoconfirm === false
        ? "passed"
        : "blocked",
      response.ok &&
        settings.disable_signup === false &&
        settings.mailer_autoconfirm === false
        ? "Auth settings report signup enabled and email confirmation required."
        : "Verify public signup is enabled and Confirm Email is enabled in Supabase.",
    );
  } catch {
    add(
      "public signup + verification",
      "blocked",
      "Auth settings could not be inspected.",
    );
  }
}
add(
  "invitation SMTP",
  process.env.SMTP_HOST && process.env.SMTP_FROM ? "untested" : "blocked",
  process.env.SMTP_HOST && process.env.SMTP_FROM
    ? "Configured; external delivery has not been tested."
    : "Configure application invitation SMTP; manual private links remain available.",
);
add(
  "external verification email",
  "untested",
  "Provider settings do not establish delivery. Test a real recipient inbox.",
);
add(
  "live training recording",
  process.env.ALVIS_LIVE_RECORDING && process.env.ALVIS_LIVE_DEBRIEF_FILE
    ? "untested"
    : "blocked",
  "Requires a consented recording and expert-confirmed answers outside Git.",
);
await mkdir("evaluation-results", { recursive: true });
await writeFile(
  "evaluation-results/week4-preflight.json",
  JSON.stringify(
    { checked_at: new Date().toISOString(), read_only: true, checks },
    null,
    2,
  ),
);
for (const check of checks)
  console.log(`${check.status.toUpperCase()} ${check.name}: ${check.detail}`);
if (checks.some((c) => c.status === "failed" || c.status === "blocked"))
  process.exitCode = 1;
