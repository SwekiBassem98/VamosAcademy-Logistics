import Link from "next/link";
import clsx from "clsx";
import type { ComponentProps, ReactNode } from "react";

export { clsx as cx };

type Variant = "primary" | "secondary" | "danger" | "ghost";
const variants: Record<Variant, string> = {
  primary: "bg-brand text-white hover:bg-brand-dark focus-visible:ring-brand/40",
  secondary: "bg-white text-navy border border-line hover:bg-gray-50 focus-visible:ring-navy/20",
  danger: "bg-white text-red-700 border border-red-200 hover:bg-red-50 focus-visible:ring-red-300",
  ghost: "text-navy hover:bg-gray-100",
};
const btnBase =
  "inline-flex items-center justify-center gap-2 rounded-md px-3.5 py-2 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-4 disabled:opacity-60 disabled:pointer-events-none";

export function Button({ variant = "primary", className, ...p }: ComponentProps<"button"> & { variant?: Variant }) {
  return <button className={clsx(btnBase, variants[variant], className)} {...p} />;
}

export function LinkButton({ variant = "primary", className, ...p }: ComponentProps<typeof Link> & { variant?: Variant }) {
  return <Link className={clsx(btnBase, variants[variant], className)} {...p} />;
}

export function Card({ className, title, actions, children }: { className?: string; title?: ReactNode; actions?: ReactNode; children: ReactNode }) {
  return (
    <section className={clsx("rounded-lg border border-line bg-white shadow-xs", className)}>
      {(title || actions) && (
        <header className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
          <h2 className="text-sm font-semibold text-navy">{title}</h2>
          {actions}
        </header>
      )}
      <div className="p-4">{children}</div>
    </section>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-navy">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Field({ label, name, error, hint, children, className }: { label: string; name?: string; error?: string; hint?: string; children: ReactNode; className?: string }) {
  return (
    <div className={clsx("space-y-1", className)}>
      <label htmlFor={name} className="block text-sm font-medium text-gray-700">{label}</label>
      {children}
      {error ? <p className="text-xs text-red-600">{error}</p> : hint ? <p className="text-xs text-muted">{hint}</p> : null}
    </div>
  );
}

export function Table({ head, children, empty }: { head: ReactNode[]; children: ReactNode; empty?: boolean }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-line bg-white">
      <table className="min-w-full divide-y divide-line text-sm">
        <thead className="bg-gray-50">
          <tr>
            {head.map((h, i) => (
              <th key={i} scope="col" className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-muted">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {empty ? (
            <tr><td colSpan={head.length} className="px-4 py-10 text-center text-muted">Aucun élément.</td></tr>
          ) : children}
        </tbody>
      </table>
    </div>
  );
}

export function Td({ className, ...p }: ComponentProps<"td">) {
  return <td className={clsx("whitespace-nowrap px-4 py-2.5", className)} {...p} />;
}

const tones = {
  gray: "bg-gray-100 text-gray-700",
  red: "bg-brand-100 text-brand-dark",
  green: "bg-emerald-50 text-emerald-700",
  amber: "bg-amber-50 text-amber-700",
  blue: "bg-blue-50 text-navy",
};
export function Badge({ tone = "gray", children }: { tone?: keyof typeof tones; children: ReactNode }) {
  return <span className={clsx("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium", tones[tone])}>{children}</span>;
}

export function Stat({ label, value, hint, tone = "navy" }: { label: string; value: ReactNode; hint?: ReactNode; tone?: "navy" | "brand" | "green" }) {
  const color = { navy: "text-navy", brand: "text-brand", green: "text-emerald-700" }[tone];
  return (
    <div className="rounded-lg border border-line bg-white p-4 shadow-xs">
      <p className="text-xs font-medium uppercase tracking-wide text-muted">{label}</p>
      <p className={clsx("mt-2 text-2xl font-bold tabular-nums", color)}>{value}</p>
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
    </div>
  );
}

export function EmptyState({ title, text, action }: { title: string; text?: ReactNode; action?: ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed border-gray-300 bg-white px-6 py-12 text-center">
      <p className="font-semibold text-navy">{title}</p>
      {text && <p className="mx-auto mt-1 max-w-md text-sm text-muted">{text}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

/** Marque visuelle des données de démonstration (fictives). */
export function DemoBadge({ show = true }: { show?: boolean }) {
  return show ? <span className="ml-1.5 inline-flex rounded bg-amber-100 px-1.5 py-px align-middle text-[10px] font-bold uppercase tracking-wide text-amber-800" title="Donnée de démonstration fictive">Démo</span> : null;
}

export function Forbidden() {
  return (
    <div className="rounded-lg border border-line bg-white p-10 text-center">
      <p className="text-lg font-semibold text-navy">Accès refusé</p>
      <p className="mt-1 text-sm text-muted">Votre rôle ne permet pas d&apos;accéder à cette page.</p>
    </div>
  );
}
