import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  eslint: { ignoreDuringBuilds: true },
  // /beta ya no existe, pero su enlace se compartió: lleva a la portada en vez de un 404.
  async redirects() {
    return [{ source: "/beta", destination: "/", permanent: true }];
  },
};

export default nextConfig;
