import { readFile } from "node:fs/promises";
import { PipelineError } from "../validation/capture-contract";
type Output = { type: string; content?: { type: string; text?: string }[] };
type ResponseBody = {
  id?: string;
  status?: string;
  output?: Output[];
  usage?: Record<string, unknown>;
};
export type ProviderUsage = {
  model: string;
  latency_ms: number;
  provider_request_id: string | null;
  usage: Record<string, unknown> | null;
  input_tokens: number | null;
  output_tokens: number | null;
  audio_seconds?: number;
};
async function call(endpoint: string, body: BodyInit, contentType?: string) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new PipelineError("OPENAI_NOT_CONFIGURED");
  const started = Date.now();
  let response: Response;
  try {
    response = await fetch("https://api.openai.com/v1/" + endpoint, {
      method: "POST",
      headers: {
        Authorization: "Bearer " + key,
        ...(contentType ? { "Content-Type": contentType } : {}),
      },
      body,
      signal: AbortSignal.timeout(90000),
    });
  } catch {
    throw new PipelineError("TRANSIENT", true);
  }
  if (!response.ok)
    throw new PipelineError(
      response.status === 429 || response.status >= 500
        ? "TRANSIENT"
        : "PROVIDER_CONFIGURATION",
      response.status === 429 || response.status >= 500,
    );
  return {
    data: await response.json(),
    latency: Date.now() - started,
    request: response.headers.get("x-request-id"),
  };
}
export async function transcribe(path: string, duration: number) {
  const model = process.env.OPENAI_MODEL_STT;
  if (model !== "whisper-1")
    throw new PipelineError("TIMESTAMP_MODEL_REQUIRED");
  const form = new FormData();
  form.append(
    "file",
    new Blob([await readFile(path)], { type: "audio/wav" }),
    "audio.wav",
  );
  form.append("model", model);
  form.append("response_format", "verbose_json");
  form.append("timestamp_granularities[]", "segment");
  const { data, latency, request } = await call("audio/transcriptions", form);
  return {
    data,
    metrics: {
      model,
      latency_ms: latency,
      provider_request_id: request,
      usage: data.usage ?? null,
      input_tokens: null,
      output_tokens: null,
      audio_seconds: duration,
    } as ProviderUsage,
  };
}
export async function structured(
  name: string,
  schema: unknown,
  instructions: string,
  input: unknown,
) {
  const model = process.env.OPENAI_MODEL_TEXT;
  if (!model) throw new PipelineError("TEXT_MODEL_REQUIRED");
  const { data, latency, request } = await call(
    "responses",
    JSON.stringify({
      model,
      store: false,
      input: [
        { role: "developer", content: instructions },
        { role: "user", content: JSON.stringify(input) },
      ],
      text: { format: { type: "json_schema", name, strict: true, schema } },
      max_output_tokens: 8000,
    }),
    "application/json",
  );
  const response = data as ResponseBody;
  const metrics: ProviderUsage = {
    model,
    latency_ms: latency,
    provider_request_id: request,
    usage: response.usage ?? null,
    input_tokens:
      typeof response.usage?.input_tokens === "number"
        ? response.usage.input_tokens
        : null,
    output_tokens:
      typeof response.usage?.output_tokens === "number"
        ? response.usage.output_tokens
        : null,
  };
  const blocks = response.output?.flatMap((o) => o.content ?? []) ?? [];
  if (
    response.status !== "completed" ||
    blocks.some((b) => b.type === "refusal")
  )
    return { value: null, metrics };
  const text = blocks
    .filter((b) => b.type === "output_text")
    .map((b) => b.text ?? "")
    .join("");
  try {
    return { value: JSON.parse(text), metrics };
  } catch {
    return { value: null, metrics };
  }
}

export async function embeddings(input: string[]) {
  const model = process.env.OPENAI_MODEL_EMBED;
  if (!model || !input.length)
    throw new PipelineError("EMBEDDING_MODEL_REQUIRED");
  const { data, latency, request } = await call(
    "embeddings",
    JSON.stringify({
      model,
      input,
      dimensions: 1536,
      encoding_format: "float",
    }),
    "application/json",
  );
  const rows = [...(data.data ?? [])] as {
    index: number;
    embedding: number[];
  }[];
  rows.sort((a, b) => a.index - b.index);
  if (
    rows.length !== input.length ||
    rows.some(
      (r, i) =>
        r.index !== i ||
        !Array.isArray(r.embedding) ||
        r.embedding.length !== 1536 ||
        !r.embedding.every(
          (x: unknown) => typeof x === "number" && Number.isFinite(x),
        ) ||
        !r.embedding.some((x: number) => x !== 0),
    )
  )
    throw new PipelineError("EMBEDDING_DIMENSIONS");
  return {
    vectors: rows.map((r) => r.embedding as number[]),
    metrics: {
      model,
      latency_ms: latency,
      provider_request_id: request,
      usage: data.usage ?? null,
      input_tokens: data.usage?.prompt_tokens ?? null,
      output_tokens: null,
    } as ProviderUsage,
  };
}
