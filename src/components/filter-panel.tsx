"use client";

import { useState, type ReactNode } from "react";
import { Search, SlidersHorizontal } from "lucide-react";
import clsx from "clsx";
import { buttonClass } from "./ui";

/**
 * Corps de la barre de filtres : sur mobile, seule la recherche reste visible et les autres filtres
 * se déplient avec le bouton « Filtres » (le nombre de filtres actifs y est indiqué) ; à partir de 768 px, tout est en ligne.
 */
export function FilterPanel({ search, children, active, submitLabel }: { search?: ReactNode; children?: ReactNode; active: number; submitLabel: string }) {
  const [open, setOpen] = useState(false);
  const hasMore = !!children;
  return (
    <div className="flex flex-wrap items-end gap-2">
      {search && <div className="min-w-0 flex-1 basis-36 md:max-w-sm">{search}</div>}
      {hasMore && (
        <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-controls="filtres-avances"
          className={clsx(buttonClass({ variant: "secondary" }), "md:hidden", !search && "flex-1")}>
          <SlidersHorizontal aria-hidden /> <span className={search ? "max-xs:sr-only" : undefined}>Filtres</span>{active > 0 && <span className="grid h-5 min-w-5 place-items-center rounded-full bg-brand px-1 text-[11px] text-white">{active}</span>}
        </button>
      )}
      {hasMore && (
        <div id="filtres-avances" className={clsx("w-full flex-col gap-2 md:contents", open ? "flex" : "hidden")}>
          {children}
        </div>
      )}
      <button type="submit" className={clsx(buttonClass({ variant: "navy" }), hasMore && !open && "max-md:hidden", hasMore && open && "max-md:w-full")}>{submitLabel}</button>
      {/* sur mobile, la recherche seule s'envoie aussi avec Entrée ; ce bouton reste visible quand les filtres sont repliés */}
      {hasMore && !open && search && <button type="submit" aria-label="Rechercher" className={clsx(buttonClass({ variant: "navy" }), "w-11 px-0 md:hidden")}><Search aria-hidden /></button>}
    </div>
  );
}
