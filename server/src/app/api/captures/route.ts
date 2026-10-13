import { NextRequest, NextResponse } from "next/server";
import { apiContext, failure } from "@/middleware/api";
import { uploadErrors, CONSENT_VERSION } from "@/validation/capture-contract";
import { uploadUrl } from "@/services/capture-server";
export async function POST(request: NextRequest) {
  const ctx = await apiContext(request, true);
  if (ctx.response) return ctx.response;
  if (ctx.member.role !== "expert")
    return failure("Expert role required.", 403);
  try {
    const body = await request.json();
    if (
      !body ||
      typeof body !== "object" ||
      uploadErrors(body.mime, body.bytes).length ||
      body.consent_version !== CONSENT_VERSION ||
      body.consent !== true ||
      typeof body.title !== "string" ||
      typeof body.task !== "string"
    )
      return failure(
        "Valid recording, asset, title, task and consent required.",
        422,
      );
    if (
      !process.env.SUPABASE_S3_ACCESS_KEY_ID ||
      !process.env.SUPABASE_S3_SECRET_ACCESS_KEY ||
      !process.env.SUPABASE_S3_ENDPOINT ||
      !process.env.SUPABASE_S3_REGION
    )
      return failure("Private storage S3 configuration is required.", 503);
    const { data: asset } = await ctx.client
      .from("assets")
      .select("id")
      .eq("organization_id", ctx.member.organization_id)
      .eq("id", body.asset_id)
      .single();
    if (!asset) return failure("Asset unavailable.", 404);
    if (
      typeof body.request_id !== "string" ||
      !/^[0-9a-f-]{36}$/i.test(body.request_id) ||
      typeof body.checksum !== "string" ||
      !/^[a-f0-9]{64}$/.test(body.checksum)
    )
      return failure(
        "A stable capture request ID and recording checksum are required.",
        422,
      );
    const { data: id, error } = await ctx.client.rpc("alvis_begin_capture", {
      asset: asset.id,
      title: body.title,
      task: body.task,
      consent: CONSENT_VERSION,
      request_id: body.request_id,
      recording_hash: body.checksum,
    });
    if (error)
      return failure(
        "Capture cannot be created. Check limits and database setup.",
        422,
      );
    const { data: upload, error: uploadError } = await ctx.client.rpc(
      "alvis_capture_command",
      {
        capture: id,
        operation: "upload",
        body: { mime: body.mime, bytes: body.bytes },
      },
    );
    if (uploadError) return failure("Private upload unavailable.", 422);
    return NextResponse.json(
      {
        capture_id: id,
        upload_id: upload.id,
        url: await uploadUrl(upload),
        expires_at: upload.expires_at,
      },
      { status: 201, headers: { "Cache-Control": "private, no-store" } },
    );
  } catch {
    return failure("Private upload setup unavailable or request invalid.", 422);
  }
}
