import { createHash, randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { apiContext, failure } from "@/middleware/api";
import { siteUrl } from "@/services/auth-flow";
import { deliverInvitation } from "@/services/invitation-mail";
import { emailAddress, INVITE_ROLES } from "@/validation/onboarding";
import { invitationError } from "@/validation/invitation-errors";
export async function POST(request: NextRequest) {
  const ctx = await apiContext(request, true);
  if ("response" in ctx) return ctx.response;
  if (ctx.member.role !== "admin")
    return failure("Administrator required.", 403);
  try {
    const body = await request.json();
    const org = ctx.member.organization_id;
    if (["invite", "resend", "revoke"].includes(body.operation)) {
      const origin = body.operation !== "revoke" ? siteUrl() : "";
      if (
        body.operation === "invite" &&
        (!emailAddress(body.email) || !INVITE_ROLES.includes(body.role))
      )
        return failure("Choose a valid email and invited role.", 400);
      const token = randomBytes(32).toString("hex");
      const { data: id, error } = await ctx.client.rpc("alvis_invitation", {
        org,
        operation: body.operation === "invite" ? "create" : body.operation,
        payload: {
          id: body.id,
          email: emailAddress(body.email),
          role: body.role,
          request_id: body.request_id,
          token_hash: createHash("sha256").update(token).digest("hex"),
        },
      });
      if (error || !id) {
        const problem = invitationError(error || {});
        console.warn("Invitation administration failed", { code: error?.code, status: problem.status });
        return failure(problem.message, problem.status);
      }
      if (body.operation === "revoke") return NextResponse.json({ ok: true });
      // A repeated create may return an existing ID. Never send a newly generated token unless its hash is the persisted one.
      const { data: mail, error: mailError } = await ctx.client.rpc(
        "alvis_invitation_delivery",
        {
          org,
          invitation_id: id,
          expected_hash: createHash("sha256").update(token).digest("hex"),
        },
      );
      if (mailError || !mail)
        return NextResponse.json({
          ok: true,
          delivery: "duplicate",
          message:
            "Invitation already created. Use Resend to issue a fresh link.",
        });
      const { data: organization } = await ctx.client
        .from("organizations")
        .select("name")
        .eq("id", org)
        .single();
      const url = origin + "/invite#token=" + token;
      const delivery = await deliverInvitation(
        mail,
        url,
        organization?.name || "your workspace",
      );
      return NextResponse.json(
        { ok: true, delivery, url },
        { headers: { "Cache-Control": "private, no-store" } },
      );
    }
    if (!["asset", "role", "remove"].includes(body.operation))
      return failure("Unknown operation.", 400);
    const { error } = await ctx.client.rpc("alvis_admin_command", {
      org,
      operation: body.operation,
      payload: body,
    });
    if (error)
      return failure(
        "Unable to update workspace. Check details and permissions; you cannot change your own membership.",
        409,
      );
    return NextResponse.json({ ok: true });
  } catch {
    return failure(
      "Workspace update unavailable. Check configuration and try again.",
      400,
    );
  }
}
