import { NextRequest, NextResponse } from "next/server";
import { apiContext, failure } from "@/middleware/api";
import { admin, downloadUrl } from "@/services/capture-server";
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ sourceId: string }> },
) {
  const ctx = await apiContext(request);
  if (ctx.response) return ctx.response;
  const { sourceId } = await params;
  const { data: s } = await ctx.client
    .from("sources")
    .select("id,capture_id,storage_key,start_ms")
    .eq("organization_id", ctx.member.organization_id)
    .eq("id", sourceId)
    .single();
  if (!s?.capture_id) return failure("Media unavailable.", 404);
  // Source RLS is the approval gate for workers. Never authorize using a supplied capture or object key.
  const { data: c } = await admin()
    .from("captures")
    .select("storage_key,duration_seconds")
    .eq("organization_id", ctx.member.organization_id)
    .eq("id", s.capture_id)
    .single();
  const key = s.storage_key ?? c?.storage_key;
  if (
    !key ||
    !key.startsWith(ctx.member.organization_id + "/") ||
    !key.includes("/verified/")
  )
    return failure("Media unavailable.", 404);
  try {
    return NextResponse.json(
      { url: await downloadUrl(key), start_ms: s.start_ms ?? 0 },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch {
    return failure("Private media temporarily unavailable.", 503);
  }
}
