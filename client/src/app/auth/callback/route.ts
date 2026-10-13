import { NextRequest, NextResponse } from "next/server";
import { serverFetch, responseCookies } from "@/lib/api-server";
export async function GET(request: NextRequest) {
  const result = await serverFetch("/api/auth/callback" + request.nextUrl.search, { redirect: "manual" });
  const response = NextResponse.redirect(result.headers.get("location") || new URL("/login?error=link", request.url));
  for (const c of responseCookies(result)) response.headers.append("Set-Cookie", c.raw);
  return response;
}
