"use client";

import { useId, useRef, useState, useTransition, type ReactNode } from "react";
import { AlertTriangle, Info, Loader2 } from "lucide-react";
import { Button } from "./ui";

/**
 * Bouton qui ouvre une fenêtre de confirmation accessible (<dialog>) avant d'exécuter une Server Action.
 * Sur mobile : feuille ancrée en bas de l'écran ; à partir de 640 px : fenêtre centrée.
 * `fields` : champs cachés transmis à l'action ; `withReason` : ajoute un champ « motif » obligatoire.
 */
export function ConfirmAction({
  action, label, title, message, confirmLabel = "Confirmer", variant = "danger", fields = {}, withReason, small, children, ariaLabel,
}: {
  action: (fd: FormData) => Promise<unknown>;
  label: ReactNode;
  title: string;
  message: ReactNode;
  confirmLabel?: string;
  variant?: "danger" | "primary" | "secondary";
  fields?: Record<string, string>;
  withReason?: string;
  small?: boolean;
  children?: ReactNode;
  ariaLabel?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function submit(fd: FormData) {
    setError(null);
    start(async () => {
      try {
        const res = (await action(fd)) as { error?: string } | undefined;
        if (res && typeof res === "object" && res.error) setError(res.error);
        else ref.current?.close();
      } catch (e) {
        // Les redirections Next.js se propagent ; les autres erreurs sont affichées.
        if ((e as { digest?: string })?.digest?.startsWith("NEXT_REDIRECT")) throw e;
        setError((e as Error).message || "Opération impossible.");
      }
    });
  }

  const Icon = variant === "danger" ? AlertTriangle : Info;
  return (
    <>
      <Button type="button" variant={variant} size={small ? "sm" : "md"} aria-label={ariaLabel} aria-haspopup="dialog" onClick={() => { setError(null); ref.current?.showModal(); }}>
        {label}
      </Button>
      <dialog
        ref={ref}
        aria-labelledby={titleId}
        onClick={(e) => { if (e.target === e.currentTarget && !pending) e.currentTarget.close(); }}
        className="mx-0 mt-auto mb-0 w-full max-w-none rounded-t-xl bg-white p-0 text-ink shadow-lg backdrop:bg-navy-950/50 open:animate-sheet-up sm:m-auto sm:w-[min(28rem,calc(100vw-2rem))] sm:rounded-lg sm:open:animate-pop"
      >
        <form action={submit} className="p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
          <div aria-hidden className="mx-auto -mt-2 mb-3 h-1 w-10 rounded-full bg-line-strong sm:hidden" />
          <div className="flex gap-3">
            <span aria-hidden className={variant === "danger" ? "grid size-10 shrink-0 place-items-center rounded-full bg-danger-50 text-danger-600" : "grid size-10 shrink-0 place-items-center rounded-full bg-info-50 text-info-600"}><Icon className="size-5" /></span>
            <div className="min-w-0 flex-1">
              <h2 id={titleId} className="font-bold text-navy">{title}</h2>
              <div className="mt-1 text-sm text-ink-soft">{message}</div>
            </div>
          </div>
          {Object.entries(fields).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
          {children}
          {withReason && (
            <label className="mt-4 block text-sm">
              <span className="font-medium text-ink-soft">{withReason} *</span>
              <input name="reason" required minLength={3} autoFocus className="input mt-1.5" />
            </label>
          )}
          {error && <p role="alert" className="mt-3 rounded-md border border-danger-600/25 bg-danger-50 px-3 py-2 text-sm text-danger-700">{error}</p>}
          <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="secondary" onClick={() => ref.current?.close()} disabled={pending}>Annuler</Button>
            <Button type="submit" variant={variant === "secondary" ? "primary" : variant} disabled={pending}>
              {pending ? <><Loader2 className="animate-spin" aria-hidden /> Veuillez patienter…</> : confirmLabel}
            </Button>
          </div>
        </form>
      </dialog>
    </>
  );
}
