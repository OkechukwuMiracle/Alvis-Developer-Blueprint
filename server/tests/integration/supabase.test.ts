import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import fixtures from "../../../alvis-blueprint/data/manufacturing-fixtures.json";
test(
  "real Supabase sign-in and direct REST authorization",
  {
    skip:
      !process.env.ALVIS_E2E_ACCOUNTS_FILE ||
      !process.env.SUPABASE_URL ||
      !process.env.SUPABASE_PUBLISHABLE_KEY,
  },
  async () => {
    const accounts = JSON.parse(
      readFileSync(process.env.ALVIS_E2E_ACCOUNTS_FILE!, "utf8"),
    ) as Record<string, { email: string; password: string }>;
    const worker = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_PUBLISHABLE_KEY!,
      { auth: { persistSession: false } },
    );
    const expert = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_PUBLISHABLE_KEY!,
      { auth: { persistSession: false } },
    );
    try {
      assert.equal(
        (await worker.auth.signInWithPassword(accounts.worker)).error,
        null,
        "worker signs in through real Auth",
      );
      assert.equal(
        (await expert.auth.signInWithPassword(accounts.expert)).error,
        null,
        "expert signs in through real Auth",
      );
      const drafts = await worker
        .from("knowledge_revisions")
        .select("id")
        .in("status", ["draft", "pending", "rejected", "retired"]);
      assert.equal(drafts.error, null);
      assert.deepEqual(drafts.data, []);
      const invalidSource = fixtures.knowledge_units.find(
        (u) => u.code === "KU-009",
      )!.content.signal.evidence_ids[0];
      const source = await worker
        .from("sources")
        .select("id")
        .eq("id", invalidSource);
      assert.equal(source.error, null);
      assert.deepEqual(source.data, []);
      const directWrite = await worker
        .from("knowledge_revisions")
        .update({ status: "approved" })
        .eq("id", fixtures.knowledge_units[0].revision_id);
      assert.ok(directWrite.error, "worker direct writes denied");
      const workerReview = await worker.rpc("alvis_transition", {
        revision: fixtures.knowledge_units[0].revision_id,
        operation: "approve",
        payload: null,
        expected_hash: "invalid",
        comment: "Attempted worker publication",
        request_key: "live-worker-denial",
      });
      assert.ok(workerReview.error);
      assert.match(workerReview.error.message, /designated reviewer/);
      const expertReview = await expert.rpc("alvis_transition", {
        revision: fixtures.knowledge_units[0].revision_id,
        operation: "approve",
        payload: null,
        expected_hash: "invalid",
        comment: "Attempted expert publication",
        request_key: "live-expert-denial",
      });
      assert.ok(expertReview.error);
      assert.match(expertReview.error.message, /designated reviewer/);
    } finally {
      await worker.auth.signOut();
      await expert.auth.signOut();
    }
  },
);
