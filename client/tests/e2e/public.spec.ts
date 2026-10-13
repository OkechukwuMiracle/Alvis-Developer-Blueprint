import { test, expect } from "@playwright/test";
test("public landing explains the workflow and navigates to real signup", async ({
  page,
}, info) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", {
      name: "Keep the judgment. Share the knowledge.",
    }),
  ).toBeVisible();
  for (const label of ["How it works", "Use cases", "About", "FAQs"])
    await expect(
      page
        .getByRole("navigation")
        .getByRole("link", { name: label, exact: true }),
    ).toBeVisible();
  await page
    .getByRole("link", { name: "Get started", exact: true })
    .first()
    .click();
  await expect(page).toHaveURL(/\/signup/);
  await expect(page.getByLabel("Full name")).toBeVisible();
  await expect(page.getByLabel("Confirm password")).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: info.outputPath("signup.png"),
    fullPage: true,
  });
});
test("recovery and invalid verification states are understandable without leaking secrets", async ({
  page,
}) => {
  await page.goto("/forgot-password");
  await expect(
    page.getByRole("heading", { name: "Recover your password" }),
  ).toBeVisible();
  await expect(page.getByLabel("Email address")).toBeVisible();
  await page.goto("/reset-password");
  await expect(
    page.getByText(/recovery session is missing or expired/),
  ).toBeVisible();
  await expect(page.getByLabel("New password")).toHaveCount(0);
  await page.goto("/auth/confirm#token_hash=invalid&type=email");
  await expect(
    page.getByRole("button", { name: "Confirm email link" }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "Confirm email link" }).click();
  await expect(page.locator(".notice[role=alert]")).toContainText("Invalid verification link");
  expect(page.url()).not.toContain("token_hash");
});
test("onboarding and admin APIs reject anonymous users and foreign origins", async ({
  request,
}) => {
  for (const route of ["/api/admin", "/api/invitations", "/api/auth/confirm"]) {
    const response = await request.post(route, {
      headers: { Origin: "https://unrelated.example" },
      data: {
        operation: "accept",
        role: "admin",
        organization_id: crypto.randomUUID(),
      },
    });
    expect(response.status()).toBe(403);
  }
  const response = await request.post("/api/admin", {
    headers: {
      Origin: process.env.ALVIS_TEST_BASE_URL || "http://127.0.0.1:3000",
    },
    data: { operation: "role", role: "admin" },
  });
  expect([401, 503]).toContain(response.status());
});
