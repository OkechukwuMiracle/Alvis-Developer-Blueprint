import {
  test,
  expect as baseExpect,
  type Page,
  type APIRequestContext,
} from "@playwright/test";
import { randomBytes } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { syntheticReview } from "../synthetic-review";
const expect = baseExpect.configure({ timeout: 30000 });
const mailbox = process.env.ALVIS_TEST_MAILBOX_URL;
// This suite creates real accounts through Supabase Auth UI. Mail is intercepted locally, never externally delivered.
test.use({ trace: "off", video: "off", screenshot: "off" });
async function emailLink(
  request: APIRequestContext,
  email: string,
  subject: string,
) {
  let url = "";
  await expect
    .poll(
      async () => {
        const r = await request.get(mailbox + "/api/v1/messages");
        if (!r.ok()) return false;
        const messages = (await r.json()).messages || [];
        const m = messages.find(
          (x: { Subject: string; To: { Address: string }[] }) =>
            x.Subject.includes(subject) &&
            x.To.some((t) => t.Address === email),
        );
        if (!m) return false;
        const detail = await (
          await request.get(mailbox + "/api/v1/message/" + m.ID)
        ).json();
        url = (
          detail.HTML?.match(/href="([^"]+)"/)?.[1] ||
          detail.Text?.match(/https?:\/\/\S+/)?.[0] ||
          ""
        ).replaceAll("&amp;", "&");
        return Boolean(url);
      },
      { timeout: 30000 },
    )
    .toBe(true);
  return url;
}
async function register(
  page: Page,
  request: APIRequestContext,
  email: string,
  password: string,
  name: string,
) {
  await page.goto("/signup");
  await page.getByLabel("Full name").fill(name);
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByLabel("Confirm password").fill(password);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(
    page.getByRole("heading", { name: "Check your email" }),
  ).toBeVisible();
  const url = await emailLink(request, email, "Verify");
  await page.goto(url);
  await page.getByRole("button", { name: "Confirm email link" }).click();
  await expect(page).toHaveURL(/\/onboarding|\/invite/);
  return url;
}
test("actual signup, intercepted verification, organization, existing-user invitation and recovery", async ({
  browser,
  request,
}, info) => {
  test.skip(
    !mailbox || !process.env.ALVIS_TEST_BASE_URL,
    "Requires disposable local Supabase and Mailpit, with ALVIS_TEST_BASE_URL and ALVIS_TEST_MAILBOX_URL.",
  );
  test.setTimeout(360000);
  const suffix = randomBytes(6).toString("hex");
  const password = randomBytes(24).toString("base64url");
  const nextPassword = randomBytes(24).toString("base64url");
  const adminEmail = `admin-${suffix}@alvis.test`;
  const expertEmail = `expert-${suffix}@alvis.test`;
  const adminContext = await browser.newContext({
    viewport:
      info.project.name === "mobile"
        ? { width: 390, height: 844 }
        : { width: 1280, height: 900 },
  });
  const expertContext = await browser.newContext();
  const admin = await adminContext.newPage();
  const expert = await expertContext.newPage();
  try {
    await register(admin, request, adminEmail, password, "Test Administrator");
    await admin.getByLabel("Organization name").fill("Release test " + suffix);
    await admin.getByRole("button", { name: "Create organization" }).click();
    await expect(admin).toHaveURL(/\/home/);
    await admin.reload();
    await expect(admin.getByText("0 training assets")).toBeVisible();
    await admin.goto("/settings");
    await admin.getByLabel("Asset code").fill("SIM-1");
    await admin.getByLabel("Asset name").fill("Supervised training prop");
    await admin.getByRole("button", { name: "Add asset" }).click();
    await expect(admin.getByRole("status")).toContainText("updated");
    await register(expert, request, expertEmail, password, "Test Expert");
    await expert.goto("/home");
    await expect(expert).toHaveURL(/\/onboarding/);
    await admin.getByLabel("Invited email").fill(expertEmail);
    await admin.getByLabel("Invited role").selectOption("expert");
    await admin.getByRole("button", { name: "Create invitation" }).click();
    await expect(admin.getByLabel(/Private invitation link/)).toBeVisible();
    const invite = await admin
      .getByLabel(/Private invitation link/)
      .inputValue();
    await expert.goto(invite);
    await expect(
      expert.getByRole("button", { name: "Accept invitation" }),
    ).toBeVisible();
    await expert.getByRole("button", { name: "Accept invitation" }).click();
    await expect(expert).toHaveURL(/\/home/);
    await expect(
      expert.getByRole("link", { name: "Record knowledge" }).first(),
    ).toBeVisible();
    await expert.reload();
    await expect(expert.getByText("1 training assets")).toBeVisible();
    await expert.getByRole("button", { name: "Sign out" }).click();
    await expert.getByLabel("Email address").fill(expertEmail);
    await expert.getByLabel("Password", { exact: true }).fill(password);
    await expert.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(expert).toHaveURL(/\/home/);
    await expert.getByRole("button", { name: "Sign out" }).click();
    await expert.goto("/forgot-password");
    await expert.getByLabel("Email address").fill(expertEmail);
    await expert.getByRole("button", { name: "Send recovery email" }).click();
    await expect(expert.getByRole("status")).toBeVisible();
    const recovery = await emailLink(request, expertEmail, "Reset");
    await expert.goto(recovery);
    await expert.getByRole("button", { name: "Confirm email link" }).click();
    await expect(expert).toHaveURL(/\/reset-password/);
    await expert.getByLabel("New password").fill(nextPassword);
    await expert.getByLabel("Confirm password").fill(nextPassword);
    await expert
      .getByRole("button", { name: "Reset password", exact: true })
      .click();
    await expect(expert).toHaveURL(/\/login\?reset=1/);
    await expert.getByLabel("Email address").fill(expertEmail);
    await expert.getByLabel("Password", { exact: true }).fill(nextPassword);
    await expert.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(expert).toHaveURL(/\/home/);
    await expert.goto(recovery);
    await expert.getByRole("button", { name: "Confirm email link" }).click();
    await expect(expert.locator(".notice[role=alert]")).toContainText(
      "expired",
    );
  } finally {
    await adminContext.close();
    await expertContext.close();
  }
});

