import type { SupabaseClient } from "@supabase/supabase-js";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import schema from "../../../alvis-blueprint/schemas/answer.schema.json";
import { structured, embeddings } from "./openai";
import {
  precheck,
  answerErrors,
  conflictingReviewedContext,
  DIMENSIONS,
  type Candidate,
  type Answer,
} from "@/validation/learning";
import { evidenceIds } from "@/validation/content";
export async function retrieve(
  client: SupabaseClient,
  org: string,
  asset: string,
  query: string,
) {
  const { data: dimension, error: dimError } = await client.rpc(
    "alvis_vector_dimensions",
  );
  if (dimError || dimension !== DIMENSIONS)
    throw new Error(
      "Embedding column dimensions mismatch; apply Week 3 migration.",
    );
  const vector = await embeddings([query]);
  const { data, error } = await client.rpc("alvis_hybrid_search", {
    org,
    asset,
    query_text: query,
    query_vector: JSON.stringify(vector.vectors[0]),
    model: vector.metrics.model,
  });
  if (error) throw new Error("Approved retrieval unavailable.");
  return { candidates: (data ?? []) as Candidate[], metrics: vector.metrics };
}
export async function compose(
  query: string,
  asset: string | null,
  candidates: Candidate[],
  sources: unknown[],
  reviewContext: "organization" | "community" = "organization",
) {
  const gate = precheck(query, asset);
  if (gate) return { answer: gate, metrics: null };
  if (!candidates.length)
    return {
      answer: {
        mode: "abstain",
        summary:
          "No matching indexed reviewed knowledge is available. Request expert review.",
        claims: [],
        clarifying_question: null,
        escalation_reason: null,
      } as Answer,
      metrics: null,
    };
  if (conflictingReviewedContext(candidates)) {
    return {
      answer: {
        mode: "abstain",
        summary:
          "Reviewed cases describe the same context but different decisions. Request reviewer reconciliation before using a guide.",
        claims: [],
        clarifying_question: null,
        escalation_reason: null,
      } as Answer,
      metrics: null,
    };
  }
  let characters = 0;
  const bounded = candidates.filter((c) => {
    characters += JSON.stringify(c).length;
    return characters <= 10000;
  });
  if (!bounded.length) throw new Error("Reviewed context exceeds size limit.");
  const root = resolve(process.cwd(), "../alvis-blueprint/prompts");
  const [common, prompt] = await Promise.all([
    readFile(resolve(root, "common.md"), "utf8"),
    readFile(resolve(root, "answer.md"), "utf8"),
  ]);
  const ids = new Set(bounded.flatMap((c) => evidenceIds(c.content)));
  const registry = (
    sources as { id: string; text_content: string | null; locator: string }[]
  )
    .filter((s) => ids.has(s.id))
    .map((s) => ({ ...s, text_content: s.text_content?.slice(0, 1000) }));
  const response = await structured(
    "alvis_answer",
    schema,
    common +
      "\n" +
      prompt +
      (reviewContext === "community" ? "\nThe supplied sources are explicitly public, community-reviewed contributions. Community review is not organization approval or verification of professional credentials. Do not attribute them to a private organization." : "") +
      "\nIf applicable approved accounts conflict, return abstain and request reviewer reconciliation. Provide no new procedural instructions.",
    {
      query,
      asset_id: asset,
      training_context:
        "Supervised training simulation only; active hazards are escalated.",
      revisions: bounded,
      source_registry: registry,
    },
  );
  if (answerErrors(response.value, bounded).length)
    return {
      answer: {
        mode: "abstain",
        summary:
          "The generated answer failed source or content validation. Request expert review.",
        claims: [],
        clarifying_question: null,
        escalation_reason: null,
      } as Answer,
      metrics: response.metrics,
      validationFailed: true,
    };
  return { answer: response.value as Answer, metrics: response.metrics };
}
