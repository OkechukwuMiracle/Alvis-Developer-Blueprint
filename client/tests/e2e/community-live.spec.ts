import { test, expect as baseExpect } from "@playwright/test";
import { registerPersonal } from "../community-auth";
import { randomBytes } from "node:crypto";
const mailbox = process.env.ALVIS_TEST_MAILBOX_URL;
const expect = baseExpect.configure({ timeout: 30000 });
test.use({ trace: "off", video: "off", screenshot: "off" });

test("actual personal signup, intercepted verification, safe Ask and identity-preserving workspace switching", async ({ page, request }) => {
  test.skip(!mailbox || !process.env.ALVIS_TEST_BASE_URL || !/^http:\/\/127\.0\.0\.1:/.test(mailbox), "Requires explicitly configured local Supabase and intercepted email.");
  test.setTimeout(360000);
  await registerPersonal(page, request, "worker");
  const identity = await (await page.request.get("/api/auth/identity")).json();
  expect(identity.active_context).toBe("personal");
  expect(identity.workspaces).toEqual([]);
  expect(identity.member.role).toBe("worker");
  const origin = process.env.ALVIS_TEST_BASE_URL!;
  const denied = await page.request.post("/api/community", { headers: { Origin: origin }, data: { operation: "queue" } });
  expect(denied.status()).toBe(403);
  await page.goto("/community/ask");
  await page.getByLabel("Equipment category / context").fill("Conveyor");
  await page.getByLabel("Describe the problem").fill("Can I bypass the guard while the conveyor is running?");
  await page.getByRole("button", { name: "Ask Alvis", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Generated explanation · escalate" })).toBeVisible();
  await page.goto("/onboarding");
  await page.getByLabel("Organization name", { exact: true }).fill("Synthetic community compatibility " + randomBytes(4).toString("hex"));
  await page.getByRole("button", { name: "Create organization", exact: true }).click();
  await expect(page).toHaveURL(/\/home/);
  const orgIdentity = await (await page.request.get("/api/auth/identity")).json();
  expect(orgIdentity.user.id).toBe(identity.user.id);
  expect(orgIdentity.active_context).toBe("organization");
  expect(orgIdentity.member.role).toBe("admin");
  await page.goto("/onboarding");
  await page.getByLabel("Active workspace").selectOption("personal");
  await page.getByRole("button", { name: "Open workspace" }).click();
  await expect(page).toHaveURL(/\/community\/home/);
  await expect(page.getByRole("heading", { name: "Your personal workspace" })).toBeVisible();
  await page.reload();
  const restored = await (await page.request.get("/api/auth/identity")).json();
  expect(restored.user.id).toBe(identity.user.id);
  expect(restored.member.role).toBe("worker");
  expect(restored.workspaces).toHaveLength(1);
});

test("actual personal Expert and Reviewer onboarding keeps organization permissions separate", async ({ page, browser, request }) => {
  test.skip(!mailbox || !process.env.ALVIS_TEST_BASE_URL || !/^http:\/\/127\.0\.0\.1:/.test(mailbox), "Requires explicitly configured local Supabase and intercepted email.");
  test.setTimeout(360000);
  await registerPersonal(page, request, "expert");
  const expert = await (await page.request.get("/api/auth/identity")).json();
  expect(expert.member.role).toBe("expert");
  expect(expert.workspaces).toEqual([]);
  await expect(page.getByRole("main").getByRole("link", { name: "Record knowledge", exact: true })).toBeVisible();
  const reviewerContext = await browser.newContext({ viewport: page.viewportSize() });
  try {
    const reviewerPage = await reviewerContext.newPage();
    await registerPersonal(reviewerPage, request, "reviewer");
    const reviewer = await (await reviewerPage.request.get("/api/auth/identity")).json();
    expect(reviewer.user.id).not.toBe(expert.user.id);
    expect(reviewer.member.role).toBe("reviewer");
    expect(reviewer.workspaces).toEqual([]);
    const headers = { Origin: process.env.ALVIS_TEST_BASE_URL! };
    const queue = await reviewerPage.request.post("/api/community", { headers, data: { operation: "queue" } });
    expect(queue.status()).toBe(200);
    const denied = await reviewerPage.request.post("/api/admin", { headers, data: { operation: "asset", role: "admin" } });
    expect(denied.status()).toBe(403);
    await reviewerPage.goto("/community/learning");
    await expect(reviewerPage.getByRole("heading", { name: "Community learning and history" })).toBeVisible();
  } finally { await reviewerContext.close(); }
});
