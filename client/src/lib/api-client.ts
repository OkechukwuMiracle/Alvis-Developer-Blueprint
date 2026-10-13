export function apiUrl(path: string) {
  if (!path.startsWith("/api/") || path.startsWith("//")) throw new Error("API paths must start with /api/.");
  const base = process.env.NEXT_PUBLIC_API_BASE_URL || "http://127.0.0.1:4000";
  const url = new URL(base);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash || url.pathname !== '/')
    throw new Error("Configure NEXT_PUBLIC_API_BASE_URL with an HTTP(S) API origin.");
  return url.origin + path;
}
// One transport for application API requests. Signed storage uploads use their own authorized URL.
export function apiFetch(path: string, options: RequestInit = {}) {
  return fetch(apiUrl(path), { ...options, credentials: "include", cache: "no-store" });
}
