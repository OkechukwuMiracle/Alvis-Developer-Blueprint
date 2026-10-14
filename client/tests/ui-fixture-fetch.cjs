// Loaded only by ui-review.mjs's isolated production preview, never by the app.
const originalFetch = globalThis.fetch;
globalThis.fetch = (input, options) => {
  const value = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  if (value.startsWith("http://127.0.0.1:4000/api/") || value.startsWith("http://localhost:4000/api/")) {
    const target = new URL(value); target.hostname = "127.0.0.1"; target.port = "4200";
    return originalFetch(target, options);
  }
  return originalFetch(input, options);
};
