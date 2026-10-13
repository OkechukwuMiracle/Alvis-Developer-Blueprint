import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { configured, db } from "@/database/supabase";
import { failure, sameOrigin } from "@/middleware/api";
import { recoveryProof } from "@/services/auth-flow";
import { safeNext } from "@/validation/content";
import { completeSignup } from "@/services/signup-completion";
import { verificationError } from "@/validation/verification-error";
export async function POST(request: NextRequest) {
  if (!sameOrigin(request))
    return failure("Same-origin request required.", 403);
  if (!configured()) return failure("Authentication unavailable.", 503);
  try {
    const body = await request.json();
    // Supabase's default confirmation template redirects PKCE signups with a
    // code. Exchange it server-side using the original browser's verifier cookie.
    if (typeof body.code === "string") {
      if (!/^[a-zA-Z0-9_-]{16,512}$/.test(body.code) || body.token_hash)
        return failure("Invalid verification link.", 400);
      const client = await db();
      const verifier = (await cookies()).getAll().some(c => c.name.startsWith("sb-") && c.name.includes("code-verifier"));
      if (!verifier) return failure("This email uses browser-bound verification, but the signup cookie is missing. Open the link in the browser and hostname used to sign up. If the email is already verified, sign in instead. For verification across browsers, configure the Alvis token-hash email template.", 400);
      const { data, error } = await client.auth.exchangeCodeForSession(body.code);
      if (error || !data.user?.email_confirmed_at) {
        console.warn("Email verification failed", { code: error?.code || "unconfirmed_email" });
        return failure(verificationError(error?.code), 400);
      }
      const jar = await cookies();
      const next = await completeSignup(client, data.user);
      jar.delete("alvis-next");
      // A signup code is never sufficient to issue a password-recovery proof.
      return NextResponse.json({ next }, { headers: { "Cache-Control": "no-store" } });
    }
    if (
      typeof body.token_hash !== "string" ||
      body.token_hash.length < 32 ||
      body.token_hash.length > 128 ||
      !/^[a-zA-Z0-9_-]+$/.test(body.token_hash) ||
      !["email", "signup", "recovery"].includes(body.type)
    )
      return failure("Invalid verification link.", 400);
    if (
      body.type === "recovery" &&
      (!process.env.ALVIS_AUTH_FLOW_SECRET ||
        process.env.ALVIS_AUTH_FLOW_SECRET.length < 32)
    )
      return failure("Password recovery is not configured.", 503);
    const client = await db();
    const { data, error } = await client.auth.verifyOtp({
      token_hash: body.token_hash,
      type: body.type,
    });
    if (error || !data.user) {
      console.warn("Email verification failed", { code: error?.code || "missing_user" });
      return failure(verificationError(error?.code), 400);
    }
    const jar = await cookies();
    let next = safeNext(jar.get("alvis-next")?.value || "/home");
    jar.delete("alvis-next");
    if (body.type === "recovery") {
      await recoveryProof(data.user.id);
      next = "/reset-password";
    } else {
      next = await completeSignup(client, data.user, next);
    }
    return NextResponse.json(
      { next },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return failure("The verification service is unavailable. Check the API connection and try again. If your email was confirmed before this interruption, sign in instead.", 503);
  }
}
