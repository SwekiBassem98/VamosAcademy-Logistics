"use client";

import { useRef, useState, useTransition, type ReactNode } from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "./ui";

/**
 * Bouton qui ouvre une fenêtre de confirmation accessible (<dialog>) avant d'exécuter une Server Action.
 * `fields` : champs cachés transmis à l'action ; `withReason` : ajoute un champ « motif » obligatoire.
 */
export function ConfirmAction({
  action, label, title, message, confirmLabel = "Confirmer", variant = "danger", fields = {}, withReason, small, children,
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
}) {
  const ref = useRef<HTMLDialogElement>(null);
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

  return (
    <>
      <Button type="button" variant={variant} className={small ? "px-2 py-1 text-xs" : undefined} onClick={() => { setError(null); ref.current?.showModal(); }}>
        {label}
      </Button>
      <dialog ref={ref} className="m-auto w-[min(28rem,calc(100vw-2rem))] rounded-lg p-0 shadow-xl backdrop:bg-black/40" aria-labelledby="confirm-title">
        <form action={submit} className="p-5">
          <div className="flex gap-3">
            <span className={variant === "danger" ? "rounded-full bg-red-50 p-2 text-red-600" : "rounded-full bg-blue-50 p-2 text-navy"}><AlertTriangle className="size-5" /></span>
            <div className="flex-1">
              <h2 id="confirm-title" className="font-semibold text-navy">{title}</h2>
              <div className="mt-1 text-sm text-gray-600">{message}</div>
            </div>
          </div>
          {Object.entries(fields).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
          {children}
          {withReason && (
            <label className="mt-4 block text-sm">
              <span className="font-medium text-gray-700">{withReason} *</span>
              <input name="reason" required minLength={3} className="input mt-1" />
            </label>
          )}
          {error && <p role="alert" className="mt-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
          <div className="mt-5 flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => ref.current?.close()} disabled={pending}>Annuler</Button>
            <Button type="submit" variant={variant === "secondary" ? "primary" : variant} disabled={pending}>{pending ? "Veuillez patienter…" : confirmLabel}</Button>
          </div>
        </form>
      </dialog>
    </>
  );
}
