import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { configured, db } from "@/database/supabase";
import { cookies } from "next/headers";
import { originAllowed } from "@/config";
import { workspaces } from "@/database/workspaces";
import { DatabaseSetupError } from "@/database/errors";
export function failure(message: string, status: number) {
  return NextResponse.json(
    {
      code:
        status === 404
          ? "UNAVAILABLE"
          : status === 401
            ? "UNAUTHENTICATED"
            : status === 403
              ? "FORBIDDEN"
              : status === 409
                ? "CONFLICT"
                : "INVALID_REQUEST",
      message,
      request_id: crypto.randomUUID(),
    },
    { status, headers: { "Cache-Control": "private, no-store" } },
  );
}
export async function apiContext(request: NextRequest, write = false) {
  if (write && !sameOrigin(request))
    return { response: failure("Approved frontend origin required.", 403) } as const;
  if (!configured())
    return { response: failure("Supabase is not configured.", 503) } as const;
  const client = await db();
  const {
    data: { user },
    error,
  } = await client.auth.getUser();
  if (error || !user)
    return { response: failure("Sign in required.", 401) } as const;
  const selected = (await cookies()).get("alvis-organization")?.value;
  let data;
  try { data = (await workspaces(client, user.id, selected)).member; }
  catch (error) { return { response: failure(error instanceof DatabaseSetupError ? error.message : "Workspace service unavailable. Try again.", 503) } as const; }
  if (!data)
    return {
      response: failure("Workspace membership required.", 403),
    } as const;
  return { client, user, member: data } as const;
}
export function sameOrigin(request: NextRequest) {
  return originAllowed(request.headers.get("origin"));
}
