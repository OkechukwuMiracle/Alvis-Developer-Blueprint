import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
test(
  "PostgreSQL approved retrieval, guide retirement, hidden keys and server scoring",
  { skip: !process.env.ALVIS_TEST_DB_CONTAINER },
  () => {
    const fixtures = readFileSync(
      "tests/integration/authorization.sql",
      "utf8",
    );
    const sql =
      fixtures.slice(0, fixtures.indexOf("set local role authenticated;")) +
      readFileSync("tests/integration/index-harness.sql", "utf8") +
      readFileSync("tests/integration/learning.sql", "utf8");
    const r = spawnSync(
      "docker",
      [
        "exec",
        "-i",
        process.env.ALVIS_TEST_DB_CONTAINER!,
        "psql",
        "-U",
        "postgres",
        "-d",
        process.env.ALVIS_TEST_DB_NAME || "alvis_week3_test",
        "-v",
        "ON_ERROR_STOP=1",
      ],
      { input: sql, encoding: "utf8" },
    );
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.match(r.stdout, /PASS: approved retrieval/);
  },
);
