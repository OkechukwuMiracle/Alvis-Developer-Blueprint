import { test, expect } from "@playwright/test";
test("sign-in page is accessible and fits the viewport", async ({
  page,
}, testInfo) => {
  await page.goto("/login");
  await expect(
    page.getByRole("heading", { name: "Welcome back" }),
  ).toBeVisible();
  await expect(page.getByLabel("Email address")).toBeVisible();
  await expect(page.getByLabel("Password", { exact: true })).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: testInfo.outputPath("login.png"),
    fullPage: true,
  });
});
test("private routes do not reveal data without a session", async ({
  page,
}) => {
  for (const route of ["/home", "review", "knowledge", "drafts"].map((p) =>
    p.startsWith("/") ? p : "/" + p,
  )) {
    await page.goto(route);
    await expect(page).toHaveURL(/\/login/);
    await expect(
      page.getByRole("heading", { name: "Welcome back" }),
    ).toBeVisible();
  }
});
test("anonymous API reads return errors without workspace data", async ({
  request,
}) => {
  for (const route of [
    "/api/knowledge",
    "/api/sources/72ca1f3f-2d5a-52da-b135-d2d7c4468a7e",
  ]) {
    const response = await request.get(route);
    expect([401, 503]).toContain(response.status());
    const body = await response.json();
    expect(body.request_id).toBeTruthy();
    expect(body.knowledge).toBeUndefined();
    expect(body.text_content).toBeUndefined();
  }
});

test("mutation APIs reject foreign origins and anonymous role spoofing", async ({
  request,
}) => {
  const id = "60000000-0000-4000-8000-000000000001";
  for (const operation of ["submit", "review"]) {
    const route = `/api/revisions/${id}/${operation}`;
    const foreign = await request.post(route, {
      headers: { Origin: "https://outside.example" },
      data: { role: "reviewer", organization_id: id, decision: "approve" },
    });
    expect(foreign.status()).toBe(403);
    expect((await foreign.json()).code).toBe("FORBIDDEN");
    const anonymous = await request.post(route, {
      headers: { Origin: process.env.ALVIS_TEST_BASE_URL || "http://127.0.0.1:3000" },
      data: { role: "reviewer", organization_id: id, decision: "approve" },
    });
    expect([401, 503]).toContain(anonymous.status());
  }
});
