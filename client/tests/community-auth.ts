import { expect as baseExpect, type APIRequestContext, type Page } from "@playwright/test";
import { randomBytes } from "node:crypto";
const mailbox = process.env.ALVIS_TEST_MAILBOX_URL;
const expect = baseExpect.configure({ timeout: 30000 });
export async function registerPersonal(page: Page, request: APIRequestContext, role: string) {
  const email = `community-${randomBytes(6).toString("hex")}@alvis.test`;
  const password = randomBytes(24).toString("base64url");
  await page.goto("/signup");
  // A previous invitation must not redirect a new personal registration.
  await page.context().addCookies([{ name: "alvis-invitation", value: "stale-synthetic-invitation", url: page.url(), httpOnly: true, sameSite: "Lax" }]);
  await page.getByLabel("How would you like to start?").selectOption("personal");
  await page.getByLabel("Personal community role").selectOption(role);
  await page.getByLabel("Full name").fill("Synthetic personal signup");
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByLabel("Confirm password").fill(password);
  await page.getByRole("button", { name: "Create account", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Check your email" })).toBeVisible();
  let confirmation = "";
  await expect.poll(async () => {
    const messages = (await (await request.get(mailbox + "/api/v1/messages")).json()).messages || [];
    const message = messages.find((m: { Subject: string; To: { Address: string }[] }) => m.Subject.includes("Verify") && m.To.some(t => t.Address === email));
    if (!message) return false;
    const detail = await (await request.get(mailbox + "/api/v1/message/" + message.ID)).json();
    confirmation = (detail.HTML?.match(/href="([^"]+)"/)?.[1] || "").replaceAll("&amp;", "&");
    return Boolean(confirmation);
  }, { timeout: 30000 }).toBe(true);
  await page.goto(confirmation);
  await page.getByRole("button", { name: "Confirm email link" }).click();
  await expect(page).toHaveURL(/\/community\/home/);
  await expect(page.getByRole("heading", { name: "Your personal workspace" })).toBeVisible();
}
