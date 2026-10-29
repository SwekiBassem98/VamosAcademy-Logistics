import Link from "next/link";
import clsx from "clsx";
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight } from "lucide-react";
import { FilterPanel } from "./filter-panel";

export type Params = Record<string, string | undefined>;

export function href(base: string, params: Params, patch: Params = {}): string {
  const merged = { ...params, ...patch };
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(merged)) if (v) qs.set(k, v);
  const s = qs.toString();
  return s ? `${base}?${s}` : base;
}

/** Lit page/tri depuis l'URL. `allowed` liste les champs triables (protection contre l'injection d'orderBy). */
export function listParams<T extends string>(params: Params, allowed: readonly T[], defaultSort: T, defaultDir: "asc" | "desc" = "asc") {
  const sort = (allowed as readonly string[]).includes(params.sort ?? "") ? (params.sort as T) : defaultSort;
  const dir: "asc" | "desc" = params.dir === "desc" ? "desc" : params.dir === "asc" ? "asc" : defaultDir;
  const page = Math.max(1, Number(params.page) || 1);
  return { sort, dir, page };
}

/** En-tête de colonne triable (l'état aria-sort est porté par le <th>, voir Table). */
export function SortLink({ base, params, field, label }: { base: string; params: Params; field: string; label: string }) {
  const active = params.sort === field;
  const dir = active && params.dir !== "desc" ? "desc" : "asc";
  const Icon = !active ? ArrowUpDown : params.dir === "desc" ? ArrowDown : ArrowUp;
  return (
    <Link href={href(base, params, { sort: field, dir, page: undefined })} className="inline-flex items-center gap-1 rounded hover:text-navy">
      {label} <Icon aria-hidden className={active ? "size-3 text-brand" : "size-3 opacity-40"} />
    </Link>
  );
}

export function Pagination({ base, params, page, total, perPage }: { base: string; params: Params; page: number; total: number; perPage: number }) {
  const pages = Math.max(1, Math.ceil(total / perPage));
  const from = total === 0 ? 0 : (page - 1) * perPage + 1;
  const to = Math.min(total, page * perPage);
  return (
    <nav className="no-print mt-3 flex flex-wrap items-center justify-between gap-2 text-sm" aria-label="Pagination">
      <span className="text-muted">{from}–{to} sur {total}</span>
      {pages > 1 && (
        <div className="flex items-center gap-1">
          <PageLink disabled={page <= 1} href={href(base, params, { page: String(page - 1) })} label="Page précédente"><ChevronLeft className="size-4" /> <span className="max-xs:sr-only">Précédent</span></PageLink>
          <span className="px-2 text-muted" aria-current="page">{page} / {pages}</span>
          <PageLink disabled={page >= pages} href={href(base, params, { page: String(page + 1) })} label="Page suivante"><span className="max-xs:sr-only">Suivant</span> <ChevronRight className="size-4" /></PageLink>
        </div>
      )}
    </nav>
  );
}

function PageLink({ disabled, href, children, label }: { disabled: boolean; href: string; children: React.ReactNode; label: string }) {
  const cls = "inline-flex min-h-11 items-center gap-1 rounded-md border px-3 pointer-fine:min-h-9";
  return disabled
    ? <span aria-disabled className={clsx(cls, "border-line bg-surface text-faint")}>{children}</span>
    : <Link href={href} aria-label={label} className={clsx(cls, "border-line-strong bg-white font-medium text-navy hover:border-navy-200 hover:bg-navy-50")}>{children}</Link>;
}

const NOT_FILTERS = new Set(["sort", "dir", "page", "q", "reset", "edit", "batch", "print"]);

/**
 * Barre de filtres GET : conserve le tri courant. `search` reste toujours visible ;
 * les autres filtres (children) se replient derrière un bouton sur mobile.
 */
export function FilterBar({ children, params, keep = ["sort", "dir"], search, submitLabel = "Filtrer" }: {
  children?: React.ReactNode; params: Params; keep?: string[]; search?: React.ReactNode; submitLabel?: string;
}) {
  const active = Object.entries(params).filter(([k, v]) => v && !NOT_FILTERS.has(k)).length;
  return (
    <form className="no-print mb-4" role="search">
      {keep.map((k) => params[k] && <input key={k} type="hidden" name={k} value={params[k]} />)}
      <FilterPanel search={search} active={active} submitLabel={submitLabel}>{children}</FilterPanel>
    </form>
  );
}

/** Libellé visible au-dessus d'un champ de filtre (dates). */
export function FilterField({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="flex min-w-0 flex-col gap-1 text-xs font-semibold text-muted">{label}{children}</label>;
}
