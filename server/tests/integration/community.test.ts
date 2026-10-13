import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import fixtures from "../../../alvis-blueprint/data/manufacturing-fixtures.json";
import lessonFixture from "../../../alvis-blueprint/data/demo-lesson.json";
import { evidenceIds, type Content } from "../../src/validation/content";
import { completeSyntheticLesson } from "../../../scripts/testing/synthetic-lesson.mjs";
import type { Lesson } from "../../src/validation/learning";

test("PostgreSQL personal/community isolation and reviewed learning", { skip: !process.env.ALVIS_TEST_DB_CONTAINER }, () => {
  const content = structuredClone(fixtures.knowledge_units[0].content) as Content;
  content.asset_code = "PERSONAL";
  const ids = evidenceIds(content);
  const quote = (text: string) => text.replaceAll("'", "''");
  const sourceSQL = ids.map(id => {
    const source = fixtures.sources.find(s => s.id === id)!;
    return `insert into sources(id,organization_id,capture_id,kind,locator,text_content,synthetic) values('${id}',:'scope','ac100000-0000-4000-8000-000000000001','manual','Synthetic excerpt','${quote(source.text)}',true);`;
  }).join("\n");
  const selections = ids.map(id => ({ id, excerpt: fixtures.sources.find(s => s.id === id)!.text }));
  const lesson = completeSyntheticLesson({ ...lessonFixture.content, revision_id: "ac300000-0000-4000-8000-000000000001" }, content) as Lesson;
  const responses = Object.fromEntries(lesson.questions.map(q => [q.id, q.correct_index]));
  const sql = readFileSync("tests/integration/community.sql", "utf8")
    .replace("-- __SOURCES__", sourceSQL)
    .replaceAll("__CONTENT__", quote(JSON.stringify(content)))
    .replaceAll("__SELECTIONS__", quote(JSON.stringify(selections)))
    .replaceAll("__LESSON__", quote(JSON.stringify(lesson)))
    .replaceAll("__RESPONSES__", quote(JSON.stringify(responses)))
    .replace("begin;", () => "begin;\n" + readFileSync("tests/integration/index-harness.sql", "utf8"));
  const result = spawnSync("docker", ["exec", "-i", process.env.ALVIS_TEST_DB_CONTAINER!, "psql", "-U", "postgres", "-d", process.env.ALVIS_TEST_DB_NAME || "alvis_community_test", "-v", "ON_ERROR_STOP=1"], { input: sql, encoding: "utf8", timeout: 60000 });
  assert.equal(result.status, 0, result.stdout + result.stderr + (result.error?.message || ""));
  assert.match(result.stdout, /PASS: community/);
});
