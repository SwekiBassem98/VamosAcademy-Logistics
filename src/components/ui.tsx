import Link from "next/link";
import clsx from "clsx";
import { Children, cloneElement, isValidElement, type ComponentProps, type ReactElement, type ReactNode } from "react";
import { ArrowLeft, Inbox, Lock } from "lucide-react";

export { clsx as cx };

// ─── Boutons ───────────────────────────────────────────────────────────────
// Cibles de 44 px au toucher, plus compactes à la souris (pointer-fine).

type Variant = "primary" | "secondary" | "danger" | "ghost" | "navy";
type Size = "sm" | "md" | "lg";
const variants: Record<Variant, string> = {
  primary: "bg-brand text-white shadow-xs hover:bg-brand-700 active:bg-brand-800",
  navy: "bg-navy text-white shadow-xs hover:bg-navy-700 active:bg-navy-950",
  secondary: "bg-white text-navy border border-line-strong shadow-xs hover:border-navy-200 hover:bg-navy-50 active:bg-navy-100",
  danger: "bg-white text-danger-600 border border-danger-600/30 hover:bg-danger-50 active:bg-danger-50",
  ghost: "text-navy hover:bg-navy-50 active:bg-navy-100",
};
const sizes: Record<Size, string> = {
  sm: "min-h-10 px-3 text-sm pointer-fine:min-h-8 pointer-fine:px-2.5 pointer-fine:text-xs",
  md: "min-h-11 px-4 text-sm pointer-fine:min-h-9",
  lg: "min-h-12 px-5 text-base",
};
export const btnBase =
  "inline-flex shrink-0 select-none items-center justify-center gap-2 rounded-md text-center font-semibold transition active:scale-[0.98] disabled:pointer-events-none disabled:opacity-55 [&_svg]:size-4 [&_svg]:shrink-0";

export function buttonClass({ variant = "primary", size = "md", block, className }: { variant?: Variant; size?: Size; block?: boolean; className?: string } = {}) {
  return clsx(btnBase, variants[variant], sizes[size], block && "w-full", className);
}

export function Button({ variant, size, block, className, type = "button", ...p }: ComponentProps<"button"> & { variant?: Variant; size?: Size; block?: boolean }) {
  return <button type={type} className={buttonClass({ variant, size, block, className })} {...p} />;
}

export function LinkButton({ variant, size, block, className, ...p }: ComponentProps<typeof Link> & { variant?: Variant; size?: Size; block?: boolean }) {
  return <Link className={buttonClass({ variant, size, block, className })} {...p} />;
}

/** Bouton d'envoi d'un formulaire GET (filtres, aperçu, générer…) : un seul style partout. */
export function ApplyButton({ children = "Appliquer", className }: { children?: ReactNode; className?: string }) {
  return <button type="submit" className={buttonClass({ variant: "navy", className })}>{children}</button>;
}

// ─── Mise en page ──────────────────────────────────────────────────────────

export function Card({ className, title, description, actions, children, flush, id }: {
  className?: string; title?: ReactNode; description?: ReactNode; actions?: ReactNode; children: ReactNode; flush?: boolean; id?: string;
}) {
  return (
    <section id={id} className={clsx("min-w-0 rounded-lg border border-line bg-white shadow-xs", className)}>
      {(title || actions) && (
        <header className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-b border-line px-4 py-3 sm:px-5">
          <div className="min-w-0">
            {title && <h2 className="text-[0.9375rem] font-bold text-navy">{title}</h2>}
            {description && <p className="mt-0.5 text-xs text-muted">{description}</p>}
          </div>
          {actions && <div className="flex shrink-0 flex-wrap items-center gap-2 text-sm">{actions}</div>}
        </header>
      )}
      <div className={flush ? undefined : "p-4 sm:p-5"}>{children}</div>
    </section>
  );
}

