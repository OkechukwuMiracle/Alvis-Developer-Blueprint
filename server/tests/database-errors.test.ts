import { test } from "node:test";
import assert from "node:assert/strict";
import { checkDatabaseError, DatabaseSetupError } from "../src/database/errors";

test("missing database objects produce a safe actionable setup error", () => {
  for (const code of ["PGRST205", "PGRST204", "42P01", "42703", "42883", "PGRST202"])
    assert.throws(() => checkDatabaseError({ code }), DatabaseSetupError);
  assert.doesNotThrow(() => checkDatabaseError(null));
  assert.doesNotThrow(() => checkDatabaseError({ code: "42501" }));
});
