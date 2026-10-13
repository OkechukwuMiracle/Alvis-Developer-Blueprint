import { test } from "node:test";
import assert from "node:assert/strict";
import { verificationError } from "../src/validation/verification-error";
test("verification distinguishes missing browser proof, expired tokens and unavailable verification", () => {
  assert.match(verificationError("bad_code_verifier"), /same browser and hostname/);
  assert.match(verificationError("flow_state_not_found"), /could not be matched/);
  assert.match(verificationError("otp_expired"), /expired or was already consumed/);
  assert.doesNotMatch(verificationError("unexpected_failure"), /has expired/);
  assert.doesNotMatch(verificationError("private-provider-detail"), /private-provider-detail/);
});
