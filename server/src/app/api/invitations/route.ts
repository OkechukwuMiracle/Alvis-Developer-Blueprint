import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { configured, db } from "@/database/supabase";
import { failure, sameOrigin } from "@/middleware/api";
import { privateCookie } from "@/services/auth-flow";
import { validInvitationToken } from "@/validation/onboarding";
import { invitationError } from "@/validation/invitation-errors";
export async function POST(request: NextRequest) {
  if (!sameOrigin(request))
    return failure("Same-origin request required.", 403);
  try {
    const body = await request.json();
    const jar = await cookies();
    if (body.operation === "remember") {
      if (!validInvitationToken(body.token))
        return failure("Invalid invitation link.", 400);
      jar.set("alvis-invitation", body.token, {
        ...privateCookie,
        maxAge: 7 * 24 * 60 * 60,
      });
      return NextResponse.json({ ok: true });
    }
    if (body.operation !== "accept") return failure("Invalid operation.", 400);
    if (!configured()) return failure("Authentication unavailable.", 503);
    const client = await db();
    const {
      data: { user },
    } = await client.auth.getUser();
    if (!user) return failure("Sign in with the invited email first.", 401);
    if (!user.email_confirmed_at)
      return failure("Verify the invited email address before accepting this invitation.", 403);
    const name = String(body.name || "").trim();
    if (name.length < 2 || name.length > 100)
      return failure("Enter your full name using 2–100 characters.", 400);
    const token = jar.get("alvis-invitation")?.value;
    if (!validInvitationToken(token))
      return failure("Open your invitation link first.", 400);
    const { data: org, error } = await client.rpc("alvis_accept_invitation", {
      token_hash: createHash("sha256").update(token).digest("hex"),
      person_name: name,
    });
    if (error || !org) {
      const problem = invitationError(error || {});
      console.warn("Invitation acceptance failed", { code: error?.code, status: problem.status });
      return failure(problem.message, problem.status);
    }
    jar.delete("alvis-invitation");
    jar.set("alvis-organization", org, {
      ...privateCookie,
      maxAge: 30 * 24 * 60 * 60,
    });
    return NextResponse.json(
      { next: "/home" },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch {
    return failure("Invitation unavailable. Try again.", 400);
  }
}
