import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
test(
  "live PostgreSQL workflow and authorization integration",
  { skip: !process.env.ALVIS_TEST_DB_CONTAINER },
  () => {
    let sql = readFileSync("tests/integration/authorization.sql", "utf8");
    sql = sql.replace(
      "set local role authenticated;",
      ()=>readFileSync("tests/integration/index-harness.sql", "utf8") +
        "set local role authenticated;",
    );
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
        process.env.ALVIS_TEST_DB_NAME || "alvis_test",
        "-v",
        "ON_ERROR_STOP=1",
      ],
      { input: sql, encoding: "utf8" },
    );
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.match(result.stdout, /PASS: workflow/);
  },
);
