export function frontendOrigin() {
  const url = new URL(process.env.ALVIS_SITE_URL || "http://127.0.0.1:3000");
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.pathname !== '/' || url.search || url.hash)
    throw new Error("ALVIS_SITE_URL must be the exact frontend HTTP(S) origin.");
  return url.origin;
}
export function allowedOrigins() {
  const configured = process.env.CORS_ALLOWED_ORIGINS;
  if (!configured) throw new Error("Configure CORS_ALLOWED_ORIGINS with explicit frontend origins.");
  return configured.split(",").map((value) => {
    const text = value.trim(), url = new URL(text);
    if (text !== url.origin || url.username || url.password || !["http:", "https:"].includes(url.protocol))
      throw new Error("CORS_ALLOWED_ORIGINS must contain exact HTTP(S) origins, without wildcards or paths.");
    if (process.env.NODE_ENV === "production" && url.protocol !== "https:" && !["localhost", "127.0.0.1"].includes(url.hostname))
      throw new Error("Production frontend origins must use HTTPS.");
    return url.origin;
  });
}
export function originAllowed(origin: string | null) {
  return Boolean(origin && allowedOrigins().includes(origin));
}
export const cookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.AUTH_COOKIE_SECURE === "true" || process.env.NODE_ENV === "production",
  path: "/",
  ...(process.env.AUTH_COOKIE_DOMAIN ? { domain: process.env.AUTH_COOKIE_DOMAIN } : {}),
};
export function validateServer() {
  const missing = ["SUPABASE_URL", "SUPABASE_PUBLISHABLE_KEY", "SUPABASE_SERVICE_ROLE_KEY", "ALVIS_SITE_URL", "CORS_ALLOWED_ORIGINS"].filter(name => !process.env[name]);
  if (missing.length) throw new Error("Missing server configuration: " + missing.join(", "));
  const url = new URL(process.env.SUPABASE_URL!);
  if (!["https:", "http:"].includes(url.protocol)) throw new Error("SUPABASE_URL must be an HTTP(S) URL.");
  if (!allowedOrigins().includes(frontendOrigin())) throw new Error("CORS_ALLOWED_ORIGINS must include ALVIS_SITE_URL.");
  if (process.env.AUTH_COOKIE_DOMAIN && !/^[.]?[a-z0-9.-]+$/i.test(process.env.AUTH_COOKIE_DOMAIN)) throw new Error("Invalid AUTH_COOKIE_DOMAIN.");
}
