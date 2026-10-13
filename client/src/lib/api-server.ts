import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect, notFound } from "next/navigation";
import type { Identity, Views } from "@alvis/shared/views";
import { apiFetch } from "./api-client";
export async function serverFetch(path: string, options: RequestInit = {}) {
  const jar = await cookies();
  const headers = new Headers(options.headers);
  headers.set("Cookie", jar.toString());
  headers.set("Origin", process.env.NEXT_PUBLIC_SITE_URL || "http://127.0.0.1:3000");
  return apiFetch(path, { ...options, headers });
}
export function responseCookies(response: Response) {
  return response.headers.getSetCookie().map(raw => {
    const [pair, ...attributes] = raw.split(";");
    const i = pair.indexOf("=");
    const name = pair.slice(0, i).trim(), value = decodeURIComponent(pair.slice(i + 1));
    const options: { httpOnly?: boolean; secure?: boolean; path?: string; domain?: string; maxAge?: number; expires?: Date; sameSite?: "lax" | "strict" | "none" } = {};
    for (const attribute of attributes) {
      const [k, ...v] = attribute.trim().split("="), val = v.join("=");
      switch (k.toLowerCase()) {
        case "httponly": options.httpOnly = true; break;
        case "secure": options.secure = true; break;
        case "path": options.path = val; break;
        case "domain": options.domain = val; break;
        case "max-age": options.maxAge = Number(val); break;
        case "expires": options.expires = new Date(val); break;
        case "samesite": options.sameSite = val.toLowerCase() as "lax" | "strict" | "none"; break;
      }
    }
    return { name, value, options, raw };
  }).filter(c => c.name.startsWith("sb-") || c.name.startsWith("alvis-"));
}
export async function relayCookies(response: Response) {
  const jar = await cookies();
  for (const c of responseCookies(response)) jar.set(c.name, c.value, c.options);
}
export const identity = cache(async (): Promise<Identity> => {
  const response = await serverFetch("/api/auth/identity");
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.code === "DATABASE_SETUP_REQUIRED" ? data.message : "Account service unavailable. Check that the API server is running.");
  }
  return response.json();
});
export async function context(path = "/home") {
  const result = await identity();
  if (!result.configured) redirect("/login?setup=1");
  if (!result.user) redirect("/login?next=" + encodeURIComponent(path));
  if (!result.member) redirect("/onboarding");
  return { ...result, user: result.user, member: result.member };
}
export async function view<K extends keyof Views>(key: K, input: Record<string, unknown> = {}): Promise<Views[K]> {
  const response = await serverFetch("/api/views/" + key, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) });
  const data = await response.json();
  if (data.next) redirect(data.next);
  if (response.status === 404) notFound();
  if (!response.ok) throw new Error(data.message || "Application service unavailable.");
  return data;
}
export async function action(name: string, form: FormData) {
  const response = await serverFetch("/api/actions/" + name, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(Object.fromEntries(form.entries())) });
  await relayCookies(response);
  const data = await response.json();
  if (!response.ok) throw new Error(data.message || "Application service unavailable.");
  return data.next as string;
}
