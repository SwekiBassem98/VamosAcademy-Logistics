"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { ConfirmAction } from "./confirm";

type LinkAction = { label: string; href: string; param?: string };
type ServerAction = {
  label: string;
  action: (fd: FormData) => Promise<unknown>;
  title: string;
  message: string;
  withReason?: string;
  fields?: Record<string, string>;
  variant?: "danger" | "primary" | "secondary";
};

/**
 * Sélection multiple sur un tableau : les cases `<input type=checkbox name="sel" value=id>` rendues côté serveur
 * sont suivies ici ; la barre d'actions apparaît dès qu'au moins une ligne est cochée.
 * Les actions serveur revérifient permissions et identifiants (rien n'est fait sur la seule foi du client).
 */
export function Bulk({ children, links = [], actions = [], noun = "élément(s)" }: { children: ReactNode; links?: LinkAction[]; actions?: ServerAction[]; noun?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [ids, setIds] = useState<string[]>([]);
  const sync = useCallback(() => {
    const boxes = [...(ref.current?.querySelectorAll<HTMLInputElement>('input[name="sel"]') ?? [])];
    const next = boxes.filter((b) => b.checked).map((b) => b.value);
    setIds((prev) => (prev.length === next.length && prev.every((v, i) => v === next[i]) ? prev : next));
    const all = ref.current?.querySelector<HTMLInputElement>('input[name="sel-all"]');
    if (all) {
      all.checked = boxes.length > 0 && boxes.every((b) => b.checked);
      all.indeterminate = boxes.some((b) => b.checked) && !all.checked;
    }
  }, []);
  // Après une action, la liste est rafraîchie par le serveur : on resynchronise la sélection sur les lignes présentes
  useEffect(() => {
    if (!ref.current) return;
    const obs = new MutationObserver(() => sync());
    obs.observe(ref.current, { childList: true, subtree: true });
    return () => obs.disconnect();
  }, [sync]);
  const onChange = (e: React.ChangeEvent<HTMLDivElement>) => {
    const t = e.target as unknown as HTMLInputElement;
    if (t.name === "sel-all") ref.current?.querySelectorAll<HTMLInputElement>('input[name="sel"]').forEach((b) => (b.checked = t.checked));
    if (t.name === "sel" || t.name === "sel-all") sync();
  };
  const joined = ids.join(",");
  return (
    <div ref={ref} onChange={onChange}>
      {ids.length > 0 && (
        <div className="no-print sticky top-14 z-20 mb-2 flex flex-wrap items-center gap-2 rounded-lg border border-navy/20 bg-navy px-3 py-2 text-sm text-white shadow">
          <span className="font-medium">{ids.length} {noun} sélectionné(s)</span>
          <span className="flex-1" />
          {links.map((l) => (
            <Link key={l.label} prefetch={false} className="rounded-md bg-white/10 px-3 py-1.5 hover:bg-white/20"
              href={`${l.href}${l.href.includes("?") ? "&" : "?"}${l.param ?? "ids"}=${encodeURIComponent(joined)}`}>{l.label}</Link>
          ))}
          {actions.map((a) => (
            <ConfirmAction key={a.label} action={a.action} label={a.label} title={a.title} message={`${a.message} (${ids.length} ${noun})`}
              withReason={a.withReason} variant={a.variant ?? "secondary"} small fields={{ ...a.fields, ids: joined }} />
          ))}
        </div>
      )}
      {children}
    </div>
  );
}

export function SelectAll() {
  return <input type="checkbox" name="sel-all" aria-label="Tout sélectionner" className="size-4 accent-brand" />;
}

export function SelectRow({ id, label }: { id: string; label: string }) {
  return <input type="checkbox" name="sel" value={id} aria-label={`Sélectionner ${label}`} className="size-4 accent-brand" />;
}
