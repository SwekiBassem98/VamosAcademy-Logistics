"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => console.error(error), [error]);
  const forbidden = error.message?.startsWith("Accès refusé");
  return (
    <div className="rounded-lg border border-line bg-white p-10 text-center">
      <p className="text-lg font-semibold text-navy">{forbidden ? "Accès refusé" : "Une erreur est survenue"}</p>
      <p className="mt-1 text-sm text-muted">
        {forbidden ? "Votre rôle ne permet pas cette action." : "L'opération n'a pas pu aboutir. Réessayez ; si le problème persiste, contactez l'administrateur."}
        {error.digest && <span className="mt-1 block font-mono text-xs">Réf. {error.digest}</span>}
      </p>
      <Button className="mt-4" onClick={reset}>Réessayer</Button>
    </div>
  );
}
