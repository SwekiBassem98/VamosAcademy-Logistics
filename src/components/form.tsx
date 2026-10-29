"use client";

import { createContext, startTransition, useActionState, useContext, useEffect, useId, useRef, type ComponentProps, type ReactNode } from "react";
import { CheckCircle2, AlertCircle, Loader2 } from "lucide-react";
import clsx from "clsx";
import { Button, Field } from "./ui";

export type ActionState = {
  ok?: boolean;
  message?: string;
  error?: string;
  fieldErrors?: Record<string, string>;
} | null;
type Action = (prev: ActionState, fd: FormData) => Promise<ActionState>;

const ErrorsCtx = createContext<Record<string, string> | undefined>(undefined);
const PendingCtx = createContext(false);

/**
 * Formulaire relié à une Server Action ; affiche erreurs globales et par champ.
 * La soumission passe par onSubmit (et non `action`) pour que React ne vide pas les champs
 * en cas d'erreur : la saisie est conservée, et n'est réinitialisée qu'en cas de succès si demandé.
 * En cas d'erreur, le focus va au premier champ invalide (ou au message), annoncé par les lecteurs d'écran.
 */
export function Form({
  action, children, className, resetOnSuccess = false, id,
}: { action: Action; children: ReactNode; className?: string; resetOnSuccess?: boolean; id?: string }) {
  const [state, formAction, pending] = useActionState(async (prev: ActionState, fd: FormData): Promise<ActionState> => {
    try {
      return await action(prev, fd);
    } catch (e) {
      // Redirections et 404 de Next.js : à laisser passer
      if (String((e as { digest?: string })?.digest ?? "").startsWith("NEXT_")) throw e;
      return { error: "Connexion au serveur impossible ou interrompue. Vos saisies sont conservées : vérifiez la connexion puis réessayez." };
    }
  }, null);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state?.ok && resetOnSuccess) ref.current?.reset();
  }, [state, resetOnSuccess]);
  useEffect(() => {
    if (!state?.error) return;
    const target = ref.current?.querySelector<HTMLElement>("[aria-invalid=true]") ?? ref.current?.querySelector<HTMLElement>("[data-form-alert]");
    target?.scrollIntoView({ block: "center", behavior: "smooth" });
    target?.focus({ preventScroll: true });
  }, [state]);
  return (
    <form
      ref={ref}
      id={id}
      className={className}
      // Avant l'hydratation, un envoi natif reste en POST (jamais de saisie, ni de mot de passe, dans l'URL)
      method="post"
      noValidate
      aria-busy={pending}
      onSubmit={(e) => {
        e.preventDefault();
        if (pending) return;
        const fd = new FormData(e.currentTarget);
        startTransition(() => formAction(fd));
      }}
    >
      {state?.error && (
        <p role="alert" data-form-alert tabIndex={-1} className="col-span-full mb-3 flex gap-2 rounded-md border border-danger-600/25 bg-danger-50 px-3 py-2.5 text-sm text-danger-700 outline-none">
          <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden /> <span>{state.error}</span>
        </p>
      )}
      {state?.ok && state.message && (
        <p role="status" className="col-span-full mb-3 flex animate-pop gap-2 rounded-md border border-success-600/25 bg-success-50 px-3 py-2.5 text-sm text-success-700">
          <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden /> <span>{state.message}</span>
        </p>
      )}
      <PendingCtx.Provider value={pending}><ErrorsCtx.Provider value={state?.fieldErrors}>{children}</ErrorsCtx.Provider></PendingCtx.Provider>
    </form>
  );
}

export function Submit({ children = "Enregistrer", ...p }: ComponentProps<typeof Button>) {
  const pending = useContext(PendingCtx);
  return (
    <Button type="submit" disabled={pending} aria-disabled={pending} {...p}>
      {pending ? <><Loader2 className="animate-spin" aria-hidden /> Veuillez patienter…</> : children}
    </Button>
  );
}

/** Barre d'actions d'un formulaire ; `sticky` : reste visible en bas de l'écran sur mobile (formulaires longs). */
export function FormActions({ children, sticky, className }: { children: ReactNode; sticky?: boolean; className?: string }) {
  return (
    <div className={clsx(
      "col-span-full flex flex-wrap items-center justify-end gap-3 border-t border-line pt-4 [&>button[type=submit]]:max-sm:w-full",
      sticky && "max-lg:sticky max-lg:bottom-[calc(4.25rem+env(safe-area-inset-bottom))] max-lg:z-10 max-lg:-mx-4 max-lg:bg-white/95 max-lg:px-4 max-lg:pb-3 max-lg:backdrop-blur",
      className,
    )}>
      {children}
    </div>
  );
}

function useFieldA11y(name: string, explicitId: string | undefined, hint?: string) {
  const auto = useId();
  const id = explicitId ?? `${name}-${auto}`;
  const err = useContext(ErrorsCtx)?.[name];
  const describedBy = err ? `${id}-err` : hint ? `${id}-hint` : undefined;
  return { id, err, describedBy };
}

type InputProps = ComponentProps<"input"> & { label: string; name: string; hint?: string; wrapperClass?: string };
export function Input({ label, name, hint, wrapperClass, id: explicitId, className, ...p }: InputProps) {
  const { id, err, describedBy } = useFieldA11y(name, explicitId, hint);
  return (
    <Field label={label} id={id} error={err} hint={hint} className={wrapperClass}>
      <input id={id} name={name} className={clsx("input", className)} aria-invalid={!!err} aria-describedby={describedBy} {...p} />
    </Field>
  );
}

type SelectProps = ComponentProps<"select"> & {
  label: string; name: string; options: { value: string; label: string }[]; placeholder?: string; wrapperClass?: string; hint?: string;
};
export function Select({ label, name, options, placeholder, wrapperClass, hint, id: explicitId, className, ...p }: SelectProps) {
  const { id, err, describedBy } = useFieldA11y(name, explicitId, hint);
  return (
    <Field label={label} id={id} error={err} hint={hint} className={wrapperClass}>
      <select id={id} name={name} className={clsx("input", className)} aria-invalid={!!err} aria-describedby={describedBy} {...p}>
        {placeholder !== undefined && <option value="">{placeholder}</option>}
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </Field>
  );
}

export function Textarea({ label, name, wrapperClass, hint, id: explicitId, className, ...p }: ComponentProps<"textarea"> & { label: string; name: string; wrapperClass?: string; hint?: string }) {
  const { id, err, describedBy } = useFieldA11y(name, explicitId, hint);
  return (
    <Field label={label} id={id} error={err} hint={hint} className={wrapperClass}>
      <textarea id={id} name={name} rows={3} className={clsx("input", className)} aria-invalid={!!err} aria-describedby={describedBy} {...p} />
    </Field>
  );
}

/** Case à cocher : toute la ligne est cliquable (cible ≥ 44 px au toucher). */
export function Checkbox({ label, name, className, ...p }: ComponentProps<"input"> & { label: string; name: string }) {
  return (
    <label className={clsx("flex min-h-11 cursor-pointer items-center gap-2.5 text-sm text-ink-soft pointer-fine:min-h-8", className)}>
      <input type="checkbox" name={name} className="size-5 shrink-0 rounded border-line-strong accent-brand pointer-fine:size-4" {...p} />
      {label}
    </label>
  );
}
