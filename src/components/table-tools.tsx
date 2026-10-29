import Link from "next/link";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";

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

export function SortLink({ base, params, field, label }: { base: string; params: Params; field: string; label: string }) {
  const active = params.sort === field;
  const dir = active && params.dir !== "desc" ? "desc" : "asc";
  const Icon = !active ? ArrowUpDown : params.dir === "desc" ? ArrowDown : ArrowUp;
  return (
    <Link href={href(base, params, { sort: field, dir, page: undefined })} className="inline-flex items-center gap-1 hover:text-navy" aria-sort={active ? (params.dir === "desc" ? "descending" : "ascending") : undefined}>
      {label} <Icon className={active ? "size-3 text-brand" : "size-3 opacity-40"} />
    </Link>
  );
}

export function Pagination({ base, params, page, total, perPage }: { base: string; params: Params; page: number; total: number; perPage: number }) {
  const pages = Math.max(1, Math.ceil(total / perPage));
  const from = total === 0 ? 0 : (page - 1) * perPage + 1;
  const to = Math.min(total, page * perPage);
  return (
    <nav className="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm" aria-label="Pagination">
      <span className="text-muted">{from}–{to} sur {total}</span>
      {pages > 1 && (
        <div className="flex items-center gap-1">
          <PageLink disabled={page <= 1} href={href(base, params, { page: String(page - 1) })}>Précédent</PageLink>
          <span className="px-2 text-muted">Page {page} / {pages}</span>
          <PageLink disabled={page >= pages} href={href(base, params, { page: String(page + 1) })}>Suivant</PageLink>
        </div>
      )}
    </nav>
  );
}

function PageLink({ disabled, href, children }: { disabled: boolean; href: string; children: React.ReactNode }) {
  return disabled
    ? <span className="rounded border border-line bg-gray-50 px-3 py-1 text-gray-400">{children}</span>
    : <Link href={href} className="rounded border border-line bg-white px-3 py-1 hover:border-navy">{children}</Link>;
}

/** Barre de filtres GET : conserve le tri courant. */
export function FilterBar({ children, params, keep = ["sort", "dir"] }: { children: React.ReactNode; params: Params; keep?: string[] }) {
  return (
    <form className="mb-4 flex flex-wrap items-end gap-2" role="search">
      {keep.map((k) => params[k] && <input key={k} type="hidden" name={k} value={params[k]} />)}
      {children}
      <button className="rounded-md bg-navy px-4 py-2 text-sm font-medium text-white hover:bg-navy-light">Filtrer</button>
    </form>
  );
}
