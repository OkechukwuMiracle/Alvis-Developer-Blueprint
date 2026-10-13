import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import cases from "../../alvis-blueprint/data/evaluation-cases.json";
import { retrieve, compose } from "../src/services/answer-pipeline";
import { answerErrors, type Candidate } from "../src/validation/learning";
import { evidenceIds } from "../src/validation/content";
const report: {
  generated_at: string;
  text_model: string | null;
  embedding_model: string | null;
  environment: string;
  cases: Record<string, unknown>[];
} = {
  generated_at: new Date().toISOString(),
  text_model: process.env.OPENAI_MODEL_TEXT ?? null,
  embedding_model: process.env.OPENAI_MODEL_EMBED ?? null,
  environment:
    "Supabase Auth + live provider; blocked entries contain no fabricated responses",
  cases: [],
};
const url = process.env.SUPABASE_URL,
  key = process.env.SUPABASE_PUBLISHABLE_KEY,
  accounts = process.env.ALVIS_E2E_ACCOUNTS_FILE;
let client: SupabaseClient | null = null,
  org: string | null = null,
  assets: { id: string; code: string }[] = [],
  block: string | null = null;
try {
  if (
    !url ||
    !key ||
    !accounts ||
    !process.env.OPENAI_API_KEY ||
    !process.env.OPENAI_MODEL_EMBED
  )
    throw new Error(
      "Set public Supabase settings, ALVIS_E2E_ACCOUNTS_FILE, OPENAI_API_KEY and OPENAI_MODEL_EMBED.",
    );
  const users = JSON.parse(await readFile(accounts, "utf8"));
  client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await client.auth.signInWithPassword(users.worker);
  if (error || !data.user)
    throw new Error("Real worker authentication failed.");
  const { data: m, error: mError } = await client
    .from("memberships")
    .select("organization_id")
    .eq("user_id", data.user.id)
    .order("organization_id")
    .limit(1)
    .single();
  if (mError || !m) throw new Error("Worker membership unavailable.");
  org = m.organization_id;
  const { data: a, error: aError } = await client
    .from("assets")
    .select("id,code")
    .eq("organization_id", org!);
  if (aError) throw new Error("Assets unavailable.");
  assets = a ?? [];
} catch (e) {
  block = (e as Error).message;
}
for (const c of cases) {
  const started = Date.now();
  const base = {
    id: c.id,
    query: c.query,
    expected_mode: c.expected_mode,
    expected_relevant_units: c.relevant_units,
    forbidden_units: c.forbidden_units,
  };
  if (block || !client || !org) {
    report.cases.push({
      ...base,
      status: "blocked",
      reason: block,
      retrieved_revision_ids: [],
      actual_mode: null,
      citation_validity: "not_executed",
      source_support: "not_evaluated",
    });
    continue;
  }
  try {
    const asset = assets.find((a) => a.code === c.asset_code);
    if (c.asset_code && !asset) throw new Error("Evaluation asset not seeded.");
    const retrieval = asset
      ? await retrieve(client, org, asset.id, c.query)
      : { candidates: [] as Candidate[], metrics: null };
    const retrieved = retrieval.candidates;
    const ids = [...new Set(retrieved.flatMap((r) => evidenceIds(r.content)))];
    const { data: sources, error } = await client
      .from("sources")
      .select("id,locator,text_content")
      .eq("organization_id", org)
      .in("id", ids);
    if (error) throw new Error("Source registry unavailable.");
    const result = await compose(
      c.query,
      asset?.id ?? null,
      retrieved,
      sources ?? [],
    );
    const active = await Promise.all(
      retrieved.map(async (r) => {
        const { data, error } = await client!.rpc("alvis_is_active", {
          org,
          rev: r.revision_id,
        });
        return !error && data === true;
      }),
    );
    if (active.some((x) => !x))
      throw new Error("Retrieved context changed during evaluation.");
    report.cases.push({
      ...base,
      status: "executed",
      actual_mode: result.answer.mode,
      mode_matches: result.answer.mode === c.expected_mode,
      retrieved_revision_ids: retrieved.map((r) => r.revision_id),
      retrieved_units: retrieved.map((r) => r.code),
      retrieval_recall: c.relevant_units.every((code) =>
        retrieved.some((r) => r.code === code),
      ),
      forbidden_excluded: c.forbidden_units.every(
        (code) => !retrieved.some((r) => r.code === code),
      ),
      citation_validity: answerErrors(result.answer, retrieved).length
        ? "invalid"
        : "valid",
      source_support: result.answer.claims.length
        ? "pending_human_review"
        : "no_factual_claims",
      answer: result.answer,
      claim_source_excerpts: result.answer.claims.map((claim) => ({
        claim: claim.text,
        evidence: (sources ?? []).filter((s) =>
          claim.evidence_ids.includes(s.id),
        ),
      })),
      latency_ms: Date.now() - started,
      usage: [retrieval.metrics, result.metrics].filter(Boolean),
    });
  } catch (e) {
    report.cases.push({
      ...base,
      status: "blocked",
      reason: (e as Error).message,
      retrieved_revision_ids: [],
      actual_mode: null,
      citation_validity: "not_executed",
      source_support: "not_evaluated",
    });
  }
}
await mkdir("evaluation-results", { recursive: true });
await writeFile(
  "evaluation-results/week3.json",
  JSON.stringify(report, null, 2) + "\n",
);
console.log(
  JSON.stringify({
    report: "evaluation-results/week3.json",
    executed: report.cases.filter((c) => c.status === "executed").length,
    blocked: report.cases.filter((c) => c.status === "blocked").length,
  }),
);
if (
  report.cases.some(
    (c) =>
      c.status === "blocked" ||
      c.mode_matches === false ||
      c.retrieval_recall === false ||
      c.forbidden_excluded === false ||
      c.citation_validity === "invalid",
  )
)
  process.exitCode = 1;
