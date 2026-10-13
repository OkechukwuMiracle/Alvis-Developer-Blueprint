import { NextRequest, NextResponse } from "next/server";
import { cors } from "@/middleware/cors";
export function proxy(request: NextRequest) {
  const result = cors(request);
  if (result instanceof NextResponse) return result;
  // Authentication and refresh happen in the route's Supabase client, with HttpOnly cookies.
  const response = NextResponse.next();
  result.forEach((value, key) => response.headers.set(key, value));
  return response;
}
export const config = { matcher: ["/api/:path*"] };
