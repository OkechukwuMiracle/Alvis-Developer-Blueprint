import { NextRequest, NextResponse } from "next/server";
import { apiContext, failure } from "@/middleware/api";
import { downloadUrl } from "@/services/capture-server";
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ captureId: string }> },
) {
  const ctx = await apiContext(request);
  if (ctx.response) return ctx.response;
  const { captureId } = await params;
  const { data: c } = await ctx.client
    .from("captures")
    .select("*")
    .eq("organization_id", ctx.member.organization_id)
    .eq("id", captureId)
    .single();
  if (!c) return failure("Capture unavailable.", 404);
  const results = await Promise.all([
    ctx.client
      .from("sources")
      .select("id,kind,locator,text_content,start_ms,end_ms,evidence_version")
      .eq("organization_id", ctx.member.organization_id)
      .eq("capture_id", c.id)
      .order("start_ms"),
    ctx.client
      .from("processing_jobs")
      .select(
        "id,stage,status,attempts,error_code,next_attempt_at,completed_at,created_at",
      )
      .eq("organization_id", ctx.member.organization_id)
      .eq("capture_id", c.id)
      .order("created_at"),
    ctx.client
      .from("debrief_items")
      .select("*")
      .eq("organization_id", ctx.member.organization_id)
      .eq("capture_id", c.id)
      .order("sequence"),
    ctx.client
      .from("knowledge_revisions")
      .select("id,unit_id,status,version,content,content_hash")
      .eq("organization_id", ctx.member.organization_id)
      .eq("id", c.current_revision_id ?? "00000000-0000-4000-8000-000000000000")
      .maybeSingle(),
    ctx.client
      .from("extraction_proposals")
      .select("*")
      .eq("organization_id", ctx.member.organization_id)
      .eq("capture_id", c.id)
      .eq("generation", c.generation)
      .eq("status", "proposed")
      .order("created_at", { ascending: false }),
  ]);
  if (results.some((r) => r.error))
    return failure("Capture data unavailable. Check migrations.", 503);
  let mediaUrl: string | null = null;
  if (
    request.nextUrl.searchParams.get("media") === "1" &&
    c.storage_key &&
    c.duration_seconds
  ) {
    try {
      mediaUrl = await downloadUrl(c.storage_key);
    } catch {
      /* State/evidence remain available if storage temporarily fails. */
    }
  }
  return NextResponse.json(
    {
      capture: {
        id: c.id,
        title: c.title,
        task: c.task,
        state: c.state,
        duration_seconds: c.duration_seconds,
        generation: c.generation,
        accepted_generation: c.accepted_generation,
        transcript_version: c.transcript_version,
        owner_id: c.owner_id,
      },
      sources: results[0].data,
      jobs: results[1].data,
      questions: results[2].data,
      revision: results[3].data,
      proposals: results[4].data,
      mediaUrl,
      editable: ctx.member.role === "expert" && c.owner_id === ctx.user.id,
    },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
