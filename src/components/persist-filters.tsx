"use client";

import { useEffect } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

/**
 * Filtres persistants (par navigateur) : mémorise les paramètres de la liste et les restaure
 * quand on revient sur la page sans paramètre. Le lien « Réinitialiser » (?reset=1) les efface.
 */
export function PersistFilters({ storageKey }: { storageKey: string }) {
  const router = useRouter();
  const path = usePathname();
  const params = useSearchParams();
  const key = `vamos.filters.${storageKey}`;

  useEffect(() => {
    try {
      const qs = params.toString();
      if (params.get("reset") === "1") {
        localStorage.removeItem(key);
        router.replace(path);
        return;
      }
      if (qs) {
        const clean = new URLSearchParams(qs);
        clean.delete("page");
        localStorage.setItem(key, clean.toString());
      } else {
        const saved = localStorage.getItem(key);
        if (saved) router.replace(`${path}?${saved}`);
      }
    } catch {
      // stockage indisponible (navigation privée) : on ignore
    }
  }, [params, path, key, router]);

  return params.toString() ? (
    <p className="no-print -mt-2 mb-2 text-right text-xs">
      <a href={`${path}?reset=1`} className="text-muted hover:text-brand">Réinitialiser les filtres</a>
    </p>
  ) : null;
}
