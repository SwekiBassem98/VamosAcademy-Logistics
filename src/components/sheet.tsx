"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { X } from "lucide-react";
import { Button } from "./ui";

/**
 * Panneau modal : plein écran sur mobile, panneau latéral droit à partir de 640 px.
 * Repose sur <dialog> (focus piégé, Échap, retour du focus au déclencheur), défilement interne indépendant,
 * arrière-plan bloqué (voir globals.css). `defaultOpen` : ouvert dès l'affichage (ex. ?edit=…).
 */
export function Sheet({ trigger, title, description, children, variant = "primary", size, defaultOpen, triggerClassName }: {
  trigger: ReactNode;
  title: string;
  description?: ReactNode;
  children: ReactNode;
  variant?: "primary" | "secondary" | "ghost" | "navy";
  size?: "sm" | "md";
  defaultOpen?: boolean;
  triggerClassName?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (defaultOpen && ref.current && !ref.current.open) ref.current.showModal();
  }, [defaultOpen]);
  return (
    <>
      <Button variant={variant} size={size} className={triggerClassName} onClick={() => ref.current?.showModal()} aria-haspopup="dialog">{trigger}</Button>
      <dialog
        ref={ref}
        aria-label={title}
        onClick={(e) => { if (e.target === e.currentTarget) e.currentTarget.close(); }}
        className="fixed inset-0 m-0 h-dvh max-h-none w-full max-w-none overflow-hidden bg-white p-0 text-ink shadow-lg backdrop:bg-navy-950/50 open:flex open:animate-sheet-up sm:left-auto sm:w-[min(38rem,100vw)] sm:rounded-l-xl"
      >
        <div className="flex min-h-0 w-full flex-col">
          <header className="flex items-start gap-3 border-b border-line px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-3 sm:px-6">
            <div className="min-w-0 flex-1 py-1.5">
              <h2 className="text-lg font-bold text-navy">{title}</h2>
              {description && <p className="mt-0.5 text-sm text-muted">{description}</p>}
            </div>
            <button type="button" onClick={() => ref.current?.close()} className="grid size-11 shrink-0 place-items-center rounded-full text-navy hover:bg-navy-50" aria-label="Fermer">
              <X className="size-5" />
            </button>
          </header>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pt-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] sm:px-6">{children}</div>
        </div>
      </dialog>
    </>
  );
}
