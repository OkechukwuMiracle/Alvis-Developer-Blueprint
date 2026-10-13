import { createClient } from "@supabase/supabase-js";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import knowledgeSchema from "../../../alvis-blueprint/schemas/knowledge-unit.schema.json";
import debriefSchema from "../../../alvis-blueprint/schemas/debrief.schema.json";
import {
  validatedExtraction,
  debriefErrors,
  validateSegments,
  PipelineError,
} from "../validation/capture-contract";
import { prepareMedia, command } from "./media";
import { structured, transcribe, type ProviderUsage } from "../services/openai";
const url = process.env.SUPABASE_URL,
  key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (
  !url ||
  !key ||
  !process.env.OPENAI_API_KEY ||
  !process.env.OPENAI_MODEL_TEXT ||
  process.env.OPENAI_MODEL_STT !== "whisper-1"
)
  throw new Error(
    "Worker requires Supabase URL/service key, OpenAI key/text model, and OPENAI_MODEL_STT=whisper-1.",
  );
const client = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const bucket = process.env.ALVIS_STORAGE_BUCKET || "alvis-recordings";
const promptRoot = resolve(process.cwd(), "../alvis-blueprint/prompts");
const common = await readFile(join(promptRoot, "common.md"), "utf8");
const extraction = await readFile(join(promptRoot, "extract.md"), "utf8");
const debrief = await readFile(join(promptRoot, "debrief.md"), "utf8");
try {
  await command(process.env.FFMPEG_PATH || "ffmpeg", ["-version"]);
  await command(process.env.FFPROBE_PATH || "ffprobe", ["-version"]);
} catch {
  throw new Error("Media worker startup failed: FFmpeg/ffprobe unavailable or damaged. Check FFMPEG_PATH/FFPROBE_PATH or rebuild the worker image.");
}
console.info("Media worker ready; durable processing jobs use bounded retries and leases.");
type Job = {
  id: string;
  capture_id: string;
  organization_id: string;
  stage: string;
  lease_token: string;
  payload: { upload_id?: string; generation: number; base_hash?: string };
  attempts: number;
};
async function rpc(name: string, args: Record<string, unknown> = {}) {
  const { data, error } = await client.rpc(name, args);
  if (error) throw new PipelineError("DATABASE_FAILURE", true);
  return data;
}
async function download(storageKey: string, directory: string) {
  const { data, error } = await client.storage
    .from(bucket)
    .download(storageKey);
  if (error || !data) throw new PipelineError("STORAGE_UNAVAILABLE", true);
  if (data.size > 104857600) throw new PipelineError("INVALID_SIZE");
  const path = join(directory, "input");
  await writeFile(path, Buffer.from(await data.arrayBuffer()));
  return path;
}
async function metrics(j: Job, m: ProviderUsage) {
  const { error } = await client.from("ai_runs").insert({
    organization_id: j.organization_id,
    job_id: j.id,
    task: j.stage,
    prompt_version: "v1",
    ...m,
  });
  if (error) throw new PipelineError("USAGE_RECORD_FAILED", true);
}
async function run(j: Job) {
  const directory = await mkdtemp(join(tmpdir(), "alvis-"));
  let lost = false;
  const heartbeat = setInterval(() => {
    rpc("alvis_heartbeat", { job: j.id, token: j.lease_token })
      .then((ok) => {
        if (!ok) lost = true;
      })
      .catch(() => {
        lost = true;
      });
  }, 20000);
  try {
    const { data: c, error } = await client
      .from("captures")
      .select("*")
      .eq("organization_id", j.organization_id)
      .eq("id", j.capture_id)
      .single();
    if (error || !c) throw new PipelineError("CAPTURE_UNAVAILABLE");
    if (
      ["extract", "debrief"].includes(j.stage) &&
      j.payload.generation !== c.generation
    ) {
      await rpc("alvis_finish_job", {
        job: j.id,
        token: j.lease_token,
        result: {},
      });
      console.log(
        JSON.stringify({ job: j.id, stage: j.stage, status: "superseded" }),
      );
      return;
    }
    let result: Record<string, unknown>;
    if (
      j.stage === "media" ||
      j.stage === "transcribe" ||
      j.stage === "answer"
    ) {
      const uploadQuery = client
        .from("capture_uploads")
        .select("*")
        .eq("organization_id", j.organization_id)
        .eq("capture_id", c.id);
      const { data: u, error: upError } = j.payload.upload_id
        ? await uploadQuery.eq("id", j.payload.upload_id).single()
        : await uploadQuery
            .is("question_id", null)
            .eq("storage_key", c.storage_key.replace(/\/verified\/.*$/, ""))
            .limit(1)
            .maybeSingle();
      // Transcription reads the frozen recording; its original upload contains the expected checksum.
      const original =
        j.stage === "transcribe"
          ? await client
              .from("capture_uploads")
              .select("*")
              .eq("organization_id", j.organization_id)
              .eq("capture_id", c.id)
              .is("question_id", null)
              .eq("checksum", c.content_hash)
              .limit(1)
              .single()
          : null;
      const upload = j.stage === "transcribe" ? original?.data : u;
      if ((j.stage !== "transcribe" && upError) || !upload)
        throw new PipelineError("UPLOAD_UNAVAILABLE");
      const input = await download(
        j.stage === "transcribe" ? c.storage_key : upload.storage_key,
        directory,
      );
      const wav = join(directory, "audio.wav");
      const media = await prepareMedia(
        input,
        wav,
        upload.mime,
        Number(upload.expected_bytes),
        upload.checksum,
        j.stage === "answer",
      );
      if (j.stage === "media") {
        const frozen =
          j.organization_id +
          "/" +
          c.id +
          "/verified/" +
          randomUUID() +
          "/recording";
        const { error: storeError } = await client.storage
          .from(bucket)
          .upload(frozen, await readFile(input), {
            contentType: upload.mime,
            upsert: false,
          });
        if (storeError) throw new PipelineError("STORAGE_UNAVAILABLE", true);
        result = { ...media, storage_key: frozen };
      } else {
        const t = await transcribe(wav, media.audio_seconds);
        await metrics(j, t.metrics);
        const segments = validateSegments(
          t.data.segments,
          media.audio_seconds,
        ).map((s) =>
          j.stage === "transcribe"
            ? {
                ...s,
                start_ms: s.start_ms + media.audio_offset_ms,
                end_ms: s.end_ms + media.audio_offset_ms,
              }
            : s,
        );
        if (j.stage === "transcribe") result = { segments };
        else {
          const frozen =
            j.organization_id +
            "/" +
            c.id +
            "/verified/" +
            randomUUID() +
            "/answer";
          const { error: storeError } = await client.storage
            .from(bucket)
            .upload(frozen, await readFile(input), {
              contentType: upload.mime,
              upsert: false,
            });
          if (storeError) throw new PipelineError("STORAGE_UNAVAILABLE", true);
          result = {
            text: segments.map((s) => s.text).join(" "),
            storage_key: frozen,
          };
        }
      }
    } else {
      const { data: sourceRows, error: sourceError } = await client
        .from("sources")
        .select("id,kind,text_content,start_ms,end_ms,evidence_version")
        .eq("organization_id", j.organization_id)
        .eq("capture_id", c.id);
      if (sourceError) throw new PipelineError("DATABASE_FAILURE", true);
      const sources = (sourceRows ?? []).filter(
        (s) =>
          s.kind === "debrief" ||
          (s.kind === "transcript" &&
            s.evidence_version === c.transcript_version),
      );
      const ids = sources.map((s) => s.id);
      const { data: asset } = await client
        .from("assets")
        .select("code")
        .eq("organization_id", j.organization_id)
        .eq("id", c.asset_id)
        .single();
      const { data: r } = await client
        .from("knowledge_revisions")
        .select("content")
        .eq("organization_id", j.organization_id)
        .eq(
          "id",
          c.current_revision_id ?? "00000000-0000-4000-8000-000000000000",
        )
        .maybeSingle();
      const { data: answers } = await client
        .from("debrief_items")
        .select("id,target_field,cannot_confirm,answer_source_id")
        .eq("organization_id", j.organization_id)
        .eq("capture_id", c.id);
      const input = {
        asset_code: asset?.code,
        title: c.title,
        task: c.task,
        evidence_registry: sources,
        draft: r?.content,
        answers,
        answered_question_ids: (answers ?? [])
          .filter((q) => q.answer_source_id)
          .map((q) => q.id),
        frames: [],
      };
      let valid = false;
      result = {};
      // One repair for structurally invalid output, then stop for human inspection.
      for (let attempt = 0; attempt < 2; attempt++) {
        const response = await structured(
          j.stage === "extract" ? "knowledge_unit" : "debrief",
          j.stage === "extract" ? knowledgeSchema : debriefSchema,
          common +
            "\n" +
            (j.stage === "extract" ? extraction : debrief) +
            (attempt
              ? "\nThe previous response failed validation. Return only supported, schema-valid claims and actual evidence IDs."
              : ""),
          input,
        );
        await metrics(j, response.metrics);
        try {
          if (j.stage === "extract") {
            const content = validatedExtraction(
              response.value,
              ids,
              asset?.code ?? "",
            );
            for (const answer of answers ?? []) {
              if (answer.cannot_confirm) {
                const field = answer.target_field as
                  | "signal"
                  | "reason"
                  | "exceptions"
                  | "prerequisites"
                  | "stop_conditions"
                  | "outcome";
                if (
                  ["exceptions", "prerequisites", "stop_conditions"].includes(
                    field,
                  )
                )
                  Object.assign(content, { [field]: [] });
                else
                  Object.assign(content, {
                    [field]: { text: null, basis: "unknown", evidence_ids: [] },
                  });
                content.missing_information = [
                  ...new Set([
                    ...content.missing_information,
                    "Contributor cannot confirm " + answer.target_field,
                  ]),
                ];
              }
            }
            result = { content };
          } else {
            const errors = debriefErrors(response.value, ids, r?.content);
            if (errors.length) throw new PipelineError("INVALID_MODEL_OUTPUT");
            result = response.value as Record<string, unknown>;
          }
          valid = true;
          break;
        } catch (e) {
          if (!(e instanceof PipelineError)) throw e;
        }
      }
      if (!valid) throw new PipelineError("INVALID_MODEL_OUTPUT");
    }
    if (lost) throw new PipelineError("WORKER_INTERRUPTED", true);
    await rpc("alvis_finish_job", { job: j.id, token: j.lease_token, result });
    console.log(
      JSON.stringify({ job: j.id, stage: j.stage, status: "finished" }),
    );
  } catch (error) {
    const e =
      error instanceof PipelineError
        ? error
        : new PipelineError("UNEXPECTED_WORKER_ERROR");
    await rpc("alvis_fail_job", {
      job: j.id,
      token: j.lease_token,
      code: e.code,
      temporary: e.temporary,
    });
    console.log(JSON.stringify({ job: j.id, stage: j.stage, error: e.code }));
  } finally {
    clearInterval(heartbeat);
    await rm(directory, { recursive: true, force: true });
  }
}
let stopping = false;
process.on("SIGINT", () => {
  stopping = true;
});
process.on("SIGTERM", () => {
  stopping = true;
});
do {
  const jobs = (await rpc("alvis_claim_job")) as Job[];
  if (jobs[0]) await run(jobs[0]);
  else if (!process.argv.includes("--once"))
    await new Promise((resolve) => setTimeout(resolve, 2000));
} while (!stopping && !process.argv.includes("--once"));
