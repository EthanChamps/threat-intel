import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ['better-sqlite3', 'crawlee', 'playwright'],
};

export default nextConfig;
