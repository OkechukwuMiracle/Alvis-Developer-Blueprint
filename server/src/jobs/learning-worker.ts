import { createClient } from "@supabase/supabase-js";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import schema from "../../../alvis-blueprint/schemas/lesson.schema.json";
import { embeddings, structured } from "../services/openai";
import { chunksFor, lessonErrors, DIMENSIONS } from "../validation/learning";
import { evidenceIds, type Content } from "../validation/content";
import { PipelineError } from "../validation/capture-contract";
const url = process.env.SUPABASE_URL,
  key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (
  !url ||
  !key ||
  !process.env.OPENAI_API_KEY ||
  !process.env.OPENAI_MODEL_EMBED ||
  !process.env.OPENAI_MODEL_TEXT
)
  throw new Error(
    "Learning worker requires Supabase server settings, OpenAI key, existing text model and OPENAI_MODEL_EMBED.",
  );
const client = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});
async function rpc(name: string, args: Record<string, unknown> = {}) {
  const { data, error } = await client.rpc(name, args);
  if (error) throw new PipelineError("DATABASE_FAILURE", true);
  return data;
}
if ((await rpc("alvis_vector_dimensions")) !== DIMENSIONS)
  throw new Error("Database embedding dimension must be 1536.");
console.info("Learning worker ready; database embedding dimension verified as 1536.");
async function metric(
  job: { id: string; organization_id: string; stage: string },
  metrics: unknown,
) {
  const { error } = await client.from("ai_runs").insert({
    organization_id: job.organization_id,
    job_id: job.id,
    task: job.stage,
    prompt_version: "v1",
    ...(metrics as object),
  });
  if (error) throw new PipelineError("USAGE_RECORD_FAILED", true);
}
let stop = false;
process.on("SIGINT", () => {
  stop = true;
});
process.on("SIGTERM", () => {
  stop = true;
});
do {
  const jobs = await rpc("alvis_claim_learning_job");
  const j = jobs[0];
  if (!j) {
    if (!process.argv.includes("--once"))
      await new Promise((r) => setTimeout(r, 2000));
    continue;
  }
  let lost = false;
  const timer = setInterval(() => {
    rpc("alvis_heartbeat", { job: j.id, token: j.lease_token })
      .then((ok) => {
        if (!ok) lost = true;
      })
      .catch(() => {
        lost = true;
      });
  }, 20000);
  try {
    const { data: r, error } = await client
      .from("knowledge_revisions")
      .select("*")
      .eq("organization_id", j.organization_id)
      .eq("id", j.revision_id)
      .single();
    if (error || !r) throw new PipelineError("REVISION_UNAVAILABLE");
    const content = r.content as Content;
    let completed = true;
    if (j.stage === "index") {
      const chunks = chunksFor(content);
      const response = await embeddings(chunks.map((c) => c.text));
      await metric(j, response.metrics);
      if (lost) throw new PipelineError("WORKER_INTERRUPTED", true);
      completed = await rpc("alvis_finish_index", {
        job: j.id,
        token: j.lease_token,
        chunks: chunks.map((c, i) => ({
          ...c,
          embedding: response.vectors[i],
        })),
        model: response.metrics.model,
      });
    } else {
      const ids = evidenceIds(content);
      const { data: privateSources, error: sError } = await client
        .from("sources")
        .select("id,locator,text_content")
        .eq("organization_id", j.organization_id)
        .in("id", ids);
      if (sError) throw new PipelineError("DATABASE_FAILURE", true);
      let sources = privateSources;
      if (j.payload?.community_publication) {
        const { data: publication, error: publicError } = await client.from("community_publications").select("revision_id,content_hash,excerpts,state").eq("id", j.payload.community_publication).single();
        if (publicError || !publication || publication.state !== "approved" || publication.revision_id !== r.id || publication.content_hash !== r.content_hash)
          throw new PipelineError("REVISION_UNAVAILABLE");
        sources = publication.excerpts;
      }
      const root = resolve(process.cwd(), "../alvis-blueprint/prompts");
      const common = await readFile(resolve(root, "common.md"), "utf8"),
        prompt = await readFile(resolve(root, "lesson.md"), "utf8");
      let value: unknown = null;
      for (let attempt = 0; attempt < 2; attempt++) {
        const response = await structured(
          "alvis_lesson",
          schema,
          common +
            "\n" +
            prompt +
            (j.payload?.community_publication ? "\nThese are public, community-reviewed contributions, not private organization-approved material. Use only the explicitly shared source excerpts. Do not imply verified professional credentials or organization endorsement." : "") +
            "\nUse 130–195 words in the explanation, approximately 60–90 seconds at 130 words/minute. Question 1 tests recognition, 2 reasoning, 3 exceptions or escalation." +
            (attempt
              ? "\nPrevious output failed schema, citations or duration validation. Correct those constraints."
              : ""),
          { revision_id: r.id, content, sources },
        );
        await metric(j, response.metrics);
        if (!lessonErrors(response.value, r.id, ids).length) {
          value = response.value;
          break;
        }
      }
      if (!value) throw new PipelineError("INVALID_MODEL_OUTPUT");
      if (lost) throw new PipelineError("WORKER_INTERRUPTED", true);
      completed =
        (await rpc("alvis_finish_lesson", {
          job: j.id,
          token: j.lease_token,
          content: value,
        })) !== null;
    }
    console.log(
      JSON.stringify({
        job: j.id,
        stage: j.stage,
        status: completed ? "finished" : "cancelled",
      }),
    );
  } catch (e) {
    const error =
      e instanceof PipelineError
        ? e
        : new PipelineError("INVALID_MODEL_OUTPUT");
    await rpc("alvis_fail_job", {
      job: j.id,
      token: j.lease_token,
      code: error.code,
      temporary: error.temporary,
    });
    console.log(JSON.stringify({ job: j.id, error: error.code }));
  } finally {
    clearInterval(timer);
  }
} while (!stop && !process.argv.includes("--once"));