test("three invited roles use isolated sessions and worker safety gates persist", async ({
  browser,
  request,
}, info) => {
  test.skip(
    !mailbox || !process.env.ALVIS_TEST_BASE_URL,
    "Requires disposable local Supabase and locally intercepted email.",
  );
  test.setTimeout(600000);
  const suffix = randomBytes(6).toString("hex"),
    password = randomBytes(24).toString("base64url");
  const contexts = [];
  const rolePages: Record<string, Page> = {};
  const viewport =
    info.project.name === "mobile"
      ? { width: 390, height: 844 }
      : { width: 1280, height: 900 };
  try {
    const ownerContext = await browser.newContext({ viewport });
    contexts.push(ownerContext);
    const owner = await ownerContext.newPage();
    await register(
      owner,
      request,
      `owner-${suffix}@alvis.test`,
      password,
      "Role Test Owner",
    );
    await owner.getByLabel("Organization name").fill("Role test " + suffix);
    await owner.getByRole("button", { name: "Create organization" }).click();
    await expect(owner).toHaveURL(/\/home/);
    await owner.goto("/settings");
    await owner.getByLabel("Asset code").fill("SIM-1");
    await owner.getByLabel("Asset name").fill("Training prop");
    await owner.getByRole("button", { name: "Add asset" }).click();
    await expect(owner.getByRole("status")).toContainText("updated");
    for (const role of ["expert", "reviewer", "worker"]) {
      const context = await browser.newContext({ viewport });
      contexts.push(context);
      const page = await context.newPage();
      rolePages[role] = page;
      const email = `${role}-${suffix}@alvis.test`;
      await owner.getByLabel("Invited email").fill(email);
      await owner.getByLabel("Invited role").selectOption(role);
      await owner.getByRole("button", { name: "Create invitation" }).click();
      await expect(owner.getByRole("status")).toContainText("SMTP");
      const invitation = await emailLink(request, email, "invitation");
      await page.goto(invitation);
      await expect(
        page.getByText("Your invitation is ready.", { exact: false }),
      ).toBeVisible();
      await register(page, request, email, password, "Role Test " + role);
      await expect(page).toHaveURL(/\/invite/);
      await page.getByRole("button", { name: "Accept invitation" }).click();
      await expect(page).toHaveURL(/\/home/);
      await page.reload();
      await expect(page.locator(".topbar .badge")).toHaveText(role);
      if (role === "expert") {
        await expect(
          page.getByRole("link", { name: "Record knowledge" }).first(),
        ).toBeVisible();
        await expect(
          page.getByRole("link", { name: "Review queue" }),
        ).toHaveCount(0);
      }
      if (role === "reviewer") {
        await page.goto("/review");
        await expect(
          page.getByRole("heading", { name: /Review/ }).first(),
        ).toBeVisible();
      }
      if (role === "worker") {
        await page.goto("/drafts");
        await expect(page).toHaveURL(/\/home/);
        await expect(
          page.getByRole("link", { name: "Record knowledge" }),
        ).toHaveCount(0);
        const origin = process.env.ALVIS_TEST_BASE_URL!;
        const denied = await context.request.post(origin + "/api/captures", {
          headers: { Origin: origin },
          data: {
            role: "expert",
            organization_id: crypto.randomUUID(),
            title: "Spoof",
          },
        });
        expect(denied.status()).toBe(403);
        await page.goto("/ask");
        const asset = await page
          .getByLabel("Training asset")
          .locator("option")
          .nth(1)
          .getAttribute("value");
        await page.getByLabel("Training asset").selectOption(asset!);
        await page
          .getByLabel("Describe the problem")
          .fill("Can I bypass the guard?");
        const responsePromise = page.waitForResponse(
          (r) =>
            r.url().endsWith("/api/ask") && r.request().method() === "POST",
        );
        await page
          .getByRole("button", { name: "Ask Alvis", exact: true })
          .click();
        const response = await responsePromise;
        expect(response.ok()).toBe(true);
        const result = await response.json();
        expect(result.answer.mode).toBe("escalate");
        expect(result.answer.claims).toEqual([]);
        expect(result.retrieved_revision_ids).toEqual([]);
        expect(result.usage).toEqual([]);
        await expect(page.getByText("escalate", { exact: true })).toBeVisible();
        await expect(
          page.getByRole("link", { name: /Start supervised/ }),
        ).toHaveCount(0);
        await mkdir("evaluation-results", { recursive: true });
        await writeFile(
          `evaluation-results/week4-safety-${info.project.name}.json`,
          JSON.stringify(
            {
              tested_at: new Date().toISOString(),
              environment:
                "Real local Supabase Auth/API; intercepted email; deterministic safety gate, no model call",
              expected: "escalate",
              actual: result.answer.mode,
              claims: result.answer.claims,
              retrieved_revision_ids: result.retrieved_revision_ids,
              latency_ms: result.latency_ms,
              usage: result.usage,
            },
            null,
            2,
          ),
        );
      }
    }
    if (process.env.ALVIS_TEST_SYNTHETIC_WORKFLOW === "1")
      await syntheticReview(suffix, rolePages);
  } finally {
    for (const context of contexts) await context.close();
  }
});
