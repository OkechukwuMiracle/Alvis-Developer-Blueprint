import { test, expect } from "@playwright/test";
test("capture screens and APIs require an authenticated membership", async ({
  page,
  request,
}) => {
  test.setTimeout(120000);
  const id = "60000000-0000-4000-8000-000000000001";
  for (const path of [
    "/captures/new",
    "/captures/" + id,
    "/captures/" + id + "/debrief",
    "/knowledge/" + id + "/revisions/" + id + "/edit",
  ]) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/login/);
  }
  for (const path of ["/api/captures/" + id, "/api/sources/" + id + "/media"]) {
    const response = await request.get(path);
    expect([401, 503]).toContain(response.status());
  }
  const foreign = await request.post("/api/captures", {
    headers: { Origin: "https://outside.example" },
    data: { role: "expert" },
  });
  expect(foreign.status()).toBe(403);
  const spoof = await request.post("/api/captures/" + id + "/complete", {
    headers: { Origin: process.env.ALVIS_TEST_BASE_URL || "http://127.0.0.1:3000" },
    data: { organization_id: id, owner_id: id },
  });
  expect([401, 503]).toContain(spoof.status());
});
