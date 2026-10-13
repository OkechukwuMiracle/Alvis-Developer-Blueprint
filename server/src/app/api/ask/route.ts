import { NextRequest, NextResponse } from "next/server";
import { apiContext, failure } from "@/middleware/api";
import { retrieve, compose } from "@/services/answer-pipeline";
import { precheck } from "@/validation/learning";
import { evidenceIds } from "@/validation/content";
import { admin } from "@/services/capture-server";
export async function POST(request: NextRequest) {
  const ctx = await apiContext(request, true);
  if ("response" in ctx) return ctx.response;
  let body;
  try {
    body = await request.json();
  } catch {
    return failure("Invalid JSON.", 422);
  }
  if (
    typeof body.query !== "string" ||
    body.query.trim().length < 3 ||
    body.query.length > 1000 ||
    (body.asset_id !== null && typeof body.asset_id !== "string")
  )
    return failure(
      "Select an asset and enter a question of 3–1000 characters.",
      422,
    );
  const org = ctx.member.organization_id;
  const { data: session, error: reserveError } = await ctx.client.rpc(
    "alvis_reserve_ask",
    { org, asset: body.asset_id, question: body.query },
  );
  if (reserveError)
    return failure(
      "Question unavailable or rate limit reached.",
      reserveError.message.includes("rate limit") ? 429 : 422,
    );
  const started = Date.now();
  try {
    const gated = precheck(body.query, body.asset_id);
    const retrieval = gated
      ? { candidates: [], metrics: null }
      : await retrieve(ctx.client, org, body.asset_id, body.query);
    const ids = [
      ...new Set(retrieval.candidates.flatMap((r) => evidenceIds(r.content))),
    ];
    const { data: sources, error: sourceError } = await ctx.client
      .from("sources")
      .select("id,locator,text_content,start_ms,end_ms,synthetic")
      .eq("organization_id", org)
      .in("id", ids);
    if (sourceError) throw new Error("Source registry unavailable.");
    const result = await compose(
      body.query,
      body.asset_id,
      retrieval.candidates,
      sources ?? [],
    );
    for (const metrics of [retrieval.metrics, result.metrics])
      if (metrics) {
        const { error } = await admin()
          .from("ai_runs")
          .insert({
            organization_id: org,
            task: metrics === retrieval.metrics ? "query_embedding" : "answer",
            prompt_version: "v1",
            ...metrics,
          });
        if (error) throw new Error("Usage recording unavailable.");
      }
    const revisionIds = retrieval.candidates.map((r) => r.revision_id);
    const { error } = await ctx.client.rpc("alvis_record_answer", {
      session,
      answer: result.answer,
      ids: revisionIds,
    });
    if (error) return failure("Reviewed context changed. Ask again.", 409);
    const chosen =
      result.answer.mode === "answer"
        ? retrieval.candidates.find(
            (r) => r.revision_id === result.answer.claims[0]?.revision_id,
          )
        : null;
    return NextResponse.json(
      {
        id: session,
        answer: result.answer,
        guide_revision_id: chosen?.revision_id ?? null,
        retrieved_revision_ids: revisionIds,
        latency_ms: Date.now() - started,
        usage: [retrieval.metrics, result.metrics].filter(Boolean),
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch {
    return failure(
      "Ask is unavailable. Check indexing and server model configuration.",
      503,
    );
  }
}
