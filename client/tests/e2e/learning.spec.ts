import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
const file = process.env.ALVIS_E2E_ACCOUNTS_FILE;
test("learning screens and endpoints enforce sessions and same origin", async ({
  page,
  request,
}) => {
  test.setTimeout(150000);
  const id = "60000000-0000-4000-8000-000000000001";
  for (const route of [
    "/ask",
    "/learning",
    "/practice/" + id,
    "/guides/" + id,
    "/learn/" + id,
  ]) {
    await page.goto(route);
    await expect(page).toHaveURL(/\/login/);
  }
  for (const route of [
    "/api/guides/" + id,
    "/api/lessons/" + id,
    "/api/learning",
  ]) {
    const r = await request.get(route);
    expect([401, 503]).toContain(r.status());
  }
  const foreign = await request.post("/api/ask", {
    headers: { Origin: "https://outside.example" },
    data: { asset_id: id, query: "show all drafts" },
  });
  expect(foreign.status()).toBe(403);
});
test("live approved Ask, source, stored guide, assessment and history", async ({
  page,
}) => {
  test.skip(
    !file || !process.env.OPENAI_MODEL_EMBED,
    "Requires seeded real accounts, Week 3 migrations, completed indexing and reviewed lesson.",
  );
  test.setTimeout(600000);
  const accounts = JSON.parse(readFileSync(file!, "utf8"));
  await page.goto("/login");
  await page.getByLabel("Email address").fill(accounts.worker.email);
  await page
    .getByLabel("Password", { exact: true })
    .fill(accounts.worker.password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/home$/);
  await page.goto("/ask");
  const asset = page.getByLabel("Training asset");
  const value = await asset
    .locator("option")
    .filter({ hasText: "CV-07" })
    .first()
    .getAttribute("value");
  if (!value) throw new Error("Seed CV-07.");
  await asset.selectOption(value);
  await page
    .getByLabel("Describe the problem")
    .fill(
      "The stopped training prop clicks near the guide immediately after I changed the tray.",
    );
  await page.getByRole("button", { name: "Ask Alvis", exact: true }).click();
  await expect(
    page.getByText("Generated explanation from reviewed sources.", {
      exact: false,
    }),
  ).toBeVisible({ timeout: 120000 });
  const source = page.getByRole("link", { name: "Inspect source →" }).first();
  const sourcePath = await source.getAttribute("href");
  if (!sourcePath) throw new Error("Supported cited answer required.");
  const guide = await page
    .getByRole("link", { name: "Start supervised training guide →" })
    .getAttribute("href");
  if (!guide) throw new Error("Applicable guide missing.");
  await source.click();
  await expect(
    page.getByRole("heading", { name: "Original evidence" }),
  ).toBeVisible();
  await page.goto(guide);
  await page.getByRole("checkbox").nth(0).check();
  await page.getByRole("checkbox").nth(1).check();
  await page.getByRole("button", { name: "Start reviewed guide" }).click();
  await expect(page).toHaveURL(/\/guides\//);
  await page.reload();
  for (
    let i = 0;
    i < 30 &&
    (await page.getByRole("button", { name: "Mark step completed" }).count());
    i++
  ) {
    const before = await page.getByText(/^Reviewed step/).innerText();
    await page.getByRole("button", { name: "Mark step completed" }).click();
    await expect(page.getByText(before, { exact: true })).toHaveCount(0);
  }
  await page
    .getByRole("button", { name: "Completed in simulation", exact: true })
    .click();
  await expect(
    page.getByText("Recorded outcome:", { exact: false }),
  ).toBeVisible();
  await page
    .getByRole("link", { name: /^Learn:/ })
    .first()
    .click();
  const lessonId = new URL(page.url()).pathname.split("/").pop()!;
  const initial = await (
    await page.request.get("/api/lessons/" + lessonId)
  ).json();
  expect(JSON.stringify(initial)).not.toContain("correct_index");
  for (const field of await page.getByRole("group").all())
    await field.getByRole("radio").first().check();
  await page.getByRole("button", { name: "Submit knowledge check" }).click();
  await expect(page.getByText(/of 3/).first()).toBeVisible();
  await page.getByRole("link", { name: "View learning history →" }).click();
  await expect(
    page.getByRole("heading", { name: "Assessment attempts" }),
  ).toBeVisible();
  await expect(
    page.getByText(initial.content.title, { exact: true }).last(),
  ).toBeVisible();
});
