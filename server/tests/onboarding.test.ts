import { test } from "node:test";
import assert from "node:assert/strict";
import {
  emailAddress,
  passwordError,
  validInvitationToken,
  INVITE_ROLES,
} from "../src/validation/onboarding";
import { safeNext } from "../src/validation/content";
test("signup validates email and matching bounded passwords without accepting roles", () => {
  assert.equal(emailAddress("  Expert@Example.org "), "expert@example.org");
  for (const input of [
    null,
    "x",
    "a@b",
    "a b@example.org",
    "x".repeat(255) + "@a.org",
  ])
    assert.equal(emailAddress(input), null);
  assert.ok(passwordError("short", "short"));
  assert.ok(passwordError("long-password-one", "long-password-two"));
  assert.equal(passwordError("long-password-one", "long-password-one"), null);
  assert.ok(passwordError("x".repeat(129), "x".repeat(129)));
  assert.deepEqual(INVITE_ROLES, ["expert", "reviewer", "worker"]);
});
test("invitation tokens and authentication destinations cannot become arbitrary URLs", () => {
  assert.ok(validInvitationToken("a".repeat(64)));
  for (const v of [null, "token", "a".repeat(63), "g".repeat(64)])
    assert.equal(validInvitationToken(v), false);
  assert.equal(safeNext("/invite"), "/invite");
  assert.equal(safeNext("/settings"), "/settings");
  for (const path of [
    "//evil.org",
    "https://evil.org",
    "/\\evil.org",
    "/api/admin",
  ])
    assert.equal(safeNext(path), "/home");
});
