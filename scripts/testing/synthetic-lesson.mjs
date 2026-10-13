// Test-only adapter: the supplied short demo lesson is below the production duration gate.
// Extend it using unchanged reviewed claims, without pretending a model generated it.
export function completeSyntheticLesson(lesson, content) {
  const result = structuredClone(lesson);
  const words = text => text.trim().split(/\s+/).length;
  const claims = [content.situation, content.signal, content.interpretation, content.decision, content.reason, content.outcome, ...content.exceptions, ...content.prerequisites];
  for (const claim of claims) {
    if (words(result.explanation) >= 130) break;
    if (claim.text && words(result.explanation + " " + claim.text) <= 195) {
      result.explanation += " " + claim.text;
      result.evidence_ids = [...new Set([...result.evidence_ids, ...claim.evidence_ids])];
    }
  }
  if (words(result.explanation) < 130 || words(result.explanation) > 195) throw new Error("Synthetic lesson does not meet the production duration gate.");
  return result;
}
