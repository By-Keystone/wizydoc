import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: false,
  // Los e2e levantan otro `next dev` y no pueden compartir la carpeta del de desarrollo.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  experimental: {
    externalDir: true,
  },
  async rewrites() {
    return [
      {
        source: "/api/auth/:path*",
        destination: `${process.env.API_URL}/api/auth/:path*`,
      },
      {
        source: "/api/invitations/:path*",
        destination: `${process.env.API_URL}/invitations/:path*`,
      },
    ];
  },
};

export default nextConfig;
