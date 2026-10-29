import type { Metadata, Viewport } from "next";
import { Inter, Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";

const inter = Inter({ variable: "--font-inter", subsets: ["latin"] });
// Titres : arrondis et chaleureux, sans être enfantins
const display = Plus_Jakarta_Sans({ variable: "--font-display-face", subsets: ["latin"], weight: ["600", "700", "800"] });

export const metadata: Metadata = {
  title: { default: "VAMOS ACADEMY — Gestion", template: "%s · VAMOS ACADEMY" },
  description: "Plateforme de gestion du centre VAMOS ACADEMY, Kelibia",
  icons: { icon: "/brand/logo.png" },
};

// Zoom toujours autorisé (pas de maximumScale) ; viewportFit pour les zones sûres (encoche, barre d'accueil)
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#14213d",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="fr">
      <body className={`${inter.variable} ${display.variable} font-sans antialiased`}>{children}</body>
    </html>
  );
}
