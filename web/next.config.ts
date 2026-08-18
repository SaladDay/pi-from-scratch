import type { NextConfig } from "next";
import { parseAllowedDevOrigins } from "./next-config-utils.mjs";

const allowedDevOrigins = parseAllowedDevOrigins(
  process.env.NEXT_ALLOWED_DEV_ORIGINS,
);

const nextConfig: NextConfig = {
  distDir: process.env.NEXT_DIST_DIR ?? ".next",
  ...(allowedDevOrigins.length > 0 ? { allowedDevOrigins } : {}),
};

export default nextConfig;
