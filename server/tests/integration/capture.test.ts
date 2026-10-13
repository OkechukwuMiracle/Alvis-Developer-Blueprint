import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
test(
  "PostgreSQL capture lifecycle and authorization",
  { skip: !process.env.ALVIS_TEST_DB_CONTAINER },
  () => {
    const fixtures = readFileSync(
      "tests/integration/authorization.sql",
      "utf8",
    );
    let sql =
      fixtures.slice(0, fixtures.indexOf("set local role authenticated;")) +
      readFileSync("tests/integration/index-harness.sql", "utf8") +
      readFileSync("tests/integration/capture.sql", "utf8");
    sql = sql
      .split("\n")
      .map((line) =>
        line.startsWith("select alvis_transition") && line.includes("'approve'")
          ? line + "\nselect pg_temp.flush_indexes();"
          : line,
      )
      .join("\n");
    const result = spawnSync(
      "docker",
      [
        "exec",
        "-i",
        process.env.ALVIS_TEST_DB_CONTAINER!,
        "psql",
        "-U",
        "postgres",
        "-d",
        process.env.ALVIS_TEST_DB_NAME || "alvis_week2_test",
        "-v",
        "ON_ERROR_STOP=1",
      ],
      { input: sql, encoding: "utf8" },
    );
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.match(result.stdout, /PASS: capture ownership/);
  },
);
