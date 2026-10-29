import Image from "next/image";
import { db } from "@/server/db";
import { formatDateTime } from "@/lib/format";

/** En-tête officiel des documents imprimables : logo, identité et coordonnées de VAMOS ACADEMY. */
export async function DocHeader({ title, reference, lines = [] }: { title: string; reference?: string; lines?: string[] }) {
  const c = await db.centerSettings.findUnique({ where: { id: 1 } });
  return (
    <header className="flex items-start justify-between gap-4 border-b-2 border-brand pb-4">
      <div>
        <Image src="/brand/logo.png" alt="VAMOS ACADEMY" width={140} height={74} />
        <p className="mt-2 text-xs text-muted">
          <strong className="text-navy">{c?.name ?? "VAMOS ACADEMY"}</strong><br />
          {c?.addressFr}<br /><span dir="rtl" lang="ar">{c?.addressAr}</span><br />Tél. {c?.phone}{c?.email && ` · ${c.email}`}
        </p>
      </div>
      <div className="text-right">
        <p className="text-lg font-bold uppercase text-navy">{title}</p>
        {reference && <p className="mt-1 inline-block rounded border-2 border-navy px-2 py-0.5 font-mono text-sm font-bold text-navy">{reference}</p>}
        {lines.map((l) => <p key={l} className="text-sm text-muted">{l}</p>)}
      </div>
    </header>
  );
}

/** Pied de page : date d'édition (heure de Tunis), mention légale du centre, marquage DÉMO si applicable. */
export async function DocFooter({ demo = false }: { demo?: boolean }) {
  const c = await db.centerSettings.findUnique({ where: { id: 1 } });
  return (
    <footer className="mt-6 border-t border-line pt-2 text-center text-[11px] text-muted">
      {c?.receiptFooter && <p>{c.receiptFooter}</p>}
      <p>Document édité le {formatDateTime(new Date())} (heure de Tunis){demo && " — DONNÉES DE DÉMONSTRATION FICTIVES"}</p>
    </footer>
  );
}

/** Cadre de document imprimable standard. */
export function DocPage({ children, wide = false }: { children: React.ReactNode; wide?: boolean }) {
  return (
    <article className={`mx-auto rounded-lg border border-line bg-white p-8 text-sm print:max-w-none print:border-0 print:p-0 ${wide ? "max-w-5xl" : "max-w-3xl"}`}>
      {children}
    </article>
  );
}
