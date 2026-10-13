import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const file = resolve(process.env.ALVIS_ENV_FILE || ".env.local");
if (existsSync(file)) process.loadEnvFile(file);
const { validateServer } = await import("../src/config/index.ts");
try { validateServer(); } catch (error) { console.error(error.message); process.exit(1); }
if (!process.env.ALVIS_AUTH_FLOW_SECRET) console.warn("Password recovery unavailable until ALVIS_AUTH_FLOW_SECRET is configured.");
const mode = process.argv[2] || "dev", port = process.env.SERVER_PORT || "4000";
if (!/^[0-9]+$/.test(port)) throw new Error("SERVER_PORT must be numeric.");
const child = spawn(process.execPath, [require.resolve("next/dist/bin/next"), mode, "--hostname", process.env.SERVER_HOST || "127.0.0.1", "--port", port], { stdio: "inherit", env: process.env });
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => child.kill(signal));
child.on("exit", code => process.exit(code || 0));
