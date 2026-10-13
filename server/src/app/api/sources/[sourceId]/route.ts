import { NextRequest, NextResponse } from "next/server";
import { apiContext, failure } from "@/middleware/api";
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ sourceId: string }> },
) {
  const ctx = await apiContext(request);
  if (ctx.response) return ctx.response;
  const { sourceId } = await params;
  const { data, error } = await ctx.client
    .from("sources")
    .select("id,kind,locator,text_content,start_ms,end_ms,synthetic")
    .eq("organization_id", ctx.member.organization_id)
    .eq("id", sourceId)
    .single();
  if (error || !data) return failure("Record unavailable.", 404);
  return NextResponse.json(data, {
    headers: { "Cache-Control": "private, no-store" },
  });
}
