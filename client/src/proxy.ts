import { NextRequest, NextResponse } from "next/server";
import { apiFetch } from "@/lib/api-client";
import { responseCookies } from "@/lib/api-server";
export async function proxy(request: NextRequest) {
  // PKCE cookies are hostname-bound. Start email flows on the same host that
  // the server uses in its confirmation links (localhost and 127.0.0.1 differ).
  const site = process.env.NEXT_PUBLIC_SITE_URL;
  if (site && ["/signup", "/verify-email", "/forgot-password"].includes(request.nextUrl.pathname)) {
    const canonical = new URL(site);
    // Next may normalize nextUrl to the development server's internal hostname.
    // Compare the incoming Host header so a request on the canonical host does
    // not redirect back to itself. The destination is always configured, never
    // constructed from an untrusted Host header.
    const incomingHost = request.headers.get("host") || request.nextUrl.host;
    if (incomingHost.toLowerCase() !== canonical.host.toLowerCase() && request.method === "GET") {
      canonical.pathname = request.nextUrl.pathname;
      canonical.search = request.nextUrl.search;
      return NextResponse.redirect(canonical);
    }
  }
  // Transport-only refresh: the API owns authentication, validation and cookie attributes.
  try {
    const result = await apiFetch("/api/auth/identity", { headers: { Cookie: request.headers.get("cookie") || "" } });
    const refreshed = responseCookies(result);
    for (const c of refreshed) request.cookies.set(c.name, c.value);
    const response = NextResponse.next({ request });
    for (const c of refreshed) response.headers.append("Set-Cookie", c.raw);
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  } catch { return NextResponse.next(); }
}
export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico|opengraph-image).*)"] };
