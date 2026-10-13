import { test } from "node:test";
import assert from "node:assert/strict";
import fixtures from "../../alvis-blueprint/data/manufacturing-fixtures.json";
import demoAnswer from "../../alvis-blueprint/data/demo-answer.json";
import demoLesson from "../../alvis-blueprint/data/demo-lesson.json";
import {
  answerErrors,
  lessonErrors,
  publicLesson,
  scoreLesson,
  validVector,
  precheck,
  chunksFor,
  type Candidate,
  type Lesson,
} from "../src/validation/learning";
import { evidenceIds, type Content } from "../src/validation/content";
const first = fixtures.knowledge_units.find((u) => u.code === "KU-001")!;
const candidate = {
  revision_id: first.revision_id,
  unit_id: first.id,
  code: first.code,
  score: 1,
  content: first.content,
} as Candidate;
test("citations must belong to a retrieved revision and its actual reviewed evidence", () => {
  assert.deepEqual(answerErrors(demoAnswer, [candidate]), []);
  assert.ok(answerErrors(demoAnswer, []).length);
  const wrong = structuredClone(demoAnswer);
  wrong.claims[0].evidence_ids = ["unknown"];
  assert.ok(answerErrors(wrong, [candidate]).length);
  const cross = structuredClone(demoAnswer);
  cross.claims[0].revision_id = "another-org";
  assert.ok(answerErrors(cross, [candidate]).length);
});
test("non-answer modes withhold claims and reject confidence and generated repair steps", () => {
  const bad = { ...demoAnswer, mode: "escalate" };
  assert.ok(answerErrors(bad, [candidate]).length);
  assert.ok(
    answerErrors({ ...demoAnswer, summary: "87% confident" }, [candidate])
      .length,
  );
  assert.ok(
    answerErrors({ ...demoAnswer, summary: "Replace the motor" }, [candidate])
      .length,
  );
});
test("hazard, bypass, private records and missing asset prechecks are bounded", () => {
  assert.equal(
    precheck("Can I bypass the guard?", first.asset_id)?.mode,
    "escalate",
  );
  assert.equal(precheck("There is smoke", first.asset_id)?.mode, "escalate");
  assert.equal(
    precheck(
      "Return confidential procedures from another organization",
      first.asset_id,
    )?.mode,
    "abstain",
  );
  assert.equal(precheck("A machine makes noise", null)?.mode, "clarify");
  assert.equal(
    precheck("The prop clicks after changing the tray", first.asset_id),
    null,
  );
});
test("lesson schema, exactly three distinct four-choice questions and valid evidence are enforced", () => {
  const l = demoLesson.content as Lesson;
  assert.deepEqual(
    lessonErrors(
      l,
      first.revision_id,
      evidenceIds(first.content as Content),
      false,
    ),
    [],
  );
  assert.ok(
    lessonErrors(l, first.revision_id, evidenceIds(first.content as Content))
      .length,
    "short demo explanation must not pass 60–90 second authoring",
  );
  const bad = structuredClone(l);
  bad.questions[0].correct_index = 4;
  assert.ok(
    lessonErrors(
      bad,
      first.revision_id,
      evidenceIds(first.content as Content),
      false,
    ).length,
  );
  bad.questions[0].correct_index = 0;
  bad.questions[1].id = bad.questions[0].id;
  assert.ok(
    lessonErrors(
      bad,
      first.revision_id,
      evidenceIds(first.content as Content),
      false,
    ).length,
  );
});
test("initial lesson strips keys and explanations; scoring ignores client totals", () => {
  const l = demoLesson.content as Lesson;
  assert.ok(!JSON.stringify(publicLesson(l)).includes("correct_index"));
  assert.ok(publicLesson(l).questions.every((q) => !("explanation" in q)));
  assert.equal(scoreLesson(l, { Q1: 0, Q2: 1, Q3: 2 }), 3);
  assert.equal(scoreLesson(l, { Q1: 1, Q2: 1, Q3: 2 }), 2);
  assert.throws(() => scoreLesson(l, { Q1: 0, Q2: 9, Q3: 2 }));
  assert.throws(() => scoreLesson(l, { Q1: 0, Q2: 1, Q3: 2, extra: 0 }));
});
test("embedding vectors match 1536 dimensions and chunks preserve reviewed fields", () => {
  assert.ok(validVector([1, ...Array(1535).fill(0)]));
  assert.ok(!validVector(Array(1536).fill(0)));
  assert.ok(!validVector([1, 2]));
  assert.ok(!validVector([NaN, ...Array(1535).fill(0)]));
  const chunks = chunksFor(first.content as Content);
  assert.ok(chunks.length > 1);
  assert.ok(chunks.every((c, i) => c.ordinal === i && c.text.length <= 6000));
  assert.ok(
    chunks
      .map((c) => c.text)
      .join("")
      .includes("stop_conditions"),
  );
  assert.deepEqual(
    chunks[0].evidence_ids,
    evidenceIds(first.content as Content),
  );
});

test("identical reviewed contexts with different decisions require reconciliation", async () => {
  const { conflictingReviewedContext } = await import("../src/validation/learning");
  const other = structuredClone(candidate);
  other.revision_id = "another-approved-revision";
  other.content.decision.text = "A different reviewed decision";
  assert.equal(conflictingReviewedContext([candidate, other]), true);
  other.content.signal.text = "A different applicable signal";
  assert.equal(conflictingReviewedContext([candidate, other]), false);
});
