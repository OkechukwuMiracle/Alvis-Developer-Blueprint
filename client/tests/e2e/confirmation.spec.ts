import { test, expect } from "@playwright/test";

for (const kind of ["fragment", "query", "code"] as const) {
  test(`confirmation accepts ${kind} links without exposing credentials in the URL`, async ({ page }) => {
    const token = "a".repeat(64);
    const suffix = kind === "code" ? `?code=${token}` : `${kind === "fragment" ? "#" : "?"}token_hash=${token}&type=email`;
    let posted: unknown;
    await page.route("**/api/auth/confirm", async route => {
      posted = route.request().postDataJSON();
      await route.fulfill({ status: 400, contentType: "application/json", body: JSON.stringify({ message: "Expired test link" }) });
    });
    await page.goto(`/auth/confirm${suffix}`);
    await expect(page.getByRole("button", { name: "Confirm email link" })).toBeEnabled();
    expect(page.url()).not.toContain(token);
    await page.getByRole("button", { name: "Confirm email link" }).click();
    await expect(page.locator(".notice[role=alert]")).toContainText("Expired test link");
    expect(posted).toEqual(kind === "code" ? { code: token } : { token_hash: token, type: "email" });
  });
}

test("a bare confirmation URL explains missing information rather than claiming expiry", async ({ page }) => {
  await page.goto("/auth/confirm");
  await expect(page.locator(".notice[role=alert]")).toContainText("contains no verification information");
});

test("verification shows a service failure without claiming the email expired (intercepted response)", async ({ page }) => {
  await page.route("**/api/auth/confirm", route => route.fulfill({ status: 503, json: { message: "The verification service is unavailable. Try again." } }));
  await page.goto("/auth/confirm?code=" + "b".repeat(32));
  await page.getByRole("button", { name: "Confirm email link" }).click();
  await expect(page.locator(".notice[role=alert]")).toContainText("service is unavailable");
  await expect(page.locator(".notice[role=alert]")).not.toContainText("expired");
});

test("a PKCE link with no signup cookie reports browser proof rather than token expiry (real anonymous API)", async ({ page }) => {
  await page.goto("/auth/confirm?code=" + "c".repeat(32));
  await page.getByRole("button", { name: "Confirm email link" }).click();
  await expect(page.locator(".notice[role=alert]")).toContainText("signup cookie is missing");
});