/** Lien de carte (« Tout voir → ») : cible tactile suffisante. */
export function CardLink({ href, children }: { href: string; children: ReactNode }) {
  return <Link href={href} className="-my-2 inline-flex min-h-10 items-center rounded px-1 text-sm font-semibold text-brand hover:text-brand-700 pointer-fine:min-h-0">{children}</Link>;
}

/**
 * En-tête de page. `back` : lien de retour (fil d'Ariane court) ; `actions` : actions secondaires, sur une ligne
 * défilante sur mobile (jamais plus large que l'écran) ; `primary` : action principale, pleine largeur sur mobile.
 */
export function PageHeader({ title, subtitle, actions, primary, back, meta }: {
  title: ReactNode; subtitle?: ReactNode; actions?: ReactNode; primary?: ReactNode; back?: { href: string; label: string }; meta?: ReactNode;
}) {
  return (
    <div className="mb-5 sm:mb-6">
      {back && (
        <nav aria-label="Fil d'Ariane" className="mb-1.5">
          <Link href={back.href} className="-ml-1 inline-flex min-h-9 items-center gap-1 rounded px-1 text-sm font-medium text-muted hover:text-brand">
            <ArrowLeft className="size-4" aria-hidden /> {back.label}
          </Link>
        </nav>
      )}
      <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
        <div className="min-w-0 xl:flex-1">
          <h1 className="text-2xl font-extrabold tracking-tight text-navy sm:text-[1.75rem]">{title}</h1>
          {subtitle && <p className="mt-1 max-w-3xl text-sm text-muted">{subtitle}</p>}
          {meta && <div className="mt-3 flex flex-wrap gap-1.5">{meta}</div>}
        </div>
        {(actions || primary) && (
          <div className="no-print flex min-w-0 flex-col gap-2 xl:max-w-[60%] sm:flex-row-reverse sm:items-center sm:justify-end xl:justify-start">
            {primary && <div className="flex [&>*]:w-full sm:[&>*]:w-auto">{primary}</div>}
            {actions && (
              <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 sm:pb-0">{actions}</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export function SectionTitle({ children, actions }: { children: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-3 mt-8 flex items-center justify-between gap-3">
      <h2 className="text-lg font-bold text-navy">{children}</h2>
      {actions}
    </div>
  );
}

/** Message contextuel (information, avertissement, erreur, succès). */
export function Callout({ tone = "info", title, children, className }: { tone?: "info" | "warning" | "danger" | "success"; title?: ReactNode; children: ReactNode; className?: string }) {
  const t = {
    info: "border-info-600/20 bg-info-50 text-info-700",
    warning: "border-warning-600/25 bg-warning-50 text-warning-700",
    danger: "border-danger-600/25 bg-danger-50 text-danger-700",
    success: "border-success-600/25 bg-success-50 text-success-700",
  }[tone];
  return (
    <div role={tone === "danger" || tone === "warning" ? "alert" : "status"} className={clsx("rounded-md border px-3.5 py-2.5 text-sm", t, className)}>
      {title && <p className="font-semibold">{title}</p>}
      <div className={title ? "mt-0.5" : undefined}>{children}</div>
    </div>
  );
}

// ─── Champs ────────────────────────────────────────────────────────────────

export function Field({ label, id, error, hint, children, className }: {
  label: string; id: string; error?: string; hint?: string; children: ReactNode; className?: string;
}) {
  return (
    <div className={clsx("min-w-0 space-y-1.5", className)}>
      <label htmlFor={id} className="block text-sm font-medium text-ink-soft">
        {label}
      </label>
      {children}
      {error ? <p id={`${id}-err`} className="text-[0.8125rem] font-medium text-danger-600">{error}</p>
        : hint ? <p id={`${id}-hint`} className="text-xs text-muted">{hint}</p> : null}
    </div>
  );
}

// ─── Tableau responsive ────────────────────────────────────────────────────

type Cell = "primary" | "wide" | "actions" | "select" | "hide-sm" | "num";

function headLabel(h: ReactNode): string {
  if (typeof h === "string" || typeof h === "number") return String(h);
  if (isValidElement(h)) {
    const p = h.props as { label?: unknown };
    if (typeof p.label === "string") return p.label;
  }
  return "";
}

function headSort(h: ReactNode): "ascending" | "descending" | undefined {
  if (!isValidElement(h)) return undefined;
  const p = h.props as { field?: string; params?: Record<string, string | undefined> };
  if (!p.field || !p.params || p.params.sort !== p.field) return undefined;
  return p.params.dir === "desc" ? "descending" : "ascending";
}

/**
 * Tableau. Sous 1024 px, `mobile="cards"` (défaut) transforme chaque ligne en carte : l'intitulé de colonne
 * est repris devant chaque valeur (data-label, dérivé de `head`). `mobile="scroll"` garde un vrai tableau
 * défilant dans son cadre, pour les données réellement tabulaires (relevés de notes, grilles).
 */
export function Table({ head, children, empty, emptyText = "Aucun élément.", mobile = "cards", caption, stickyFirst, className }: {
  head: ReactNode[]; children: ReactNode; empty?: boolean; emptyText?: ReactNode; mobile?: "cards" | "scroll"; caption?: string; stickyFirst?: boolean; className?: string;
}) {
  const labels = head.map(headLabel);
  const rows = Children.toArray(children).map((row) => {
    if (!isValidElement(row) || row.type !== "tr") return row;
    const r = row as ReactElement<{ children?: ReactNode }>;
    let i = 0;
    const cells = Children.toArray(r.props.children).map((cell) => {
      if (!isValidElement(cell)) return cell;
      const c = cell as ReactElement<Record<string, unknown>>;
      const label = labels[i++] ?? "";
      return c.props["data-label"] === undefined ? cloneElement(c, { "data-label": label }) : c;
    });
    return cloneElement(r, {}, ...cells);
  });
  return (
    <div className={clsx("min-w-0 rounded-lg border border-line bg-white shadow-xs", mobile === "cards" ? "rtable-cards lg:overflow-x-auto" : "overflow-x-auto overscroll-x-contain", className)}>
      <table className={clsx("min-w-full text-sm", stickyFirst && "[&_td:first-child]:sticky [&_td:first-child]:left-0 [&_td:first-child]:z-1 [&_td:first-child]:bg-white [&_th:first-child]:sticky [&_th:first-child]:left-0 [&_th:first-child]:z-1 [&_th:first-child]:bg-surface")}>
        {caption && <caption className="sr-only">{caption}</caption>}
        <thead className="border-b border-line bg-surface">
          <tr>
            {head.map((h, i) => (
              <th key={i} scope="col" aria-sort={headSort(h)} className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide whitespace-nowrap text-muted">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {empty ? (
            <tr><td colSpan={head.length} data-cell="empty" className="px-4 py-10 text-center text-sm text-muted">{emptyText}</td></tr>
          ) : rows}
        </tbody>
      </table>
    </div>
  );
}

export function Td({ className, cell, ...p }: ComponentProps<"td"> & { cell?: Cell; "data-label"?: string }) {
  return (
    <td
      data-cell={cell === "num" ? undefined : cell}
      // Colonne « wide » (texte long : message, motif…) : retour à la ligne et largeur minimale, jamais de débordement sur les voisines
      className={clsx("px-4 py-3 align-middle", cell === "wide" ? "break-words lg:min-w-[18rem] lg:whitespace-normal" : "lg:whitespace-nowrap", cell === "num" && "tabular-nums lg:text-right", className)}
      {...p}
    />
  );
}

// ─── Badges, indicateurs ───────────────────────────────────────────────────

const tones = {
  gray: "bg-surface-2 text-ink-soft",
  red: "bg-danger-50 text-danger-700",
  green: "bg-success-50 text-success-700",
  amber: "bg-warning-50 text-warning-700",
  blue: "bg-info-50 text-info-700",
  brand: "bg-brand-50 text-brand-700",
};
export type Tone = keyof typeof tones;
export function Badge({ tone = "gray", children, dot, className }: { tone?: Tone; children: ReactNode; dot?: boolean; className?: string }) {
  return (
    <span className={clsx("inline-flex max-w-full items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-semibold", tones[tone], className)}>
      {dot && <span aria-hidden className="size-1.5 rounded-full bg-current" />}
      {children}
    </span>
  );
}

export function Stat({ label, value, hint, tone = "navy", href, icon }: {
  label: string; value: ReactNode; hint?: ReactNode; tone?: "navy" | "brand" | "green"; href?: string; icon?: ReactNode;
}) {
  const color = { navy: "text-navy", brand: "text-brand", green: "text-success-600" }[tone];
  const body = (
    <>
      <p className="flex items-center gap-1.5 text-xs font-semibold text-muted">{icon && <span aria-hidden className="text-faint [&_svg]:size-3.5">{icon}</span>}{label}</p>
      <p className={clsx("mt-1.5 font-display text-xl font-extrabold tracking-tight tabular-nums sm:text-2xl", color)}>{value}</p>
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
    </>
  );
  const cls = "block min-w-0 rounded-lg border border-line bg-white p-3.5 shadow-xs sm:p-4";
  return href
    ? <Link href={href} className={clsx(cls, "transition hover:border-navy-200 hover:shadow-sm")}>{body}</Link>
    : <div className={cls}>{body}</div>;
}

export function EmptyState({ title, text, action, icon }: { title: string; text?: ReactNode; action?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed border-line-strong bg-white px-5 py-10 text-center sm:py-12">
      <span aria-hidden className="mx-auto mb-3 grid size-11 place-items-center rounded-full bg-navy-50 text-navy-600 [&_svg]:size-5">{icon ?? <Inbox />}</span>
      <p className="font-display font-bold text-navy">{title}</p>
      {text && <p className="mx-auto mt-1 max-w-md text-sm text-muted">{text}</p>}
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}

/**
 * Liste « libellé : valeur ». Selon la largeur de SON conteneur (et non de l'écran) : libellé au-dessus de la valeur
 * dans une carte étroite (colonne latérale, mobile), deux colonnes dès que la carte dépasse ~26 rem.
 */
export function DescriptionList({ items, className }: { items: [ReactNode, ReactNode][]; className?: string }) {
  return (
    <div className="@container">
      <dl className={clsx("grid gap-x-4 gap-y-2.5 text-sm @[26rem]:grid-cols-[minmax(0,9rem)_1fr]", className)}>
        {items.map(([k, v], i) => (
          <div key={i} className="contents">
            <dt className="text-xs font-semibold text-muted @[26rem]:text-sm @[26rem]:font-normal">{k}</dt>
            <dd className="-mt-2 min-w-0 break-words @[26rem]:mt-0">{v}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={clsx("animate-pulse rounded-md bg-surface-2", className)} />;
}

/** Marque visuelle des données de démonstration (fictives). */
export function DemoBadge({ show = true }: { show?: boolean }) {
  return show ? <span className="ml-1.5 inline-flex rounded bg-warning-50 px-1.5 py-px align-middle text-[10px] font-bold uppercase tracking-wide text-warning-700 ring-1 ring-warning-600/20" title="Donnée de démonstration fictive">Démo</span> : null;
}

export function Forbidden() {
  return (
    <EmptyState icon={<Lock />} title="Accès refusé" text="Votre rôle ne permet pas d'accéder à cette page."
      action={<LinkButton href="/dashboard" variant="secondary">Retour au tableau de bord</LinkButton>} />
  );
}

/** Lien téléphone : appel direct au toucher. */
export function Phone({ value, className }: { value: string | null | undefined; className?: string }) {
  if (!value) return <span className="text-muted">—</span>;
  return <a href={`tel:${value.replace(/\s/g, "")}`} className={clsx("font-medium whitespace-nowrap text-navy underline-offset-2 hover:text-brand hover:underline", className)}>{value}</a>;
}
