import { NextResponse } from "next/server";
import { safeNext } from "@/validation/content";
import { DatabaseSetupError } from "@/database/errors";
export function navigationResult(error: unknown) {
  if (error instanceof DatabaseSetupError)
    return NextResponse.json({ code: "DATABASE_SETUP_REQUIRED", message: error.message }, { status: 503, headers: { "Cache-Control": "no-store" } });
  const digest = error && typeof error === "object" && "digest" in error ? String(error.digest) : "";
  if (digest.startsWith("NEXT_REDIRECT;")) {
    const parts = digest.split(";");
    const next = parts.slice(2, -2).join(";");
    const auth = /^\/(login|signup|forgot-password|reset-password|verify-email)(\?[^\\]*)?$/.test(next);
    return NextResponse.json({ next: auth ? next : safeNext(next) }, { headers: { "Cache-Control": "no-store" } });
  }
  if (digest.startsWith("NEXT_HTTP_ERROR_FALLBACK;404")) return NextResponse.json({ message: "Unavailable." }, { status: 404 });
  return NextResponse.json({ message: "The service is unavailable. Refresh and try again." }, { status: 503 });
}
