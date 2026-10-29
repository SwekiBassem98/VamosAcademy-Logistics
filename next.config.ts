import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV !== "production";

// Politique de sécurité du contenu : tout est servi par l'application elle-même (polices auto-hébergées par next/font).
// 'unsafe-inline' pour les scripts reste nécessaire à l'hydratation de Next.js sans nonce ; 'unsafe-eval' seulement en développement.
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  `connect-src 'self'${isDev ? " ws: wss:" : ""}`,
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
  ...(isDev ? [] : [{ key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" }]),
];

const nextConfig: NextConfig = {
  // `npm run dev` utilise son propre dossier : un build de production (.next) ne peut pas polluer le serveur de dev.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  poweredByHeader: false,
  // justificatifs de dépenses : jusqu'à 3 fichiers de 5 Mo par envoi
  experimental: { serverActions: { bodySizeLimit: "16mb" } },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
