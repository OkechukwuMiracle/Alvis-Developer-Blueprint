import { test } from "node:test";
import assert from "node:assert/strict";
import { personalSignup, communitySignupRole } from "../src/validation/signup-context";
test("personal verification chooses a dashboard except for an explicit invitation signup", () => {
  assert.equal(personalSignup({ account_kind: "personal" }), true);
  assert.equal(personalSignup({ account_kind: "personal", signup_destination: "/home" }), true);
  assert.equal(personalSignup({ account_kind: "personal", signup_destination: "/invite" }), false);
  assert.equal(personalSignup({ account_kind: "organization" }), false);
  assert.equal(personalSignup({}), false);
});
test("signup preference cannot request an organization admin role", () => {
  for (const value of ["admin", "owner", "organization_reviewer", null]) assert.equal(communitySignupRole(value), "worker");
  assert.equal(communitySignupRole("expert"), "expert");
  assert.equal(communitySignupRole("reviewer"), "reviewer");
});
