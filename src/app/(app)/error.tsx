"use client";

import { useEffect } from "react";
import { AlertTriangle, Lock } from "lucide-react";
import { Button, EmptyState } from "@/components/ui";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => console.error(error), [error]);
  const forbidden = error.message?.startsWith("Accès refusé");
  return (
    <EmptyState icon={forbidden ? <Lock /> : <AlertTriangle />} title={forbidden ? "Accès refusé" : "Une erreur est survenue"}
      text={<>{forbidden ? "Votre rôle ne permet pas cette action." : "L'opération n'a pas pu aboutir. Réessayez ; si le problème persiste, contactez l'administrateur."}
        {error.digest && <span className="mt-1 block font-mono text-xs">Réf. {error.digest}</span>}</>}
      action={<Button onClick={reset}>Réessayer</Button>} />
  );
}
