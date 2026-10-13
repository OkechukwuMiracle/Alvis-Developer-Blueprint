import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
test(
  "withdrawal denies unrelated users and workers, retires dependent knowledge and invalidates guides",
  { skip: !process.env.ALVIS_TEST_DB_CONTAINER },
  () => {
    const fixture = readFileSync(
      "tests/integration/authorization.sql",
      "utf8",
    ).split("set local role authenticated;")[0];
    const helper = readFileSync("tests/integration/index-harness.sql", "utf8");
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
        process.env.ALVIS_TEST_DB_NAME || "alvis_week3_verified",
        "-v",
        "ON_ERROR_STOP=1",
      ],
      {
        input:
          fixture +
          helper +
          readFileSync("tests/integration/withdrawal.sql", "utf8"),
        encoding: "utf8",
      },
    );
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.match(result.stdout, /PASS: withdrawal/);
  },
);
