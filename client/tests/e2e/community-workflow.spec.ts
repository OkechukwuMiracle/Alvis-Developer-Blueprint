import { test, expect as baseExpect } from "@playwright/test";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { randomUUID, randomBytes } from "node:crypto";
import { registerPersonal } from "../community-auth";
import { completeSyntheticLesson } from "../../../scripts/testing/synthetic-lesson.mjs";
import type { Content } from "@alvis/shared/content";
import type { Lesson } from "@alvis/shared/learning";
const expect = baseExpect.configure({ timeout: 30000 });
const require = createRequire(import.meta.url);
const fixtures = JSON.parse(readFileSync(new URL("../../../alvis-blueprint/data/manufacturing-fixtures.json", import.meta.url), "utf8")) as { knowledge_units: { content: Content }[]; sources: { id: string; text: string }[] };
const lessonFixture = JSON.parse(readFileSync(new URL("../../../alvis-blueprint/data/demo-lesson.json", import.meta.url), "utf8")).content as Lesson;
test.use({ trace: "off", video: "off", screenshot: "off" });

// Real signup/auth/API/review/guide/scoring; explicitly synthetic draft, index and generated lesson.
// This is NOT a recording, transcription, embedding-provider or live model evaluation.
test("community publication and learning with real accounts and explicitly synthetic processing", async ({ page: expert, browser, request }) => {
  test.skip(process.env.ALVIS_TEST_SYNTHETIC_COMMUNITY !== "1" || !/^http:\/\/127\.0\.0\.1:/.test(process.env.ALVIS_TEST_BASE_URL || "") || !/^http:\/\/127\.0\.0\.1:/.test(process.env.ALVIS_TEST_MAILBOX_URL || ""), "Requires opt-in local Supabase fixture creation and intercepted email.");
  test.setTimeout(420000);
  const db = new (require("pg").Client)({ host: "127.0.0.1", port: 54322, database: "postgres", user: "postgres", password: process.env.ALVIS_LOCAL_TEST_DB_PASSWORD || "postgres", connectionTimeoutMillis: 10000 });
  await db.connect();
  const reviewerContext = await browser.newContext({ viewport: expert.viewportSize() });
  const workerContext = await browser.newContext({ viewport: expert.viewportSize() });
  let publicationId = "";
  let expertId = "";
  const headers = { Origin: process.env.ALVIS_TEST_BASE_URL! };
  try {
    await registerPersonal(expert, request, "expert");
    const identity = await (await expert.request.get("/api/auth/identity")).json();
    expertId = identity.user.id;
    const scope = identity.member.organization_id;
    await db.query("update organizations set demo_only=true where id=$1 and scope_kind='personal' and personal_owner=$2", [scope, identity.user.id]);
    const sourceText = JSON.stringify(fixtures.knowledge_units[0].content);
    const originals = fixtures.sources.filter(s => sourceText.includes(s.id));
    const mapping = new Map(originals.map(s => [s.id, randomUUID()]));
    const remap = (value: unknown) => {
      let text = JSON.stringify(value);
      for (const [oldId, newId] of mapping) text = text.replaceAll(oldId, newId);
      return JSON.parse(text);
    };
    const content = remap(fixtures.knowledge_units[0].content) as Content;
    const suffix = randomBytes(4).toString("hex");
    content.title = "Synthetic community workflow " + suffix;
    content.asset_code = "PERSONAL";
    const revision = randomUUID(), capture = randomUUID(), unit = randomUUID();
    const asset = (await db.query("select id from assets where organization_id=$1 and code='PERSONAL'", [scope])).rows[0].id;
    await db.query("begin");
    try {
      await db.query("insert into captures(id,organization_id,asset_id,owner_id,title,consent_at,consent_version,state,generation,accepted_generation) values($1,$2,$3,$4,'Synthetic processing fixture',now(),'recording-v1','debrief',1,1)", [capture, scope, asset, identity.user.id]);
      for (const source of originals) await db.query("insert into sources(id,organization_id,capture_id,kind,locator,text_content,synthetic) values($1,$2,$3,'manual','Synthetic selected supporting excerpt',$4,true)", [mapping.get(source.id), scope, capture, source.text]);
      await db.query("insert into knowledge_units(id,organization_id,asset_id,code) values($1,$2,$3,$4)", [unit, scope, asset, "COMMUNITY-BROWSER-" + suffix]);
      await db.query("insert into knowledge_revisions(id,organization_id,unit_id,version,content,created_by,capture_id) values($1,$2,$3,1,$4::jsonb,$5,$6)", [revision, scope, unit, JSON.stringify(content), identity.user.id, capture]);
      for (const source of originals) await db.query("insert into revision_sources values($1,$2,$3)", [scope, revision, mapping.get(source.id)]);
      await db.query("update captures set current_revision_id=$1 where id=$2", [revision, capture]);
      await db.query("commit");
    } catch (error) { await db.query("rollback"); throw error; }

    await expert.goto("/drafts/" + revision);
    console.info("Synthetic community journey: private draft and explicit sharing");
    await expect(expert.getByRole("heading", { name: "Request community publication" })).toBeVisible();
    await expert.getByLabel("Topic", { exact: true }).fill("Training");
    await expert.getByLabel("Equipment category / subject").fill("Conveyor");
    for (const source of originals) await expert.getByLabel("Select the supporting excerpt for source " + mapping.get(source.id)).fill(source.text);
    await expert.locator('input[name="share"]').check();
    await expert.locator('input[name="reviewer"]').check();
    await expert.getByRole("button", { name: "Submit public preview for community review" }).click();
    await expect(expert).toHaveURL(/\/community\/home/);
    publicationId = (await db.query("select id from community_publications where revision_id=$1 and author_id=$2", [revision, identity.user.id])).rows[0].id;

    const reviewer = await reviewerContext.newPage();
    await registerPersonal(reviewer, request, "reviewer");
    await reviewer.goto("/community/review");
    console.info("Synthetic community journey: assigned independent review");
    const review = reviewer.locator("article").filter({ has: reviewer.getByRole("heading", { name: content.title, exact: true }) });
    await expect(review.locator("details")).toHaveCount(0);
    await review.getByRole("button", { name: "Claim review" }).click();
    await expect(review.getByLabel("Review reason", { exact: true })).toBeVisible();
    await review.getByLabel("Review reason", { exact: true }).fill("Reviewed synthetic training content, selected evidence, exceptions and prerequisites.");
    await review.getByRole("checkbox").check();
    await review.getByRole("button", { name: "Approve", exact: true }).click();
    await expect(reviewer.getByRole("status")).toContainText("Community review recorded");

    // Lease ONLY this test revision's index job, then use the real validated finisher.
    const index = (await db.query("update processing_jobs set status='running',lease_token=gen_random_uuid(),lease_until=now()+interval '5 minutes',attempts=attempts+1 where organization_id=$1 and revision_id=$2 and stage='index' and status='queued' returning id,lease_token", [scope, revision])).rows[0];
    expect(index).toBeTruthy();
    const chunk = [{ ordinal: 0, text: content.title, evidence_ids: [...mapping.values()], embedding: [1, ...Array(1535).fill(0)] }];
    await db.query("select alvis_finish_index($1,$2,$3::jsonb,'browser-fixture-only')", [index.id, index.lease_token, JSON.stringify(chunk)]);
    console.info("Synthetic community journey: fixture indexing complete; separate lesson review");
    await expert.goto("/community/home");
    const contribution = expert.locator("article").filter({ has: expert.getByRole("heading", { name: content.title, exact: true }) });
    await contribution.getByRole("button", { name: "Draft a lesson" }).click();
    await expect(expert.getByRole("status")).toContainText("generation queued");
    const lesson = completeSyntheticLesson(remap(lessonFixture), content) as Lesson;
    lesson.revision_id = revision;
    lesson.title = "Synthetic reviewed lesson " + suffix;
    const lessonJob = (await db.query("update processing_jobs set status='running',lease_token=gen_random_uuid(),lease_until=now()+interval '5 minutes',attempts=attempts+1 where organization_id=$1 and revision_id=$2 and stage='lesson' and status='queued' returning id,lease_token", [scope, revision])).rows[0];
    await db.query("begin");
    let lessonId: string;
    try {
      await db.query("set local role service_role");
      lessonId = (await db.query("select alvis_finish_lesson($1,$2,$3::jsonb) as id", [lessonJob.id, lessonJob.lease_token, JSON.stringify(lesson)])).rows[0].id;
      expect(lessonId).toBeTruthy();
      await db.query("commit");
    } catch (error) { await db.query("rollback"); throw error; }
    await reviewer.goto("/community/lesson-review");
    const lessonReview = reviewer.locator("form").filter({ has: reviewer.getByRole("heading", { name: lesson.title, exact: true }) });
    await lessonReview.getByLabel("Review reason", { exact: true }).fill("Separately reviewed synthetic lesson recognition, reasoning and exception questions.");
    await lessonReview.getByRole("button", { name: "Approve lesson" }).click();
    await expect(lessonReview).toHaveCount(0);

    const worker = await workerContext.newPage();
    await registerPersonal(worker, request, "worker");
    console.info("Synthetic community journey: public sources and persistent guide");
    await worker.goto("/community/publication/" + publicationId);
    await expect(worker.getByRole("heading", { name: content.title, exact: true })).toBeVisible();
    await worker.locator("details").first().locator("summary").click();
    await expect(worker.getByText("Text excerpt from private evidence. The raw recording is not public.").first()).toBeVisible();
    await expect(worker.locator("video")).toHaveCount(0);
    await worker.getByRole("checkbox").nth(0).check();
    await worker.getByRole("checkbox").nth(1).check();
    await worker.getByRole("button", { name: "Start guide (sign in required)" }).click();
    await expect(worker).toHaveURL(/\/community\/guide\//);
    await worker.getByRole("button", { name: "Next reviewed step" }).click();
    await expect(worker.getByText(/Progress 1\//)).toBeVisible();
    await worker.reload();
    await expect(worker.getByText(/Progress 1\//)).toBeVisible();
    for (let step = 1; step < content.steps.length; step++) {
      await worker.getByRole("button", { name: "Next reviewed step" }).click();
      await expect(worker.getByText(new RegExp("Progress " + (step + 1) + "/"))).toBeVisible();
    }
    await worker.getByRole("button", { name: "Finish simulation" }).click();
    await expect(worker.getByText(/State: completed/)).toBeVisible();
    const payload = await worker.request.post("/api/community", { headers, data: { operation: "lesson_get", id: lessonId } });
    expect(JSON.stringify((await payload.json()).content.questions)).not.toContain("correct_index");
    await worker.goto("/community/lesson/" + lessonId);
    console.info("Synthetic community journey: server-scored assessment and private history");
    for (let i = 0; i < lesson.questions.length; i++) await worker.locator("fieldset").nth(i).locator('input[type="radio"]').nth(lesson.questions[i].correct_index).check();
    await worker.getByRole("button", { name: "Submit knowledge check" }).click();
    await expect(worker.getByRole("heading", { name: /Knowledge check passed/ })).toBeVisible();
    await worker.getByRole("main").getByRole("link", { name: "Learning history", exact: true }).click();
    await expect(worker.getByRole("heading", { name: lesson.title, exact: true }).first()).toBeVisible();
    await expect(worker.getByText("Knowledge check passed", { exact: true })).toBeVisible();
    expect(await worker.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await expert.goto("/drafts/" + revision);
    await expert.getByRole("button", { name: "Create correction draft version" }).click();
    await expect(expert).toHaveURL(/\/drafts\//);
    await expect(expert.locator(".badge").filter({ hasText: /draft · Version 2/ })).toBeVisible();
    expect(expert.url()).not.toContain(revision);
  } finally {
    if (publicationId && expertId) {
      await db.query("begin");
      try {
        await db.query("set local role authenticated");
        await db.query("select set_config('request.jwt.claim.sub',$1,true)", [expertId]);
        await db.query("select alvis_withdraw_community($1)", [publicationId]);
        await db.query("commit");
      } catch (error) { await db.query("rollback"); throw error; }
    }
    await reviewerContext.close(); await workerContext.close(); await db.end();
  }
});
