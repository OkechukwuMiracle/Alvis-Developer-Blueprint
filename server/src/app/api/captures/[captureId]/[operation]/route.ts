import { NextRequest, NextResponse } from "next/server";
import { apiContext, failure } from "@/middleware/api";
import { uploadUrl, checkUpload } from "@/services/capture-server";
import { uploadErrors } from "@/validation/capture-contract";
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ captureId: string; operation: string }> },
) {
  const ctx = await apiContext(request, true);
  if (ctx.response) return ctx.response;
  if (ctx.member.role !== "expert")
    return failure("Expert role required.", 403);
  const { captureId, operation } = await params;
  if (
    ![
      "upload",
      "complete",
      "retry",
      "transcript",
      "debrief",
      "regenerate",
      "accept",
      "dismiss",
    ].includes(operation)
  )
    return failure("Unavailable operation.", 404);
  const { data: c } = await ctx.client
    .from("captures")
    .select("id,owner_id")
    .eq("organization_id", ctx.member.organization_id)
    .eq("id", captureId)
    .eq("owner_id", ctx.user.id)
    .single();
  if (!c) return failure("Capture unavailable.", 404);
  try {
    const body = await request.json();
    if (!body || typeof body !== "object" || Array.isArray(body))
      return failure("Expected a JSON object.", 422);
    if (
      operation === "upload" &&
      uploadErrors(body.mime, body.bytes, body.kind === "audio").length
    )
      return failure("Unsupported file type or size.", 422);
    if (operation === "complete") {
      const key = request.headers.get("Idempotency-Key");
      if (!key) return failure("Idempotency-Key required.", 422);
      body.request_key = key;
      const { data: upload } = await ctx.client
        .from("capture_uploads")
        .select("*")
        .eq("organization_id", ctx.member.organization_id)
        .eq("capture_id", captureId)
        .eq("id", body.upload_id)
        .single();
      if (!upload) return failure("Upload unavailable.", 404);
      if (!upload.complete) await checkUpload(upload);
    }
    const { data, error } = await ctx.client.rpc("alvis_capture_command", {
      capture: c.id,
      operation,
      body,
    });
    if (error)
      return failure(
        error.message.startsWith("ALVIS:")
          ? error.message.slice(6)
          : "Capture change unavailable.",
        error.message.includes("Stale") ? 409 : 422,
      );
    const result =
      operation === "upload"
        ? {
            upload_id: data.id,
            url: await uploadUrl(data),
            expires_at: data.expires_at,
          }
        : data;
    return NextResponse.json(result, {
      status: ["complete", "regenerate", "transcript"].includes(operation)
        ? 202
        : 200,
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch {
    return failure("Capture request or private upload unavailable.", 422);
  }
}
