import { test, expect, Page } from "@playwright/test";
import { readFileSync } from "node:fs";
const externalFile = process.env.ALVIS_E2E_ACCOUNTS_FILE;
const accounts = externalFile
  ? (JSON.parse(readFileSync(externalFile, "utf8")) as Record<
      string,
      { email: string; password: string }
    >)
  : null;
async function login(page: Page, role: string) {
  await page.goto("/login");
  await page.getByLabel("Email address").fill(accounts![role].email);
  await page
    .getByLabel("Password", { exact: true })
    .fill(accounts![role].password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/home$/);
}
test("expert submits, reviewer approves, worker reads version and source", async ({
  page,
}) => {
  test.skip(
    !accounts,
    "Needs configured Supabase and ALVIS_E2E_ACCOUNTS_FILE outside the repository.",
  );
  test.setTimeout(360000);
  await login(page, "expert");
  await page.goto("/drafts");
  const title = "Clicking after a tray change";
  const card = page
    .getByRole("article")
    .filter({ has: page.getByRole("link", { name: title, exact: true }) })
    .filter({
      has: page.getByRole("button", { name: "Create next draft version" }),
    });
  await card.getByRole("button", { name: "Create next draft version" }).click();
  await expect(
    page.getByRole("heading", { name: title, exact: true }),
  ).toBeVisible();
  const revisionId = new URL(page.url()).pathname.split("/").pop();
  await page
    .getByRole("textbox", { name: "reason text", exact: true })
    .fill(
      "The symptom began with a tray change; location and timing favor guide contact.",
    );
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await expect(
    page.getByText("Saved. This page shows the persisted revision."),
  ).toBeVisible();
  await page.getByRole("button", { name: "Submit for review" }).click();
  await expect(
    page.getByText("Saved. This page shows the persisted revision."),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Submit for review" }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Sign out" }).click();
  await login(page, "worker");
  await page.goto("/review/" + revisionId);
  await expect(page).toHaveURL(/\/home$/);
  await page.goto("/drafts/" + revisionId);
  await expect(page).toHaveURL(/\/home$/);
  await page.getByRole("button", { name: "Sign out" }).click();
  await login(page, "reviewer");
  await page.goto("/review/" + revisionId);
  for (const checkbox of await page.getByRole("checkbox").all())
    await checkbox.check();
  await page
    .getByLabel("Review comment / field-specific feedback")
    .fill(
      "E2E simulation review: checked equipment context, reason, exception, all instructions and sources.",
    );
  await page.getByRole("button", { name: "Approve", exact: true }).click();
  await expect(
    page.getByText("Saved. This page shows the persisted revision."),
  ).toBeVisible();
  await page.getByRole("button", { name: "Sign out" }).click();
  await login(page, "worker");
  await expect
    .poll(
      async () => {
        await page.goto("/knowledge");
        return page.getByRole("link", { name: title, exact: true }).count();
      },
      { timeout: 180000, intervals: [2000, 5000] },
    )
    .toBeGreaterThan(0);
  await page.getByRole("link", { name: title, exact: true }).click();
  await expect(
    page.getByRole("heading", { name: title, exact: true }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Source 1 ↗" }).first().click();
  await expect(
    page.getByRole("heading", { name: "Original evidence" }),
  ).toBeVisible();
  await expect(
    page.getByText(/In this fictional training case:/),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});
