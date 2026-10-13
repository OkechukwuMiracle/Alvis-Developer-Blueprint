import { NextRequest, NextResponse } from "next/server";
import { loaders } from "@/services/views";
import { sameOrigin, failure } from "@/middleware/api";
import { navigationResult } from "@/middleware/navigation";
export async function POST(request: NextRequest, { params }: { params: Promise<{ view: string[] }> }) {
  if (!sameOrigin(request)) return failure("Approved frontend origin required.", 403);
  const key = (await params).view.join("/");
  if (!Object.hasOwn(loaders, key)) return failure("Unavailable.", 404);
  try {
    const input = await request.json();
    const fn = loaders[key as keyof typeof loaders];
    const args = { ...input, params: Promise.resolve(input.params || {}), searchParams: Promise.resolve(input.searchParams || {}) };
    const result = await (fn as (args: typeof input) => Promise<Record<string, unknown>>)(args);
    if (result.user && typeof result.user === "object") {
      const user = result.user as { id: string; email?: string; email_confirmed_at?: string; user_metadata: { full_name?: string } };
      result.user = { id: user.id, email: user.email, email_confirmed_at: user.email_confirmed_at, user_metadata: { full_name: String(user.user_metadata.full_name || "") } };
    }
    return NextResponse.json(result, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return navigationResult(error); }
}
