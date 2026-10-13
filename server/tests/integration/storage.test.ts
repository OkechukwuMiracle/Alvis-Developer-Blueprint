import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
test(
  "private recording Storage RLS",
  { skip: !process.env.ALVIS_TEST_DB_CONTAINER },
  () => {
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
      {
        input: readFileSync("tests/integration/storage.sql", "utf8"),
        encoding: "utf8",
      },
    );
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.match(result.stdout, /PASS: restrictive Storage/);
  },
);
