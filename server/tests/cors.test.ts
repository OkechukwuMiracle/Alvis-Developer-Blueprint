import { test } from "node:test";
import assert from "node:assert/strict";
import { NextRequest, NextResponse } from "next/server";
import { cors } from "../src/middleware/cors";
import { allowedOrigins, validateServer } from "../src/config";
process.env.CORS_ALLOWED_ORIGINS = "http://127.0.0.1:3000,http://localhost:3000,https://alvis.example.org";
test("credentialed CORS accepts only exact configured origins and real preflight headers", () => {
  const result = cors(new NextRequest("http://127.0.0.1:4000/api/knowledge", { method: "OPTIONS", headers: { Origin: "http://127.0.0.1:3000", "Access-Control-Request-Method": "POST", "Access-Control-Request-Headers": "Content-Type, Authorization, Idempotency-Key" } }));
  assert.ok(result instanceof NextResponse);
  assert.equal(result.status, 204);
  assert.equal(result.headers.get("Access-Control-Allow-Origin"), "http://127.0.0.1:3000");
  assert.equal(result.headers.get("Access-Control-Allow-Credentials"), "true");
  assert.match(result.headers.get("Vary")!, /Origin/);
  for (const origin of ["https://unapproved.example", "http://127.0.0.1:3000.attacker.example", "null"]) {
    const denied = cors(new NextRequest("http://127.0.0.1:4000/api/knowledge", { headers: { Origin: origin } }));
    assert.ok(denied instanceof NextResponse);
    assert.equal(denied.status, 403);
    assert.equal(denied.headers.get("Access-Control-Allow-Origin"), null);
  }
});
test("preflight rejects unsupported methods/headers and does not authorize anonymous callers", () => {
  const cases: Record<string, string>[] = [{ "Access-Control-Request-Method": "TRACE" }, { "Access-Control-Request-Method": "POST", "Access-Control-Request-Headers": "X-Grant-Role" }];
  for (const headers of cases) {
    const denied = cors(new NextRequest("http://127.0.0.1:4000/api/knowledge", { method: "OPTIONS", headers: { Origin: "http://localhost:3000", ...headers } }));
    assert.ok(denied instanceof NextResponse);
    assert.equal(denied.status, 403);
  }
  const server = cors(new NextRequest("http://127.0.0.1:4000/api/knowledge"));
  assert.ok(server instanceof Headers);
  assert.equal(server.get("Access-Control-Allow-Origin"), null);
});
test("configuration rejects wildcard origins and reports missing names without values", () => {
  const old = process.env.CORS_ALLOWED_ORIGINS;
  process.env.CORS_ALLOWED_ORIGINS = "*";
  assert.throws(allowedOrigins);
  process.env.CORS_ALLOWED_ORIGINS = old;
  const url = process.env.SUPABASE_URL;
  delete process.env.SUPABASE_URL;
  assert.throws(validateServer, /SUPABASE_URL/);
  if (url) process.env.SUPABASE_URL = url;
});
