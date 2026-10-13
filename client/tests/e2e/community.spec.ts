import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import type { Content } from "@alvis/shared/content";
const fixtures = JSON.parse(readFileSync(new URL("../../../alvis-blueprint/data/manufacturing-fixtures.json", import.meta.url), "utf8")) as {
  knowledge_units: { revision_id: string; content: Content }[];
  sources: { id: string; text: string }[];
};

// Browser presentation test with an explicitly intercepted synthetic public projection.
// SQL integration tests separately exercise actual visibility, review and scoring.
test("community public discovery, selected excerpts and profile are responsive (intercepted fixture)", async ({ page }) => {
  const unit = fixtures.knowledge_units[0];
  const publication = {
    id: "ac700000-0000-4000-8000-000000000001", revision_id: unit.revision_id,
    author_id: "ac000000-0000-4000-8000-000000000001", contributor: "Synthetic contributor",
    topic: "Training", equipment: "Conveyor", content: unit.content, version: 1,
    reviewed_at: "2026-10-12T10:00:00Z", excerpts: fixtures.sources.map(s => ({
      id: s.id, text_content: s.text, locator: "Synthetic selected excerpt", synthetic: true,
    })),
  };
  await page.route("**/api/community**", async route => {
    const url = new URL(route.request().url());
    await route.fulfill({ json: url.searchParams.has("profile")
      ? { display_name: "Synthetic contributor", role: "expert", bio: "Synthetic browser example" }
      : [publication] });
  });
  await page.goto("/community/library");
  await expect(page.getByRole("heading", { name: "Community knowledge", exact: true })).toBeVisible();
  await expect(page.getByText(/not professional certification/)).toBeVisible();
  await page.getByRole("link", { name: unit.content.title, exact: true }).click();
  await expect(page.getByRole("heading", { name: "Explicitly shared source excerpts" })).toBeVisible();
  await page.locator("details").first().locator("summary").click();
  await expect(page.getByText("Text excerpt from private evidence. The raw recording is not public.").first()).toBeVisible();
  await expect(page.locator("video")).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole("link", { name: "Synthetic contributor", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Contributor profile", exact: true })).toBeVisible();
});

test("signup supports personal accounts; authenticated community tools require sign in", async ({ page }) => {
  await page.goto("/signup");
  await expect(page.locator('select[name="account_kind"] option[value="personal"]')).toHaveCount(1);
  await expect(page.locator('select[name="account_kind"] option[value="organization"]')).toHaveCount(1);
  await page.goto("/community/ask");
  await expect(page).toHaveURL(/\/login/);
});
