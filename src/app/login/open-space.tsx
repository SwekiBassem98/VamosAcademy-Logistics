"use client";

import { useEffect } from "react";

/**
 * Utilisateur connecté arrivé sur /login : chargement complet de son espace.
 * Next.js réaffiche cette page juste après l'action de connexion ; une redirection serveur à ce moment-là
 * déclenche une navigation côté client et une redirection de layout y laisse l'écran vide jusqu'au rafraîchissement.
 */
export function OpenSpace() {
  useEffect(() => window.location.replace("/dashboard"), []);
  return (
    <main className="grid min-h-dvh place-items-center p-6 text-center">
      <p role="status" className="text-sm text-muted">Ouverture de votre espace… <a href="/dashboard" className="font-semibold text-brand underline">Continuer</a></p>
    </main>
  );
}
