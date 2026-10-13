import { test } from "node:test";
import assert from "node:assert/strict";
import fixtures from "../../alvis-blueprint/data/manufacturing-fixtures.json";
import {
  uploadErrors,
  validatedExtraction,
  debriefErrors,
  validateSegments,
  retryDelay,
} from "../src/validation/capture-contract";
import { validateProbe } from "../scripts/media";
import { contentErrors, type Content } from "../src/validation/content";
const original = fixtures.knowledge_units.find((u) => u.status === "approved")!
  .content as Content;
const ids = fixtures.sources.map((s) => s.id);
test("invalid uploads are rejected at exact size/type boundaries", () => {
  assert.deepEqual(uploadErrors("video/mp4", 104857600), []);
  for (const [mime, size] of [
    ["video/mp4", 104857601],
    ["video/quicktime", 10],
    ["video/webm", -1],
    ["audio/webm", 10],
  ] as const)
    assert.ok(uploadErrors(mime, size).length);
  assert.deepEqual(uploadErrors("audio/webm", 10485760, true), []);
  assert.ok(uploadErrors("audio/webm", 10485761, true).length);
});
test("decoded format, codecs, duration and audio track must be supported", () => {
  const probe = {
    format: { duration: "45.0", format_name: "mov,mp4,m4a,3gp,3g2,mj2" },
    streams: [
      { codec_type: "video", codec_name: "h264" },
      { codec_type: "audio", codec_name: "aac" },
    ],
  };
  assert.equal(validateProbe(probe, "video/mp4"), 45);
  for (const duration of ["181", "NaN", "0", "Infinity"])
    assert.throws(() =>
      validateProbe(
        { ...probe, format: { ...probe.format, duration } },
        "video/mp4",
      ),
    );
  assert.throws(() =>
    validateProbe(
      { ...probe, streams: [{ codec_type: "video", codec_name: "h264" }] },
      "video/mp4",
    ),
  );
  assert.throws(() => validateProbe(probe, "video/webm"));
  assert.throws(() =>
    validateProbe(
      {
        ...probe,
        streams: [
          { codec_type: "video", codec_name: "unknown" },
          { codec_type: "audio", codec_name: "aac" },
        ],
      },
      "video/mp4",
    ),
  );
});
test("malformed model output, extra authority and unknown evidence cannot become drafts", () => {
  assert.throws(() => validatedExtraction(null, ids, "CV-07"));
  assert.throws(() =>
    validatedExtraction(
      { ...original, status: "approved" },
      ids,
      original.asset_code,
    ),
  );
  assert.throws(() =>
    validatedExtraction(
      {
        ...original,
        signal: { ...original.signal, evidence_ids: ["foreign"] },
      },
      ids,
      original.asset_code,
    ),
  );
  assert.throws(() => validatedExtraction(original, ids, "other-asset"));
});
test("unknown judgment remains null, with visible gaps; nullable draft rationale blocks submission", () => {
  const draft = structuredClone(original);
  draft.reason = { text: null, basis: "unknown", evidence_ids: [] };
  draft.exceptions = [];
  draft.prerequisites = [];
  draft.outcome = { text: null, basis: "unknown", evidence_ids: [] };
  draft.steps[0].rationale = null;
  const result = validatedExtraction(draft, ids, draft.asset_code);
  assert.equal(result.reason.text, null);
  assert.equal(result.outcome.text, null);
  for (const field of ["reason", "exceptions", "prerequisites", "outcome"])
    assert.ok(result.missing_information.some((g) => g.includes(field)));
  assert.deepEqual(contentErrors(result, ids), []);
  assert.ok(contentErrors(result, ids, true).length);
});
test("debrief is schema checked, source checked and bounded; missing reason and exception get questions", () => {
  const draft = structuredClone(original);
  draft.reason = { text: null, basis: "unknown", evidence_ids: [] };
  draft.exceptions = [];
  const q = {
    id: "reason",
    target_field: "reason",
    question: "What led you to choose that check?",
    gap: "Missing reason",
    source_ids: [ids[0]],
  };
  const e = {
    ...q,
    id: "exception",
    target_field: "exceptions",
    question: "When would this case not apply?",
    gap: "Missing exception",
  };
  assert.deepEqual(debriefErrors({ questions: [q, e] }, ids, draft), []);
  assert.ok(debriefErrors({ questions: [q] }, ids, draft).length);
  assert.ok(
    debriefErrors({ questions: [{ ...q, source_ids: ["unknown"] }] }, ids)
      .length,
  );
  assert.ok(
    debriefErrors(
      {
        questions: Array.from({ length: 6 }, (_, i) => ({
          ...q,
          id: String(i),
        })),
      },
      ids,
    ).length,
  );
  assert.ok(debriefErrors({ questions: [q, q] }, ids).length);
});
test("timestamps come from real segments, preserve milliseconds and reject missing or impossible alignment", () => {
  assert.deepEqual(
    validateSegments([{ start: 0.25, end: 1.25, text: "Observed" }], 45),
    [{ start_ms: 250, end_ms: 1250, text: "Observed" }],
  );
  for (const input of [
    [],
    [{ text: "Text" }],
    [{ start: 4, end: 3, text: "Text" }],
    [{ start: 0, end: 99, text: "Text" }],
    [{ start: NaN, end: 1, text: "Text" }],
  ])
    assert.throws(() => validateSegments(input, 45));
});
test("retry delay is capped, exponential and jittered", () => {
  assert.equal(retryDelay(1, 0), 10);
  assert.equal(retryDelay(2, 0), 20);
  assert.equal(retryDelay(3, 0.9), 44);
  assert.equal(retryDelay(9, 0), 60);
});
