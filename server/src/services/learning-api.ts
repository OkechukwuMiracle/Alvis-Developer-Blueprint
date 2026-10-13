import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { apiContext, failure } from "@/middleware/api";
export async function learningRpc(
  request: NextRequest,
  operation: string,
  entity: string | null,
  body: unknown = {},
  write = false,
) {
  const ctx = await apiContext(request, write);
  if ("response" in ctx) return ctx.response;
  const { data, error } = await ctx.client.rpc("alvis_learning_command", {
    org: ctx.member.organization_id,
    operation,
    entity,
    body,
  });
  if (error)
    return failure(
      error.message.startsWith("ALVIS:")
        ? error.message.slice(7)
        : "Learning request unavailable.",
      error.message.includes("Refresh") || error.message.includes("active")
        ? 409
        : 422,
    );
  return NextResponse.json(data, {
    headers: { "Cache-Control": "private, no-store" },
  });
}
export async function jsonBody(request: NextRequest) {
  try {
    return await request.json();
  } catch {
    return null;
  }
}
