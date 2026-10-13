import Ajv from "ajv/dist/2020";
import debriefSchema from "../../alvis-blueprint/schemas/debrief.schema.json";
import { contentErrors, type Content } from "./content";
export const MAX_VIDEO_BYTES = 100 * 1024 * 1024;
export const MAX_AUDIO_BYTES = 10 * 1024 * 1024;
export const CONSENT_VERSION = "recording-v1";
export class PipelineError extends Error {
  constructor(
    public code: string,
    public temporary = false,
  ) {
    super(code);
  }
}
export function uploadErrors(mime: unknown, bytes: unknown, audio = false) {
  const max = audio ? MAX_AUDIO_BYTES : MAX_VIDEO_BYTES;
  return typeof mime !== "string" ||
    !(
      audio ? ["audio/mp4", "audio/webm"] : ["video/mp4", "video/webm"]
    ).includes(mime) ||
    typeof bytes !== "number" ||
    !Number.isSafeInteger(bytes) ||
    bytes < 1 ||
    bytes > max
    ? ["Unsupported type or file size."]
    : [];
}
export type Question = {
  id: string;
  target_field:
    | "signal"
    | "reason"
    | "exceptions"
    | "prerequisites"
    | "stop_conditions"
    | "outcome";
  question: string;
  gap: string;
  source_ids: string[];
};
const validateDebrief = new Ajv({ allErrors: true }).compile(debriefSchema);
export function debriefErrors(value: unknown, ids: string[], draft?: Content) {
  if (!validateDebrief(value)) return ["Invalid debrief schema."];
  const { questions } = value as { questions: Question[] };
  const errors: string[] = [];
  if (
    questions.length > 5 ||
    new Set(questions.map((q) => q.id)).size !== questions.length
  )
    errors.push("Debrief requires at most five distinct questions.");
  if (
    questions.some(
      (q) =>
        !q.id.trim() ||
        !q.question.trim() ||
        !q.gap.trim() ||
        q.source_ids.some((id) => !ids.includes(id)),
    )
  )
    errors.push("Invalid debrief source or question.");
  if (draft) {
    for (const field of ["reason", "exceptions"] as const) {
      const missing =
        field === "reason"
          ? draft.reason.basis === "unknown"
          : !draft.exceptions.length ||
            draft.exceptions.every((x) => x.basis === "unknown");
      if (missing && !questions.some((q) => q.target_field === field))
        errors.push("Missing judgment must receive a follow-up question.");
    }
  }
  return errors;
}
export function validatedExtraction(
  value: unknown,
  ids: string[],
  assetCode: string,
) {
  const errors = contentErrors(value, ids);
  if (errors.length) throw new PipelineError("INVALID_MODEL_OUTPUT");
  const c = structuredClone(value as Content);
  if (c.asset_code !== assetCode) throw new PipelineError("UNKNOWN_EVIDENCE");
  for (const field of [
    "situation",
    "signal",
    "interpretation",
    "decision",
    "reason",
    "outcome",
  ] as const) {
    if (c[field].basis === "unknown")
      c.missing_information.push("Unconfirmed " + field);
  }
  for (const field of [
    "exceptions",
    "prerequisites",
    "stop_conditions",
  ] as const) {
    if (!c[field].length || c[field].some((x) => x.basis === "unknown"))
      c.missing_information.push("Unconfirmed " + field);
  }
  c.steps.forEach((s) => {
    if (!s.rationale?.trim())
      c.missing_information.push("Unconfirmed rationale for step " + s.order);
  });
  c.missing_information = [...new Set(c.missing_information)];
  return c;
}
export function validateSegments(value: unknown, duration: number) {
  if (!Array.isArray(value) || !value.length)
    throw new PipelineError("NO_TRANSCRIPT");
  let previous = 0;
  return value.map((s) => {
    if (
      !s ||
      typeof s.text !== "string" ||
      !s.text.trim() ||
      typeof s.start !== "number" ||
      typeof s.end !== "number" ||
      !Number.isFinite(s.start) ||
      !Number.isFinite(s.end) ||
      s.start < 0 ||
      s.end < s.start ||
      s.start < previous ||
      s.end > duration + 1
    )
      throw new PipelineError("INVALID_TIMESTAMPS");
    previous = s.start;
    return {
      text: s.text.trim(),
      start_ms: Math.round(s.start * 1000),
      end_ms: Math.round(s.end * 1000),
    };
  });
}
export function retryDelay(attempt: number, random = Math.random()) {
  return Math.min(60, 2 ** attempt * 5) + Math.floor(random * 5);
}
