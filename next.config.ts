import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // `npm run dev` utilise son propre dossier : un build de production (.next) ne peut pas polluer le serveur de dev.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  poweredByHeader: false,
};

export default nextConfig;
