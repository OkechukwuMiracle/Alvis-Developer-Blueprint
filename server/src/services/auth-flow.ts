import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { cookieOptions } from "@/config";
export function siteUrl() {
  const value =
    process.env.ALVIS_SITE_URL ||
    (process.env.NODE_ENV === "development" ? "http://127.0.0.1:3000" : "");
  const url = new URL(value);
  if (
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== "/" ||
    (url.protocol !== "https:" &&
      !["127.0.0.1", "localhost"].includes(url.hostname))
  )
    throw new Error("Configure ALVIS_SITE_URL with your application origin.");
  return url.origin;
}
export const privateCookie = cookieOptions;
function signature(value: string) {
  const key = process.env.ALVIS_AUTH_FLOW_SECRET;
  if (!key || key.length < 32)
    throw new Error(
      "Configure ALVIS_AUTH_FLOW_SECRET (at least 32 random characters).",
    );
  return createHmac("sha256", key).update(value).digest("hex");
}
export async function recoveryProof(userId: string) {
  const value = `${userId}:${Date.now() + 15 * 60 * 1000}`;
  (await cookies()).set("alvis-recovery", `${value}:${signature(value)}`, {
    ...privateCookie,
    maxAge: 900,
  });
}
export async function canRecover(userId: string) {
  const raw = (await cookies()).get("alvis-recovery")?.value || "";
  const [id, expiry, mac] = raw.split(":");
  if (
    id !== userId ||
    Number(expiry) <= Date.now() ||
    !/^[a-f0-9]{64}$/.test(mac || "")
  )
    return false;
  try {
    return timingSafeEqual(
      Buffer.from(mac),
      Buffer.from(signature(`${id}:${expiry}`)),
    );
  } catch {
    return false;
  }
}
