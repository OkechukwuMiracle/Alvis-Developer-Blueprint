import Ajv from "ajv/dist/2020";
import schema from "../../alvis-blueprint/schemas/knowledge-unit.schema.json";
export type Claim = {
  text: string | null;
  evidence_ids: string[];
  basis: "explicit" | "inferred" | "unknown";
};
export type Content = {
  title: string;
  asset_code: string;
  task: string;
  situation: Claim;
  signal: Claim;
  interpretation: Claim;
  decision: Claim;
  reason: Claim;
  exceptions: Claim[];
  outcome: Claim;
  prerequisites: Claim[];
  stop_conditions: Claim[];
  steps: {
    order: number;
    instruction: string;
    rationale: string | null;
    evidence_ids: string[];
    requires_authorized_person: boolean;
  }[];
  skill_tags: string[];
  missing_information: string[];
  contradictions: string[];
};
export function evidenceIds(c: Content) {
  return [
    ...new Set(
      [
        c.situation,
        c.signal,
        c.interpretation,
        c.decision,
        c.reason,
        c.outcome,
        ...c.exceptions,
        ...c.prerequisites,
        ...c.stop_conditions,
        ...c.steps,
      ].flatMap((x) => x.evidence_ids),
    ),
  ];
}
const validate = new Ajv({ allErrors: true }).compile(schema);
export function contentErrors(
  value: unknown,
  sourceIds: string[],
  publish = false,
): string[] {
  if (!validate(value))
    return ["Content does not match the Knowledge Unit schema."];
  const c = value as Content;
  const claims = [
    c.situation,
    c.signal,
    c.interpretation,
    c.decision,
    c.reason,
    c.outcome,
    ...c.exceptions,
    ...c.prerequisites,
    ...c.stop_conditions,
  ];
  const errors: string[] = [];
  for (const claim of claims) {
    if (
      claim.basis === "unknown" &&
      (claim.text !== null || claim.evidence_ids.length)
    )
      errors.push("Unknown claims must have null text and no evidence.");
    if (
      claim.basis !== "unknown" &&
      (!claim.text?.trim() || !claim.evidence_ids.length)
    )
      errors.push("Known claims require text and evidence.");
  }
  for (const entry of [...claims, ...c.steps])
    if (entry.evidence_ids.some((id) => !sourceIds.includes(id)))
      errors.push("Evidence must be linked to this revision.");
  if (
    c.steps.some(
      (s, i) =>
        s.order !== i + 1 ||
        !s.instruction.trim() ||
        (publish && !s.rationale?.trim()) ||
        !s.evidence_ids.length,
    )
  )
    errors.push("Ordered instructions require rationale and evidence.");
  if (
    publish &&
    (!c.title.trim() ||
      !c.task.trim() ||
      [c.situation, c.signal, c.decision, c.reason].some(
        (x) => !x.text?.trim(),
      ) ||
      !c.exceptions.length ||
      !c.prerequisites.length ||
      !c.stop_conditions.length ||
      [...c.exceptions, ...c.prerequisites, ...c.stop_conditions].some(
        (x) => !x.text?.trim(),
      ) ||
      !c.steps.length ||
      c.missing_information.length ||
      c.contradictions.length)
  )
    errors.push(
      "Resolve gaps and supply applicability, prerequisites, stop conditions, and supported steps before submission.",
    );
  return [...new Set(errors)];
}
export function safeNext(value: string) {
  return /^\/(home|knowledge|review|drafts|sources|captures|ask|practice|guides|learn|learning|onboarding|settings|invite|community)(\/[^?#\\]*)?(\?[^\\]*)?$/.test(
    value,
  )
    ? value
    : "/home";
}
