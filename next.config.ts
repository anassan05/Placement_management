import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  allowedDevOrigins: ["127.0.0.1"],
  experimental: {
    cpus: 1,
    proxyClientMaxBodySize: "25mb",
    serverActions: { bodySizeLimit: "25mb" }
  }
};

export default nextConfig;
