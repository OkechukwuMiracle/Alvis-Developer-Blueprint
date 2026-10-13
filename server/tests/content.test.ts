import { test } from "node:test";
import assert from "node:assert/strict";
import fixtures from "../../alvis-blueprint/data/manufacturing-fixtures.json";
import { contentErrors, safeNext, Content } from "../src/validation/content";
const ids = fixtures.sources.map((s) => s.id);
test("all approved synthetic fixtures have complete linked evidence", () => {
  for (const u of fixtures.knowledge_units.filter(
    (x) => x.status === "approved",
  ))
    assert.deepEqual(contentErrors(u.content, ids, true), [], u.code);
});
test("unknown and foreign evidence are rejected", () => {
  const c = structuredClone(fixtures.knowledge_units[0].content) as Content;
  c.signal.evidence_ids = ["foreign-source"];
  assert.match(contentErrors(c, ids, true).join(" "), /Evidence/);
  c.signal = { text: "Invented", evidence_ids: [], basis: "unknown" };
  assert.match(contentErrors(c, ids, true).join(" "), /Unknown claims/);
});
test("missing prerequisites, gaps, contradictions and unsupported steps block submission", () => {
  for (const modify of [
    (c: Content) => {
      c.prerequisites = [];
    },
    (c: Content) => {
      c.missing_information = ["Reason absent"];
    },
    (c: Content) => {
      c.contradictions = ["Unresolved"];
    },
    (c: Content) => {
      c.steps[0].evidence_ids = [];
    },
  ]) {
    const c = structuredClone(fixtures.knowledge_units[0].content) as Content;
    modify(c);
    assert.ok(contentErrors(c, ids, true).length);
  }
});
test("schema rejects role/status metadata, malformed steps and extra claims", () => {
  assert.ok(
    contentErrors(
      { ...fixtures.knowledge_units[0].content, status: "approved" },
      ids,
    ).length,
  );
  const c = structuredClone(fixtures.knowledge_units[0].content);
  c.steps[0].order = 9;
  assert.ok(contentErrors(c, ids).length);
});
test("login redirects stay on allowed internal paths", () => {
  for (const path of [
    "https://evil.test",
    "//evil.test",
    "/\\evil.test",
    "/login",
    "/home/\\evil.test",
  ])
    assert.equal(safeNext(path), "/home");
  assert.equal(safeNext("/review/abc"), "/review/abc");
  assert.equal(safeNext("/knowledge?q=signal"), "/knowledge?q=signal");
});
