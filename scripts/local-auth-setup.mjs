// Opt-in local test configuration. Reads actual local Supabase credentials; never prints them.
import { execFileSync } from "node:child_process";
import { writeFileSync, existsSync } from "node:fs";
import { resolve, join } from "node:path";
import { randomBytes } from "node:crypto";
const root = resolve(import.meta.dirname, "..");
const binary = process.env.SUPABASE_CLI || (process.platform === "win32" ? join(process.env.TEMP, "alvis-supabase-cli", "supabase.exe") : "supabase");
const local = JSON.parse(execFileSync(binary, ["status", "--workdir", join(root, "server"), "--output", "json", "--log-level", "error"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }));
if (new URL(local.API_URL).hostname !== "127.0.0.1" || !local.SERVICE_ROLE_KEY || !local.PUBLISHABLE_KEY) throw new Error("A running, actual local Supabase stack is required.");
if (existsSync(join(root, "server/.env.local"))) process.loadEnvFile(join(root, "server/.env.local"));
const values = {
  SUPABASE_URL: local.API_URL, SUPABASE_PUBLISHABLE_KEY: local.PUBLISHABLE_KEY, SUPABASE_SERVICE_ROLE_KEY: local.SERVICE_ROLE_KEY,
  SUPABASE_S3_ENDPOINT: local.STORAGE_S3_URL, SUPABASE_S3_REGION: local.S3_PROTOCOL_REGION,
  SUPABASE_S3_ACCESS_KEY_ID: local.S3_PROTOCOL_ACCESS_KEY_ID, SUPABASE_S3_SECRET_ACCESS_KEY: local.S3_PROTOCOL_ACCESS_KEY_SECRET,
  ALVIS_SITE_URL: "http://127.0.0.1:3100", SERVER_PORT: "4100", CORS_ALLOWED_ORIGINS: "http://127.0.0.1:3100,http://127.0.0.1:3000",
  ALVIS_AUTH_FLOW_SECRET: randomBytes(32).toString("hex"), AUTH_COOKIE_SECURE: "false", AUTH_COOKIE_DOMAIN: "",
  SMTP_HOST: "127.0.0.1", SMTP_PORT: "54325", SMTP_FROM: "noreply@alvis.local", SMTP_REQUIRE_TLS: "false", SMTP_USER: "", SMTP_PASSWORD: "",
  ALVIS_DEPLOYMENT_ENV: "test", ALVIS_STORAGE_BUCKET: "alvis-recordings", ALVIS_NEXT_DIST_DIR: ".next-local-auth",
  // Retain chosen real provider settings when present. This setup itself makes no model calls.
  OPENAI_API_KEY: process.env.OPENAI_API_KEY || "", OPENAI_MODEL_TEXT: process.env.OPENAI_MODEL_TEXT || "",
  OPENAI_MODEL_STT: process.env.OPENAI_MODEL_STT || "", OPENAI_MODEL_EMBED: process.env.OPENAI_MODEL_EMBED || "",
};
writeFileSync(join(root, "server/.env.local-auth"), Object.entries(values).map(([k, v]) => k + "=" + JSON.stringify(v)).join("\n") + "\n", { mode: 0o600 });
writeFileSync(join(root, "client/.env.local-auth"), "NEXT_PUBLIC_API_BASE_URL=http://127.0.0.1:4100\nNEXT_PUBLIC_SITE_URL=http://127.0.0.1:3100\n", { mode: 0o600 });
console.log("Prepared ignored local Auth test environments for client 3100 / server 4100. Credentials withheld; emails are locally intercepted.");
