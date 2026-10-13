import { NextRequest, NextResponse } from "next/server";
import { apiContext, failure } from "@/middleware/api";
export async function GET(request: NextRequest) {
  const ctx = await apiContext(request);
  if (ctx.response) return ctx.response;
  const { data: units, error } = await ctx.client
    .from("knowledge_units")
    .select("id,asset_id,active_revision_id")
    .eq("organization_id", ctx.member.organization_id);
  if (error) return failure("Knowledge unavailable.", 503);
  const asset = request.nextUrl.searchParams.get("asset_id");
  const ids = (units ?? [])
    .filter((u) => !asset || u.asset_id === asset)
    .map((u) => u.active_revision_id)
    .filter(Boolean);
  const { data, error: e } = await ctx.client
    .from("knowledge_revisions")
    .select("id,unit_id,version,content,status,content_hash")
    .eq("organization_id", ctx.member.organization_id)
    .eq("status", "approved")
    .eq("index_ready", true)
    .in("id", ids);
  if (e) return failure("Knowledge unavailable.", 503);
  const query = request.nextUrl.searchParams.get("query")?.toLowerCase();
  return NextResponse.json(
    {
      knowledge: (data ?? []).filter(
        (r) =>
          !query || JSON.stringify(r.content).toLowerCase().includes(query),
      ),
    },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
