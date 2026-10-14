// Presentation-only fixture server. This is not live authentication or a model test.
import http from "node:http";
import { spawn, execFileSync } from "node:child_process";
import { readFile, mkdir } from "node:fs/promises";
import { chromium } from "playwright";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const clientRoot = new URL("../", import.meta.url);
const fixtures = JSON.parse(await readFile(new URL("../../alvis-blueprint/data/manufacturing-fixtures.json", import.meta.url), "utf8"));
const lessonContent = JSON.parse(await readFile(new URL("../../alvis-blueprint/data/demo-lesson.json", import.meta.url), "utf8")).content;
const origin = "http://127.0.0.1:3200";
const assets = [{ id: "fixture-asset", code: "CONV-01", name: "Synthetic training conveyor" }];
const revision = { ...fixtures.knowledge_units[0], id: fixtures.knowledge_units[0].revision_id, unit_id: "fixture-unit", version: 1, status: "approved", capture_id: null, created_by: "fixture-expert", index_ready: true };
let role = "expert";
let personal = false;
const user = { id: "fixture-user", email: "synthetic@alvis.test", email_confirmed_at: "2026-10-13", user_metadata: { full_name: "Synthetic expert" } };
const member = () => ({ organization_id: "fixture-org", role, display_name: "Synthetic " + role });
const api = http.createServer(async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Content-Type", "application/json");
  if (req.method === "OPTIONS") { res.writeHead(204); return res.end(); }
  const path = req.url.split("?")[0];
  let text = ""; for await (const chunk of req) text += chunk;
  const body = text ? JSON.parse(text) : {};
  let result;
  if (path === "/api/auth/identity") result = { configured: true, user, member: member(), org: { name: "Synthetic UI review workspace", demo_only: true }, active_context: personal ? "personal" : "organization", remembered: false, canRecover: false };
  else if (path === "/api/views/home") result = { member: member(), assets, published: [revision], pending: role === "reviewer" ? [{ ...revision, status: "pending" }] : [], drafts: role === "expert" ? [{ ...revision, status: "draft" }] : [], captures: [], reviewer: role === "reviewer", expert: role === "expert", admin: null };
  else if (path === "/api/views/ask") result = { data: assets };
  else if (path === "/api/views/captures/new") result = { assets };
  else if (path === "/api/views/review") result = { filter: "all", filtered: [{ ...revision, status: "pending" }] };
  else if (path === "/api/views/sources/[sourceId]") result = { s: { id: "fixture-source", kind: "transcript", locator: "Synthetic training excerpt", text_content: fixtures.sources[0].text, start_ms: 12000, end_ms: 24000, synthetic: true, capture_id: null } };
  else if (path === "/api/views/knowledge/[unitId]") result = { member: member(), r: revision };
  else if (path === "/api/views/practice/[revisionId]") result = { revisionId: revision.id, r: revision };
  else if (path === "/api/views/guides/[sessionId]") result = { data: { id: "fixture-guide", revision_id: revision.id, version: 1, state: "active", step_position: 0, content: revision.content }, history: { lessons: [] } };
  else if (path === "/api/ask") {
    if (body.asset_id !== "fixture-asset" || body.query !== "Synthetic UI question about reviewed observations") throw Error("Ask payload changed");
    result = { id: "fixture-answer", guide_revision_id: null, latency_ms: 0, answer: { mode: "abstain", summary: "Synthetic UI response: no reviewed answer", claims: [], clarifying_question: null, escalation_reason: null } };
  }
  else if (path === "/api/views/learn/[lessonId]") result = { user, data: { id: "fixture-lesson", version: 1, content: { ...lessonContent, questions: lessonContent.questions.map(({ correct_index, explanation, ...question }) => { void correct_index; void explanation; return question; }) } } };
  else if (path === "/api/views/revision-detail") result = { user, r: { ...revision, status: "draft", created_by: user.id }, links: fixtures.sources.map(s => ({ source_id: s.id })), sources: fixtures.sources.map(s => ({ ...s, locator: "Synthetic supporting excerpt", text_content: s.text, synthetic: true })), reviews: [], previous: [], history: [] };
  else if (path === "/api/views/captures/[captureId]/debrief") result = { captureId: "fixture-capture" };
  else if (path === "/api/captures/fixture-capture") result = { capture: { id: "fixture-capture", title: "Synthetic training capture", task: "Explain the reviewed conveyor observation", state: "debrief", duration_seconds: 60, generation: 1, accepted_generation: 1, transcript_version: 1 }, sources: fixtures.sources.map(s => ({ id: s.id, kind: "transcript", text_content: s.text, start_ms: 12000, end_ms: 24000, evidence_version: 1 })), questions: [{ id: "fixture-question", sequence: 1, target_field: "reason", question: "What observation informed this decision?", gap: "Reason not yet confirmed", source_ids: [fixtures.sources[0].id], answer_source_id: null, answer_text: null, cannot_confirm: false }], jobs: [], revision: null, proposals: [], mediaUrl: null, editable: true };
  else if (path === "/api/views/learning") result = { member: member(), data: { lessons: [], attempts: [] }, guides: [], requests: [], attempts: [] };
  else if (path === "/api/views/settings") result = { user, invites: { data: [], error: null }, members: { data: [{ user_id: user.id, role: "admin", display_name: "Synthetic admin" }], error: null } };
  else if (path === "/api/views/onboarding") result = { user, p: {}, members: [{ ...member(), organizations: { name: "Synthetic UI review workspace" } }], personal: { role: "expert" } };
  else if (path === "/api/community") result = req.method === "GET" ? [] : { mine: [], feedback: [] };
  else { res.statusCode = 404; result = { message: "UI fixture endpoint not configured" }; }
  res.end(JSON.stringify(result));
});
await new Promise(resolve => api.listen(4200, "127.0.0.1", resolve));
const next = spawn(process.execPath, ["--require", new URL("./ui-fixture-fetch.cjs", import.meta.url).pathname.replace(/^\/(\w:)/, "$1"), require.resolve("next/dist/bin/next"), "start", "--hostname", "127.0.0.1", "--port", "3200"], { cwd: clientRoot, env: { ...process.env, ALVIS_NEXT_DIST_DIR: process.env.ALVIS_UI_BUILD_DIR || ".next" }, stdio: "inherit", windowsHide: true });
let browser;
try {
  for (let i = 0; i < 30; i++) { try { if ((await fetch(origin + "/login", { signal: AbortSignal.timeout(5000) })).ok) break; } catch {} await new Promise(r => setTimeout(r, 600)); if (i === 29) throw Error("UI preview did not start"); }
  browser = await chromium.launch({ channel: "chrome" });
  const page = await browser.newPage();
  await page.route("http://127.0.0.1:4000/api/**", async route => {
    const target = new URL(route.request().url()); target.port = "4200";
    await route.fulfill({ response: await route.fetch({ url: target.href }) });
  });
  const output = new URL("../test-results/ui-review/", import.meta.url);
  await mkdir(new URL("before/", output), { recursive: true });
  await mkdir(new URL("after/", output), { recursive: true });
  for (const width of [360, 768, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const [name, path, chosen] of [["expert-home", "/home", "expert"], ["capture", "/captures/new", "expert"], ["worker-ask", "/ask", "worker"], ["review-queue", "/review", "reviewer"], ["source", "/sources/fixture-source", "worker"], ["knowledge", "/knowledge/fixture-unit", "worker"], ["learning", "/learning", "worker"], ["settings", "/settings", "admin"], ["onboarding", "/onboarding", "expert"], ["draft-editor", "/drafts/fixture-revision", "expert"], ["practice", "/practice/fixture-revision", "worker"], ["guide", "/guides/fixture-guide", "worker"], ["lesson", "/learn/fixture-lesson", "worker"], ["debrief", "/captures/fixture-capture/debrief", "expert"], ["personal-home", "/community/home", "expert"]]) {
      role = chosen;
      personal = name === "personal-home";
      await page.goto(origin + path, { waitUntil: "domcontentloaded", timeout: 90000 });
      await page.getByRole("heading", { level: 1 }).first().waitFor();
      if (name === "worker-ask") {
        await page.getByLabel("Training asset").selectOption("fixture-asset");
        await page.getByLabel("Describe the problem").fill("Synthetic UI question about reviewed observations");
        await page.locator("form").getByRole("button", { name: "Ask Alvis", exact: true }).click();
        await page.getByRole("heading", { name: "Synthetic UI response: no reviewed answer" }).waitFor();
      }
      if (await page.getByRole("heading", { name: "Unable to load this page" }).count()) throw Error("Fixture failed: " + name);
      if (!(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))) throw Error("Horizontal overflow: " + name + " " + width);
      const nav = page.getByRole("navigation", { name: "Main navigation" });
      if (await nav.count()) {
        if ((await nav.getByRole("link", { name: "Record knowledge" }).count() > 0) !== (chosen === "expert")) throw Error("Capture navigation changed");
        if ((await nav.getByRole("link", { name: "Review queue" }).count() > 0) !== (chosen === "reviewer")) throw Error("Review navigation changed");
      }
      await page.emulateMedia({ reducedMotion: "reduce" });
      await page.keyboard.press("Tab");
      const focus = await page.evaluate(() => getComputedStyle(document.activeElement).outlineStyle);
      if (focus === "none") throw Error("Missing keyboard focus: " + name);
      await page.screenshot({ path: new URL(`after/${name}-${width}-fixture.png`, output).pathname.replace(/^\/(\w:)/, "$1"), fullPage: false, timeout: 60000 });
      // Baseline uses the existing globals.css, with the new presentation rules
      // removed in this browser only. Test fixture identity stays clearly labeled.
      await page.evaluate(() => { for (const sheet of document.styleSheets) { try { const rules = sheet.cssRules; for (let i = 0; i < rules.length; i++) { if (rules[i].cssText.includes("--lime:")) { while (sheet.cssRules.length > i) sheet.deleteRule(i); break; } } } catch {} } });
      await page.screenshot({ path: new URL(`before/${name}-${width}-fixture.png`, output).pathname.replace(/^\/(\w:)/, "$1"), fullPage: false, timeout: 60000 });
      console.log("PASS UI fixture:", name, width);
    }
  }
} finally {
  if (browser) await browser.close();
  api.closeAllConnections();
  await new Promise(resolve => api.close(resolve));
  if (next.pid) { if (process.platform === "win32") { try { execFileSync("taskkill", ["/PID", String(next.pid), "/T", "/F"], { stdio: "ignore" }); } catch {} } else next.kill(); }
}
