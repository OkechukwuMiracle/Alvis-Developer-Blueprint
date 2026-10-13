import type { NextConfig } from "next";
import path from "node:path";
const config:NextConfig={distDir:process.env.ALVIS_NEXT_DIST_DIR||".next",turbopack:{root:path.resolve(process.cwd(),"..")},outputFileTracingRoot:path.resolve(process.cwd(),".."),transpilePackages:["@alvis/shared"]};
export default config;
