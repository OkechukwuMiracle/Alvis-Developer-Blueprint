import { NextRequest, NextResponse } from "next/server";
import { db, configured } from "@/database/supabase";
import { apiContext, failure } from "@/middleware/api";
import { embeddings } from "@/services/openai";
import { compose } from "@/services/answer-pipeline";
import { precheck, DIMENSIONS, type Candidate } from "@/validation/learning";

const uuid = (value: unknown): value is string => typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
export async function GET(request: NextRequest) {
  if (!configured()) return failure("Community database is not configured.", 503);
  const client = await db();
  const p = request.nextUrl.searchParams;
  if (p.has("profile")) {
    if (!uuid(p.get("profile"))) return failure("Unavailable.", 404);
    const { data, error } = await client.from("community_profiles").select("user_id,display_name,role,bio").eq("user_id", p.get("profile")).maybeSingle();
    if (error || !data) return failure("Unavailable.", 404);
    return NextResponse.json(data, { headers: { "Cache-Control": "no-store" } });
  }
  if ((p.has("id") && !uuid(p.get("id"))) || (p.has("contributor") && !uuid(p.get("contributor")))) return failure("Unavailable.", 404);
  const { data, error } = await client.rpc("alvis_public_library", { query_text: (p.get("q") || "").slice(0, 1000), topic_filter: (p.get("topic") || "").slice(0, 100), equipment_filter: (p.get("equipment") || "").slice(0, 100), contributor: p.get("contributor") || null, publication: p.get("id") || null });
  if (error) return failure("Public library unavailable. Apply community migrations and complete indexing.", 503);
  return NextResponse.json(data, { headers: { "Cache-Control": "no-store" } });
}
export async function POST(request: NextRequest) {
  const ctx = await apiContext(request, true);
  if ("response" in ctx) return ctx.response;
  if (ctx.member.organizations.scope_kind !== "personal") return failure("Switch to your Personal workspace first.", 403);
  if (!ctx.user.email_confirmed_at) return failure("Verify your account email before using authenticated community features.", 403);
  try {
    const body = await request.json();
    const rpc = async (name: string, args: Record<string, unknown>) => {
      const { data, error } = await ctx.client.rpc(name, args);
      if (error) throw new Error(error.message.startsWith("ALVIS:") ? error.message.slice(7) : "Community request unavailable. Check migrations.");
      return data;
    };
    if (body.operation === "dashboard") {
      const { data: mine, error } = await ctx.client.from("community_publications").select("id,revision_id,state,topic,equipment,content,content_hash,excerpts,assigned_reviewer,reviewed_at").eq("author_id", ctx.user.id).order("created_at", { ascending: false }).limit(50);
      if (error) throw new Error("Community dashboard unavailable.");
      const { data: feedback } = await ctx.client.rpc("alvis_community_feedback");
      return NextResponse.json({ mine: mine || [], feedback: feedback || [], role: ctx.member.role });
    }
    if (body.operation === "queue") {
      if (ctx.member.role !== "reviewer") return failure("Community reviewer required.", 403);
      return NextResponse.json(await rpc("alvis_community_queue", {}));
    }
    if (body.operation === "submit") {
      if (!uuid(body.revision_id) || !Array.isArray(body.selections)) return failure("Select draft evidence and preview it before sharing.", 422);
      return NextResponse.json({ id: await rpc("alvis_submit_community", { revision: body.revision_id, expected_hash: body.expected_hash, selections: body.selections, topic: body.topic, equipment: body.equipment, share_ack: body.share_ack === true, evidence_ack: body.evidence_ack === true }) });
    }
    if (body.operation === "review") {
      if (!uuid(body.id) || !["claim", "approve", "request_changes", "reject"].includes(body.decision)) return failure("Invalid review decision.", 422);
      return NextResponse.json({ id: await rpc("alvis_review_community", { publication: body.id, operation: body.decision, expected_hash: body.expected_hash || "", reason: body.reason || "" }) });
    }
    if (body.operation === "withdraw") {
      if (!uuid(body.id)) return failure("Unavailable.", 404);
      return NextResponse.json({ id: await rpc("alvis_withdraw_community", { publication: body.id }) });
    }
    if (body.operation === "ask") {
      if (typeof body.query !== "string" || body.query.trim().length < 3 || body.query.length > 1000 || (body.equipment !== null && (typeof body.equipment !== "string" || body.equipment.length > 100))) return failure("Describe your problem and equipment context.", 422);
      const started = Date.now();
      await rpc("alvis_reserve_community_question", { question: body.query });
      const gate = precheck(body.query, body.equipment);
      let candidates: Candidate[] = [];
      let embeddingUsage = null;
      if (!gate) {
        if (await rpc("alvis_vector_dimensions", {}) !== DIMENSIONS) throw new Error("Embedding dimensions mismatch.");
        const vector = await embeddings([body.query]);
        embeddingUsage = vector.metrics;
        candidates = await rpc("alvis_public_search", { query_text: body.query, query_vector: JSON.stringify(vector.vectors[0]), model: vector.metrics.model, equipment_filter: body.equipment || "" });
      }
      // Excerpts come only from currently visible explicit public projections.
      const publications = (await Promise.all(candidates.map(c => rpc("alvis_public_library", { query_text: "", topic_filter: "", equipment_filter: "", contributor: null, publication: c.code })))).flat();
      const allowed = (publications as { revision_id: string; excerpts: unknown[] }[]).filter(p => candidates.some(c => c.revision_id === p.revision_id));
      candidates = candidates.filter(c => allowed.some(p => p.revision_id === c.revision_id));
      const result = await compose(body.query, body.equipment, candidates, allowed.flatMap(p => p.excerpts), "community");
      const id = await rpc("alvis_community_record_answer", { question: body.query, response: result.answer, revisions: candidates.map(c => c.revision_id) });
      return NextResponse.json({ id, answer: result.answer, retrieved_revision_ids: candidates.map(c => c.revision_id), sources: allowed, latency_ms: Date.now() - started, usage: [embeddingUsage, result.metrics].filter(Boolean) });
    }
    const learning = ["guide_start", "guide_get", "guide_advance", "lesson_get", "lesson_generate", "lesson_queue", "lesson_review", "attempt", "history", "lessons"];
    if (learning.includes(body.operation)) {
      if (!["history", "lessons", "lesson_queue"].includes(body.operation) && !uuid(body.id)) return failure("Unavailable.", 404);
      return NextResponse.json(await rpc("alvis_community_learning", { operation: body.operation, entity: body.id || null, body: body.body || {} }));
    }
    return failure("Unknown community operation.", 422);
  } catch (error) {
    return failure(error instanceof Error && !/fetch|token|key|password/i.test(error.message) ? error.message : "Community service unavailable. Try again.", 409);
  }
}
