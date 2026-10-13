import { test } from "node:test";
import assert from "node:assert/strict";
import { invitationError } from "../src/validation/invitation-errors";

test("invitation errors separate identity, duplicates, invalid links and infrastructure failures", () => {
  assert.equal(invitationError({ code: "P0001", message: "Verified email required" }).status, 403);
  assert.equal(invitationError({ code: "P0001", message: "Name required" }).status, 400);
  assert.match(invitationError({ code: "23505" }).message, /Resend/);
  assert.equal(invitationError({ code: "P0001", message: "Invitation unavailable" }).status, 409);
  for (const code of ["PGRST202", "42501", "42702", "unknown"])
    assert.equal(invitationError({ code, message: "private detail" }).status, 503);
  assert.doesNotMatch(invitationError({ code: "unknown", message: "private detail" }).message, /private detail/);
});
