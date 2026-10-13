import type { NextConfig } from "next";
import path from "node:path";
const workspace = path.resolve(process.cwd(), "..");
const config: NextConfig = {
  distDir: process.env.ALVIS_NEXT_DIST_DIR || ".next",
  turbopack: { root: workspace },
  outputFileTracingRoot: workspace,
  transpilePackages: ["@alvis/shared"],
  async rewrites() {
    // Transport-only compatibility for existing links/tests and same-host deployments.
    const base = process.env.NEXT_PUBLIC_API_BASE_URL || "http://127.0.0.1:4000";
    return [{ source: "/api/:path*", destination: base.replace(/\/$/, "") + "/api/:path*" }];
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
        ],
      },
    ];
  },
};
export default config;
