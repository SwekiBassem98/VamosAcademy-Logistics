"use client";

import { createContext, startTransition, useActionState, useContext, useEffect, useRef, type ComponentProps, type ReactNode } from "react";
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
 */
export function Form({
  action, children, className, resetOnSuccess = false,
}: { action: Action; children: ReactNode; className?: string; resetOnSuccess?: boolean }) {
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
    if (state?.error) ref.current?.querySelector<HTMLElement>("[aria-invalid=true], [role=alert]")?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [state]);
  return (
    <form
      ref={ref}
      className={className}
      noValidate
      aria-busy={pending}
      onSubmit={(e) => {
        e.preventDefault();
        if (pending) return;
        const fd = new FormData(e.currentTarget);
        startTransition(() => formAction(fd));
      }}
    >
      {state?.error && <p role="alert" className="mb-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</p>}
      {state?.ok && state.message && <p role="status" className="mb-3 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{state.message}</p>}
      <PendingCtx.Provider value={pending}><ErrorsCtx.Provider value={state?.fieldErrors}>{children}</ErrorsCtx.Provider></PendingCtx.Provider>
    </form>
  );
}

export function Submit({ children = "Enregistrer", ...p }: ComponentProps<typeof Button>) {
  const pending = useContext(PendingCtx);
  return <Button type="submit" disabled={pending} {...p}>{pending ? "Veuillez patienter…" : children}</Button>;
}

type InputProps = ComponentProps<"input"> & { label: string; name: string; hint?: string; wrapperClass?: string };
export function Input({ label, name, hint, wrapperClass, ...p }: InputProps) {
  const err = useContext(ErrorsCtx)?.[name];
  return (
    <Field label={label} name={name} error={err} hint={hint} className={wrapperClass}>
      <input id={name} name={name} className="input" aria-invalid={!!err} {...p} />
    </Field>
  );
}

type SelectProps = ComponentProps<"select"> & {
  label: string; name: string; options: { value: string; label: string }[]; placeholder?: string; wrapperClass?: string;
};
export function Select({ label, name, options, placeholder, wrapperClass, ...p }: SelectProps) {
  const err = useContext(ErrorsCtx)?.[name];
  return (
    <Field label={label} name={name} error={err} className={wrapperClass}>
      <select id={name} name={name} className="input" aria-invalid={!!err} {...p}>
        {placeholder !== undefined && <option value="">{placeholder}</option>}
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </Field>
  );
}

export function Textarea({ label, name, wrapperClass, ...p }: ComponentProps<"textarea"> & { label: string; name: string; wrapperClass?: string }) {
  const err = useContext(ErrorsCtx)?.[name];
  return (
    <Field label={label} name={name} error={err} className={wrapperClass}>
      <textarea id={name} name={name} rows={3} className="input" aria-invalid={!!err} {...p} />
    </Field>
  );
}

export function Checkbox({ label, name, ...p }: ComponentProps<"input"> & { label: string; name: string }) {
  return (
    <label className="flex items-center gap-2 text-sm text-gray-700">
      <input type="checkbox" name={name} className="size-4 rounded border-line accent-brand" {...p} />
      {label}
    </label>
  );
}
