import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
const accountFile = process.env.ALVIS_E2E_ACCOUNTS_FILE;
const recording = process.env.ALVIS_LIVE_RECORDING;
const answerFile = process.env.ALVIS_LIVE_DEBRIEF_FILE;
test("real recording to timestamped transcript, debrief and review submission", async ({
  page,
}) => {
  test.skip(
    !accountFile ||
      !recording ||
      !answerFile ||
      !process.env.OPENAI_API_KEY ||
      !process.env.SUPABASE_S3_ACCESS_KEY_ID,
    "Requires real recording, expert-authored answers, external accounts and configured live infrastructure.",
  );
  test.setTimeout(600000);
  const accounts = JSON.parse(readFileSync(accountFile!, "utf8"));
  const answers = JSON.parse(readFileSync(answerFile!, "utf8")) as Record<
    string,
    string
  >;
  await page.goto("/login");
  await page.getByLabel("Email address").fill(accounts.expert.email);
  await page
    .getByLabel("Password", { exact: true })
    .fill(accounts.expert.password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/home$/);
  await page.goto("/captures/new");
  await page
    .getByLabel("Capture title")
    .fill("Live supervised training recording");
  const option = await page
    .getByLabel("Training asset")
    .locator("option")
    .filter({ hasText: "CV-07" })
    .first()
    .getAttribute("value");
  if (!option) throw new Error("CV-07 training asset is required.");
  await page.getByLabel("Training asset").selectOption(option);
  await page
    .getByLabel("Describe the task")
    .fill(
      "Record an actual supervised CV-07 training simulation and capture its judgment.",
    );
  await page
    .getByLabel("Upload video", { exact: false })
    .setInputFiles(recording!);
  await page.getByRole("checkbox").check();
  const started = Date.now();
  await page
    .getByRole("button", { name: "Upload and process", exact: true })
    .click();
  await expect(page).toHaveURL(/\/captures\/[0-9a-f-]+$/, { timeout: 60000 });
  const id = new URL(page.url()).pathname.split("/").pop()!;
  await expect
    .poll(
      async () => {
        const r = await page.request.get("/api/captures/" + id);
        const d = await r.json();
        if (d.capture?.state === "failed")
          throw new Error("Live worker stage failed.");
        return d.capture?.state;
      },
      { timeout: 300000, intervals: [2000, 5000] },
    )
    .toBe("debrief");
  console.log(
    JSON.stringify({ capture_id: id, first_draft_ms: Date.now() - started }),
  );
  await page.goto("/captures/" + id + "/debrief");
  for (let i = 0; i < 5; i++) {
    const snapshot = await (
      await page.request.get("/api/captures/" + id)
    ).json();
    const q = snapshot.questions.find(
      (x: { answer_source_id: string | null }) => !x.answer_source_id,
    );
    if (!q) break;
    if (!answers[q.target_field])
      throw new Error(
        "Expert-authored answer is missing for " +
          q.target_field +
          ". Supply confirmed evidence; do not invent it.",
      );
    await page.getByLabel("Your answer").fill(answers[q.target_field]);
    await page
      .getByRole("button", { name: "Save and next", exact: true })
      .click();
    await expect
      .poll(
        async () => {
          const d = await (
            await page.request.get("/api/captures/" + id)
          ).json();
          return d.questions.find((x: { id: string }) => x.id === q.id)
            .answer_source_id;
        },
        { timeout: 30000 },
      )
      .toBeTruthy();
  }
  await expect(
    page.getByRole("button", {
      name: "Generate proposal from current sources",
    }),
  ).toBeEnabled({ timeout: 300000 });
  if (
    !(await page
      .getByRole("button", { name: "Accept proposed changes" })
      .count())
  )
    await page
      .getByRole("button", { name: "Generate proposal from current sources" })
      .click();
  await expect(
    page.getByRole("button", { name: "Accept proposed changes" }),
  ).toBeVisible({ timeout: 300000 });
  await page.getByRole("button", { name: "Accept proposed changes" }).click();
  await expect(
    page.getByRole("button", { name: "Accept proposed changes" }),
  ).toHaveCount(0);
  await page
    .getByRole("link", { name: "Open structured draft editor" })
    .click();
  await page
    .getByRole("button", { name: "Submit for review", exact: true })
    .click();
  await expect(
    page.getByText("Saved. This page shows the persisted revision."),
  ).toBeVisible();
  console.log(
    JSON.stringify({
      capture_id: id,
      total_to_submission_ms: Date.now() - started,
    }),
  );
});
