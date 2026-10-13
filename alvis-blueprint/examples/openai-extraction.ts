// Integration sketch, not a running app. Validate live API behavior during implementation.
import OpenAI from "openai";
import { readFileSync } from "node:fs";
const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
export async function extract(evidence: unknown) {
  const schema = JSON.parse(readFileSync("schemas/knowledge-unit.schema.json", "utf8"));
  delete schema.$schema;
  const common = readFileSync("prompts/common.md", "utf8");
  const instruction = readFileSync("prompts/extract.md", "utf8");
  const response = await client.responses.create({
    model: process.env.OPENAI_MODEL_TEXT || "gpt-5.6-terra",
    store: false,
    input: [
      { role: "developer", content: common + "\n" + instruction },
      { role: "user", content: JSON.stringify(evidence) }
    ],
    text: { format: { type: "json_schema", name: "alvis_knowledge_unit", strict: true, schema } }
  });
  if (response.status !== "completed") throw new Error("MODEL_RESPONSE_INCOMPLETE");
  if (response.output.some(item => item.type === "message" && item.content.some(c => c.type === "refusal")))
    throw new Error("MODEL_REFUSAL");
  if (!response.output_text) throw new Error("MODEL_OUTPUT_EMPTY");
  // Use Ajv/Zod and evidence reference checks before accepting this as a draft.
  return JSON.parse(response.output_text);
}
