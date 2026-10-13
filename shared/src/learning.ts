import Ajv from "ajv/dist/2020";
import answerSchema from "../../alvis-blueprint/schemas/answer.schema.json";
import lessonSchema from "../../alvis-blueprint/schemas/lesson.schema.json";
import type { Content } from "./content";
import { evidenceIds } from "./content";
export type Candidate = {
  revision_id: string;
  unit_id: string;
  code: string;
  content: Content;
  score: number;
};
export type Answer = {
  mode: "answer" | "clarify" | "abstain" | "escalate";
  summary: string;
  claims: { text: string; revision_id: string; evidence_ids: string[] }[];
  clarifying_question: string | null;
  escalation_reason: string | null;
};
export type Lesson = {
  title: string;
  revision_id: string;
  explanation: string;
  evidence_ids: string[];
  questions: {
    id: string;
    prompt: string;
    options: string[];
    correct_index: number;
    explanation: string;
    evidence_ids: string[];
  }[];
};
const ajv = new Ajv({ allErrors: true });
const answerCheck = ajv.compile(answerSchema),
  lessonCheck = ajv.compile(lessonSchema);
export const DIMENSIONS = 1536;
export function conflictingReviewedContext(candidates: Candidate[]) {
  const normalized = (value: string | null) =>
    value?.trim().toLowerCase().replace(/\s+/g, " ") ?? "";
  return candidates.some((a, i) =>
    candidates
      .slice(i + 1)
      .some(
        (b) =>
          a.revision_id !== b.revision_id &&
          normalized(a.content.situation.text) !== "" &&
          normalized(a.content.signal.text) !== "" &&
          normalized(a.content.task) === normalized(b.content.task) &&
          normalized(a.content.situation.text) ===
            normalized(b.content.situation.text) &&
          normalized(a.content.signal.text) ===
            normalized(b.content.signal.text) &&
          normalized(a.content.decision.text) !==
            normalized(b.content.decision.text),
      ),
  );
}
export function validVector(v: unknown): v is number[] {
  return (
    Array.isArray(v) &&
    v.length === DIMENSIONS &&
    v.every((x) => typeof x === "number" && Number.isFinite(x)) &&
    v.some((x) => x !== 0)
  );
}
export function precheck(query: string, asset: string | null): Answer | null {
  const base = {
    claims: [],
    clarifying_question: null,
    escalation_reason: null,
  };
  if (
    /\b(smoke|fire|sparks?|burning|energized|electrocution|shock|injury|bleeding|overheating)\b|(bypass|defeat|override|disable|remove).*(guard|interlock)|guard.*bypass|running.*(motor|machine|conveyor)|powered.*repair|live.*(repair|equipment)/i.test(
      query,
    )
  )
    return {
      ...base,
      mode: "escalate",
      summary:
        "Stop training and contact the site's designated supervisor. Do not apply repair steps from this training application.",
      escalation_reason:
        "An active hazard or unsafe equipment-control request needs authorized supervision.",
    };
  if (
    /(show|return|ignore|reveal).*(draft|approval rules|confidential|another organization)|retired.*instructions/i.test(
      query,
    )
  )
    return {
      ...base,
      mode: "abstain",
      summary:
        "Only current reviewed knowledge from your organization is available. Request expert review for unsupported material.",
    };
  if (!asset)
    return {
      ...base,
      mode: "clarify",
      summary:
        "Select the training asset so Alvis can find applicable reviewed knowledge.",
      clarifying_question: "Which training asset are you asking about?",
    };
  return null;
}
export function answerErrors(
  value: unknown,
  candidates: Candidate[],
): string[] {
  if (!answerCheck(value)) return ["Answer schema is invalid."];
  const a = value as Answer;
  const errors: string[] = [];
  if (
    !a.summary.trim() ||
    /\b\d+(\.\d+)?\s*%|certif|professionally competent/i.test(JSON.stringify(a))
  )
    errors.push("Unsupported confidence or competence claim.");
  if (a.mode !== "answer" && a.claims.length)
    errors.push("Non-answer modes cannot contain instructions or claims.");
  if (a.mode === "answer" && !a.claims.length)
    errors.push("An answer requires cited claims.");
  if (a.mode === "clarify" && !a.clarifying_question?.trim())
    errors.push("Clarification requires a question.");
  if (a.mode === "escalate" && !a.escalation_reason?.trim())
    errors.push("Escalation requires a reason.");
  for (const claim of a.claims) {
    const r = candidates.find((c) => c.revision_id === claim.revision_id);
    if (
      !claim.text.trim() ||
      !r ||
      !claim.evidence_ids.length ||
      claim.evidence_ids.some((id) => !evidenceIds(r.content).includes(id))
    )
      errors.push("Citation is outside retrieved approved evidence.");
  }
  if (
    a.mode === "answer" &&
    /\b(replace|tighten|loosen|rewire|energize|disconnect)\b/i.test(
      a.summary + " " + a.claims.map((x) => x.text).join(" "),
    )
  )
    errors.push(
      "Generated procedural instructions are withheld; use stored reviewed guide steps.",
    );
  return errors;
}
export function lessonErrors(
  value: unknown,
  revisionId: string,
  ids: string[],
  enforceDuration = true,
): string[] {
  if (!lessonCheck(value)) return ["Lesson schema is invalid."];
  const l = value as Lesson;
  const errors: string[] = [];
  if (
    l.revision_id !== revisionId ||
    !l.evidence_ids.length ||
    l.evidence_ids.some((id) => !ids.includes(id))
  )
    errors.push("Lesson evidence is invalid.");
  const words = l.explanation.trim().split(/\s+/).length;
  if (enforceDuration && (words < 130 || words > 195))
    errors.push("Use 130–195 words (60–90 seconds at 130 words per minute).");
  if (
    l.questions.length !== 3 ||
    new Set(l.questions.map((q) => q.id)).size !== 3
  )
    errors.push("Exactly three distinct questions required.");
  for (const q of l.questions)
    if (
      !q.id.trim() ||
      !q.prompt.trim() ||
      q.options.length !== 4 ||
      new Set(q.options).size !== 4 ||
      q.options.some((x) => !x.trim()) ||
      q.correct_index < 0 ||
      q.correct_index > 3 ||
      !q.explanation.trim() ||
      !q.evidence_ids.length ||
      q.evidence_ids.some((id) => !ids.includes(id))
    )
      errors.push("Invalid question, answer or evidence.");
  if (
    /\b\d+(\.\d+)?\s*%|certification|professional competence/i.test(
      l.explanation,
    )
  )
    errors.push("Unsupported competence or confidence claim.");
  return errors;
}
export function publicLesson(l: Lesson) {
  return {
    ...l,
    questions: l.questions.map(({ id, prompt, options, evidence_ids }) => ({
      id,
      prompt,
      options,
      evidence_ids,
    })),
  };
}
export function scoreLesson(l: Lesson, responses: Record<string, number>) {
  if (
    Object.keys(responses).length !== 3 ||
    l.questions.some(
      (q) =>
        !Number.isInteger(responses[q.id]) ||
        responses[q.id] < 0 ||
        responses[q.id] > 3,
    )
  )
    throw new Error("Three valid answers required.");
  return l.questions.filter((q) => responses[q.id] === q.correct_index).length;
}
export function chunksFor(content: Content) {
  const ids = evidenceIds(content);
  const paragraphs = [
    content.title +
      "\nAsset: " +
      content.asset_code +
      "\nTask: " +
      content.task,
    ...[
      "situation",
      "signal",
      "interpretation",
      "decision",
      "reason",
      "exceptions",
      "prerequisites",
      "stop_conditions",
      "outcome",
      "steps",
    ].map((k) => k + ": " + JSON.stringify(content[k as keyof Content])),
  ];
  const chunks: { ordinal: number; text: string; evidence_ids: string[] }[] =
    [];
  let text = "";
  for (const p of paragraphs) {
    if (p.length > 6000)
      throw new Error("Reviewed paragraph exceeds chunk limit.");
    if (text.length + p.length > 1800 && text) {
      chunks.push({ ordinal: chunks.length, text, evidence_ids: ids });
      text = "";
    }
    text += p + "\n";
  }
  if (text) chunks.push({ ordinal: chunks.length, text, evidence_ids: ids });
  return chunks;
}
