import { NextRequest, NextResponse } from "next/server";
import { apiContext, failure } from "@/middleware/api";
import { contentErrors } from "@/validation/content";
export async function transition(
  request: NextRequest,
  id: string,
  operation: string,
) {
  const ctx = await apiContext(request, true);
  if (ctx.response) return ctx.response;
  const review =
    operation === "review" ||
    ["approve", "reject", "request_changes"].includes(operation);
  if (review ? ctx.member.role !== "reviewer" : ctx.member.role !== "expert")
    return failure("Insufficient role.", 403);
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return failure("Invalid JSON.", 422);
  }
  if (!body || typeof body !== "object" || Array.isArray(body))
    return failure("Expected a JSON object.", 422);
  if (operation === "review") {
    if (
      typeof body.decision !== "string" ||
      !["approve", "reject", "request_changes"].includes(body.decision)
    )
      return failure("Invalid review decision.", 422);
    operation = body.decision;
  }
  const { data: r } = await ctx.client
    .from("knowledge_revisions")
    .select("id,content_hash,version,created_by")
    .eq("organization_id", ctx.member.organization_id)
    .eq("id", id)
    .single();
  if (!r) return failure("Record unavailable.", 404);
  if (review ? r.created_by === ctx.user.id : r.created_by !== ctx.user.id)
    return failure("Insufficient role.", 403);
  if (
    body.expected_version !== r.version ||
    body.expected_hash !== r.content_hash
  )
    return failure("Stale revision. Refresh before continuing.", 409);
  if (operation === "save") {
    const { data: links } = await ctx.client
      .from("revision_sources")
      .select("source_id")
      .eq("organization_id", ctx.member.organization_id)
      .eq("revision_id", id);
    const errors = contentErrors(
      body.content,
      (links ?? []).map((x) => x.source_id),
    );
    if (errors.length) return failure(errors.join(" "), 422);
  }
  const { error } = await ctx.client.rpc("alvis_transition", {
    revision: id,
    operation,
    payload: operation === "save" ? body.content : null,
    expected_hash: body.expected_hash,
    comment: typeof body.comment === "string" ? body.comment : "",
    request_key: request.headers.get("Idempotency-Key") ?? "",
  });
  if (error)
    return failure(
      error.message.startsWith("ALVIS:")
        ? error.message.slice(6)
        : "Change unavailable.",
      error.message.includes("Content changed") ? 409 : 422,
    );
  return NextResponse.json(
    { revision_id: id },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
