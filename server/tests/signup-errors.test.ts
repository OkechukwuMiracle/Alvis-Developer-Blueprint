import { test } from "node:test";
import assert from "node:assert/strict";
import { signupErrorReason, signupErrorMessages } from "../../shared/src/signup-errors";

test("signup distinguishes provider rate limits, delivery restrictions and validation without exposing raw errors", () => {
  assert.equal(signupErrorReason({ status: 429 }), "rate_limit");
  assert.equal(signupErrorReason({ code: "over_email_send_rate_limit", status: 429 }), "email_rate_limit");
  assert.equal(signupErrorReason({ code: "email_address_not_authorized" }), "email_delivery");
  assert.equal(signupErrorReason({ code: "signup_disabled" }), "signup_disabled");
  assert.equal(signupErrorReason({ code: "weak_password" }), "password_policy");
  assert.equal(signupErrorReason({ code: "email_address_invalid" }), "validation");
  assert.equal(signupErrorReason({ code: "private-provider-detail" }), "unavailable");
  assert.equal(signupErrorReason(null), "unavailable");
  for (const reason of ["rate_limit", "email_rate_limit", "email_delivery", "password_policy"])
    assert.ok(signupErrorMessages[reason]);
});
