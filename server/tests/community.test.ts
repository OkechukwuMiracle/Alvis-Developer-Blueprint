import { test } from "node:test";
import assert from "node:assert/strict";
import { selectWorkspace } from "../../shared/src/workspace";
import { answerErrors, precheck } from "../../shared/src/learning";
import answer from "../../alvis-blueprint/data/demo-answer.json";

test("workspace switching never falls back to another context's permissions", () => {
  const memberships = [
    { organization_id: "org", role: "worker", organizations: { scope_kind: "organization", personal_owner: null } },
    { organization_id: "mine", role: "reviewer", organizations: { scope_kind: "personal", personal_owner: "me" } },
    { organization_id: "foreign", role: "expert", organizations: { scope_kind: "personal", personal_owner: "someone-else" } },
  ];
  assert.equal(selectWorkspace(memberships, "me", "personal").member?.organization_id, "mine");
  assert.equal(selectWorkspace(memberships, "me", "org").member?.role, "worker");
  assert.equal(selectWorkspace(memberships, "me", "foreign").member, undefined);
  assert.equal(selectWorkspace(memberships, "me", "missing").member, undefined);
  assert.equal(selectWorkspace(memberships, "me").organizations.length, 1);
  assert.equal(selectWorkspace([], "me", "personal").member, undefined);
});

test("public answer validation cannot accept citations absent from its approved public candidates", () => {
  assert.ok(answerErrors(answer, []).some(error => /citation|revision|retriev/i.test(error)));
  assert.equal(precheck("bypass the guard on a running conveyor", "conveyor")?.mode, "escalate");
  assert.equal(precheck("what should I notice?", null)?.mode, "clarify");
});
