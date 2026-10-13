import { NextRequest, NextResponse } from "next/server";
import { configured, db } from "@/database/supabase";
import { safeNext } from "@/validation/content";
import { siteUrl } from "@/services/auth-flow";
import { completeSignup } from "@/services/signup-completion";
export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  if (configured() && code) {
    const client = await db();
    const { data, error } = await client.auth.exchangeCodeForSession(code);
    if (!error && data.user)
      return NextResponse.redirect(
        new URL(
          await completeSignup(client, data.user, safeNext(request.nextUrl.searchParams.get("next") || "/home")),
          siteUrl(),
        ),
      );
  }
  return NextResponse.redirect(new URL("/login?error=link", siteUrl()));
}
