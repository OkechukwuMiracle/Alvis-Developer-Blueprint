import { NextRequest, NextResponse } from "next/server";
import { learningRpc, jsonBody } from "@/services/learning-api";
import { apiContext, failure } from "@/middleware/api";
export async function GET(request: NextRequest) {
  const ctx = await apiContext(request);
  if ("response" in ctx) return ctx.response;
  const { data, error } = await ctx.client.rpc("alvis_learning_history", {
    org: ctx.member.organization_id,
  });
  return error
    ? failure("Learning history unavailable.", 503)
    : NextResponse.json(data, {
        headers: { "Cache-Control": "private, no-store" },
      });
}
export async function POST(request: NextRequest) {
  const b = await jsonBody(request);
  if (
    !["lesson_generate", "retire", "request_review", "retry_learning"].includes(
      b?.operation,
    )
  )
    return failure("Invalid operation.", 422);
  return learningRpc(request, b.operation, b.entity, b.body ?? {}, true);
}
