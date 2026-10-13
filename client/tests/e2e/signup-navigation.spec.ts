import { test, expect } from "@playwright/test";

test("signup loads without redirecting to itself and login navigation receives its RSC payload", async ({ page, request }) => {
  const response = await request.get("/signup?next=%2Fhome", { maxRedirects: 0 });
  expect(response.status()).toBe(200);
  expect(response.headers().location).toBeUndefined();
  const failures: string[] = [];
  page.on("console", message => {
    if (message.text().includes("Failed to fetch RSC payload")) failures.push(message.text());
  });
  await page.goto("/login");
  await page.getByRole("link", { name: "Create an account", exact: true }).click();
  await expect(page).toHaveURL(/\/signup\?next=%2Fhome/);
  await expect(page.getByLabel("Full name")).toBeVisible();
  expect(failures).toEqual([]);
});
