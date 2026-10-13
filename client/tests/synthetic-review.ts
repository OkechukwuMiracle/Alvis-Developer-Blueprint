import { expect as baseExpect, type Page } from "@playwright/test";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import fixtures from "../../alvis-blueprint/data/manufacturing-fixtures.json" with { type: "json" };
const expect = baseExpect.configure({ timeout: 60000 });
// Real browser/Auth/API workflow, explicitly synthetic evidence and test-only indexing.
// Never runs against hosted Supabase or seeds/changes authentication identities.
function sql(text: string) {
  const result = spawnSync("docker", ["exec", "-i", "supabase_db_alvis-app", "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-At"], { input: text, encoding: "utf8" });
  if (result.status !== 0) throw new Error("Local synthetic workflow SQL failed; credentials and SQL payload withheld.");
  return result.stdout.trim();
}
function literal(value: string) { return "'" + value.replaceAll("'", "''") + "'"; }
export async function syntheticReview(suffix: string, pages: Record<string, Page>) {
  if (!/^[a-f0-9]+$/.test(suffix) || new URL(process.env.ALVIS_TEST_BASE_URL!).hostname !== "127.0.0.1") throw new Error("Synthetic setup is restricted to the disposable local stack.");
  const unit = randomUUID(), revision = randomUUID();
  const evidence = new Map(fixtures.sources.map(s => [s.id, randomUUID()]));
  const source = fixtures.knowledge_units.find(u => u.status === "approved")!;
  let raw = JSON.stringify(source.content);
  for (const [old, id] of evidence) raw = raw.replaceAll(old, id);
  const content = JSON.parse(raw);
  content.asset_code = "SIM-1";
  content.title = "Synthetic split review " + suffix;
  const ownerEmail = `owner-${suffix}@alvis.test`, expertEmail = `expert-${suffix}@alvis.test`;
  const org = sql(`select m.organization_id from memberships m join auth.users u on u.id=m.user_id where u.email=${literal(ownerEmail)} and m.role='admin' and m.revoked_at is null;`);
  if (!/^[a-f0-9-]{36}$/.test(org)) throw new Error("A unique actual signup-created test organization is required.");
  const sourceRows = fixtures.sources.map(s => `insert into sources(id,organization_id,kind,locator,text_content,synthetic) values(${literal(evidence.get(s.id)!)},${literal(org)},${literal(s.kind)},${literal(s.locator)},${literal(s.text)},true);`).join("\n");
  sql(`begin;
update organizations set demo_only=true where id=${literal(org)};
${sourceRows}
insert into knowledge_units(id,organization_id,asset_id,code) select ${literal(unit)},${literal(org)},id,'SPLIT-TEST' from assets where organization_id=${literal(org)} and code='SIM-1';
insert into knowledge_revisions(id,organization_id,unit_id,version,status,content,created_by) select ${literal(revision)},${literal(org)},${literal(unit)},1,'draft',${literal(JSON.stringify(content))}::jsonb,m.user_id from memberships m join auth.users u on u.id=m.user_id where m.organization_id=${literal(org)} and u.email=${literal(expertEmail)} and m.role='expert';
insert into revision_sources(organization_id,revision_id,source_id) select ${literal(org)},${literal(revision)},id from sources where organization_id=${literal(org)};
commit;`);
  const { expert, reviewer, worker } = pages;
  await expert.goto("/drafts/" + revision);
  await expect(expert.getByRole("heading", { name: content.title, exact: true })).toBeVisible({ timeout: 60000 });
  await expert.getByRole("textbox", { name: "reason text", exact: true }).fill(content.reason.text);
  await expert.getByRole("button", { name: "Save draft", exact: true }).click();
  await expect(expert.getByText("Saved. This page shows the persisted revision.")).toBeVisible();
  await expert.getByRole("button", { name: "Submit for review" }).click();
  await expect(expert.getByRole("button", { name: "Submit for review" })).toHaveCount(0);
  const denied = await worker.request.get(process.env.ALVIS_TEST_BASE_URL + "/api/sources/" + [...evidence.values()][0]);
  expect(denied.status()).toBe(404);
  await reviewer.goto("/review/" + revision);
  await expect(reviewer.getByRole("heading", { name: content.title, exact: true })).toBeVisible({ timeout: 60000 });
  for (const checkbox of await reviewer.getByRole("checkbox").all()) await checkbox.check();
  await reviewer.getByLabel("Review comment / field-specific feedback").fill("Synthetic browser test: checked the stored fixture evidence and simulation boundary. Not a real maintenance approval.");
  await reviewer.getByRole("button", { name: "Approve", exact: true }).click();
  await expect(reviewer.getByText("Saved. This page shows the persisted revision.")).toBeVisible();
  const indexing = readFileSync("../server/tests/integration/index-harness.sql", "utf8").replace("where stage='index' and status='queued'", `where organization_id=${literal(org)} and stage='index' and status='queued'`);
  sql(indexing + "\nselect pg_temp.flush_indexes();");
  await worker.goto("/knowledge");
  await worker.getByRole("link", { name: content.title, exact: true }).click();
  await expect(worker.getByRole("heading", { name: content.title, exact: true })).toBeVisible();
  await worker.getByRole("link", { name: "Source 1 ↗" }).first().click();
  await expect(worker.getByRole("heading", { name: "Original evidence" })).toBeVisible();
  await expect(worker.getByText("Synthetic example", { exact: false })).toBeVisible();
  await worker.reload();
  await expect(worker.getByRole("heading", { name: "Original evidence" })).toBeVisible();
  console.log("Passed actual split review/source journey with synthetic evidence and explicitly simulated indexing; no model or capture processing claimed.");
}
