import { readFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";
import fixtures from "../../alvis-blueprint/data/manufacturing-fixtures.json";
import { contentErrors, evidenceIds, Content } from "../src/validation/content";
const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const accountFile = process.env.ALVIS_SEED_ACCOUNTS_FILE;
if (!url || !key || !accountFile)
  throw new Error(
    "Set Supabase URL, service role key and ALVIS_SEED_ACCOUNTS_FILE.",
  );
if (!fixtures.organization.demo_only)
  throw new Error(
    "Synthetic approvals may only be seeded into a flagged demo organization.",
  );
const client = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const accounts = JSON.parse(await readFile(accountFile, "utf8")) as Record<
  string,
  { email: string; password: string }
>;
// Validate all local inputs before creating any real Auth accounts.
const emails = new Set<string>();
for (const person of fixtures.people) {
  const account = accounts[person.role];
  if (!account?.email || !account.password || account.password.length < 12)
    throw new Error(
      `External account file requires ${person.role} email and password (12+ characters).`,
    );
  const email = account.email.trim().toLowerCase();
  if (emails.has(email))
    throw new Error("Each fixture role requires a distinct account email.");
  emails.add(email);
}
for (const unit of fixtures.knowledge_units) {
  const errors = contentErrors(
    unit.content,
    fixtures.sources.map((source) => source.id),
    unit.status === "approved",
  );
  if (errors.length) throw new Error(`${unit.code}: ${errors.join(" ")}`);
}
const ids = new Map<string, string>();
async function insert(table: string, values: object | object[]) {
  const { error } = await client.from(table).insert(values);
  if (error) throw new Error(`${table}: ${error.message}`);
}
const { data: existing, error: existingError } = await client
  .from("organizations")
  .select("id")
  .eq("id", fixtures.organization.id)
  .maybeSingle();
if (existingError) throw existingError;
if (existing)
  throw new Error(
    "Fixture tenant already exists. Seed is intentionally one-time; it never overwrites reviewed data. Reset a disposable development database to repeat.",
  );
for (const p of fixtures.people) {
  const account = accounts[p.role];
  if (!account?.email || !account.password || account.password.length < 12)
    throw new Error(
      `External account file requires ${p.role} email and password (12+ characters).`,
    );
  const { data, error } = await client.auth.admin.createUser({
    ...account,
    email_confirm: true,
  });
  if (error)
    throw new Error(
      `Account ${p.role}: ${error.message}. For a retry after partial failure, use a fresh development project.`,
    );
  ids.set(p.id, data.user.id);
}
await insert("organizations", fixtures.organization);
await insert(
  "memberships",
  fixtures.people.map((p) => ({
    organization_id: fixtures.organization.id,
    user_id: ids.get(p.id),
    role: p.role,
    display_name: p.name,
  })),
);
await insert("sites", fixtures.site);
await insert(
  "assets",
  fixtures.assets.map((a) => ({
    ...a,
    organization_id: fixtures.organization.id,
    site_id: fixtures.site.id,
  })),
);
await insert(
  "sources",
  fixtures.sources.map((s) => ({
    id: s.id,
    organization_id: s.organization_id,
    kind: s.kind,
    locator: s.locator,
    text_content: s.text,
    synthetic: true,
  })),
);
const expert = fixtures.people.find((p) => p.role === "expert")!;
const reviewer = fixtures.people.find((p) => p.role === "reviewer")!;
for (const u of fixtures.knowledge_units) {
  const errors = contentErrors(
    u.content,
    fixtures.sources.map((s) => s.id),
    u.status === "approved",
  );
  if (errors.length) throw new Error(`${u.code}: ${errors.join(" ")}`);
  const evidence = evidenceIds(u.content as Content);
  await insert("knowledge_units", {
    id: u.id,
    organization_id: u.organization_id,
    asset_id: u.asset_id,
    code: u.code,
  });
  await insert("knowledge_revisions", {
    id: u.revision_id,
    organization_id: u.organization_id,
    unit_id: u.id,
    version: u.version,
    status: u.status,
    content: u.content,
    index_ready: false,
    created_by: ids.get(expert.id),
  });
  await insert(
    "revision_sources",
    evidence.map((source_id) => ({
      organization_id: u.organization_id,
      revision_id: u.revision_id,
      source_id,
    })),
  );
  if (["approved", "rejected", "retired"].includes(u.status)) {
    const { data: r, error } = await client
      .from("knowledge_revisions")
      .select("content_hash")
      .eq("id", u.revision_id)
      .eq("organization_id", u.organization_id)
      .single();
    if (error) throw error;
    await insert("reviews", {
      organization_id: u.organization_id,
      revision_id: u.revision_id,
      reviewer_id: ids.get(reviewer.id),
      decision:
        u.status === "approved"
          ? "approve"
          : u.status === "rejected"
            ? "reject"
            : "retire",
      comment: "Simulated fixture review; fictional training example.",
      content_hash: r.content_hash,
    });
  }
  if (u.status === "approved") {
    await insert("knowledge_text_index", {
      organization_id: u.organization_id,
      revision_id: u.revision_id,
      text_content: JSON.stringify(u.content),
    });
    const { error: e1 } = await client
      .from("knowledge_revisions")
      .update({ index_ready: false })
      .eq("id", u.revision_id)
      .eq("organization_id", u.organization_id);
    if (e1) throw e1;
    const { error: e2 } = await client
      .from("knowledge_units")
      .update({ active_revision_id: u.revision_id })
      .eq("id", u.id)
      .eq("organization_id", u.organization_id);
    if (e2) throw e2;
    const { data: indexRevision, error: indexError } = await client
      .from("knowledge_revisions")
      .select("content_hash")
      .eq("id", u.revision_id)
      .eq("organization_id", u.organization_id)
      .single();
    if (indexError || !indexRevision)
      throw new Error("Seeded revision hash unavailable.");
    await insert("processing_jobs", {
      organization_id: u.organization_id,
      revision_id: u.revision_id,
      stage: "index",
      dedupe_key: u.revision_id + ":index:v1",
      payload: { content_hash: indexRevision.content_hash },
    });
  }
}
await insert("audit_events", {
  organization_id: fixtures.organization.id,
  action: "synthetic_seed",
  entity_type: "organization",
  entity_id: fixtures.organization.id,
  metadata: { synthetic: true },
});
console.log(
  "Synthetic training fixtures loaded. Sign in with accounts from your external file. Approved fixtures are queued for real embeddings. Run npm run worker:learning before worker retrieval.",
);
