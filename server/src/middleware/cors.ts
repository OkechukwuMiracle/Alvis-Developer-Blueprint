import { NextRequest, NextResponse } from "next/server";
import { originAllowed } from "@/config";
export const methods = ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"];
export const allowedHeaders = ["content-type", "authorization", "idempotency-key"];
export function cors(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (origin && !originAllowed(origin)) return new NextResponse(null, { status: 403, headers: { Vary: "Origin", "Cache-Control": "no-store" } });
  const headers = new Headers({ Vary: "Origin", "Cache-Control": "private, no-store" });
  if (origin) {
    headers.set("Access-Control-Allow-Origin", origin);
    headers.set("Access-Control-Allow-Credentials", "true");
  }
  if (request.method === "OPTIONS") {
    const method = request.headers.get("access-control-request-method");
    const requested = (request.headers.get("access-control-request-headers") || "").split(",").map(h => h.trim().toLowerCase()).filter(Boolean);
    if (!origin || !method || !methods.includes(method) || requested.some(h => !allowedHeaders.includes(h)))
      return new NextResponse(null, { status: 403, headers: { Vary: "Origin" } });
    headers.set("Access-Control-Allow-Methods", methods.join(", "));
    headers.set("Access-Control-Allow-Headers", allowedHeaders.join(", "));
    headers.set("Access-Control-Max-Age", "600");
    headers.set("Vary", "Origin, Access-Control-Request-Method, Access-Control-Request-Headers");
    return new NextResponse(null, { status: 204, headers });
  }
  return headers;
}
