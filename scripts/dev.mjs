import { spawn } from "node:child_process";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const all = process.argv.includes("--workers");
const tasks = [
  { cwd: "server", args: ["scripts/launch.mjs", "dev"] },
  { cwd: "client", args: [require.resolve("next/dist/bin/next"), "dev", "--hostname", "127.0.0.1", "--port", process.env.CLIENT_PORT || "3000"] },
  ...(all ? [{ cwd: "server", args: ["scripts/job.mjs", "worker"] }, { cwd: "server", args: ["scripts/job.mjs", "learning-worker"] }] : []),
];
const children = tasks.map(task => spawn(process.execPath, task.args, { cwd: task.cwd, env: process.env, stdio: "inherit" }));
let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children) {
    if (process.platform === "win32" && child.pid) spawn("taskkill", ["/PID", String(child.pid), "/T", "/F"], { stdio: "ignore" });
    else child.kill("SIGTERM");
  }
  setTimeout(() => process.exit(code), 1000);
}
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => stop());
for (const child of children) child.on("exit", code => stop(code || 0));
