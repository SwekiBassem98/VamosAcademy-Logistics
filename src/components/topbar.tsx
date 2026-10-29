"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { Bell, ChevronDown, KeyRound, LogOut, Search, X } from "lucide-react";
import clsx from "clsx";

export type Notice = { id: string; title: string; detail: string; href: string; tone: "red" | "amber" | "blue" };

function useOutside(ref: React.RefObject<HTMLElement | null>, close: () => void) {
  useEffect(() => {
    const h = (e: PointerEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) close(); };
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    document.addEventListener("pointerdown", h);
    document.addEventListener("keydown", k);
    return () => { document.removeEventListener("pointerdown", h); document.removeEventListener("keydown", k); };
  }, [ref, close]);
}

// Panneaux déroulants : pleine largeur sous la barre sur mobile, ancrés à droite à partir de 640 px (jamais hors écran)
const panel = "fixed inset-x-2 top-[calc(3.75rem+env(safe-area-inset-top))] z-40 max-h-[calc(100dvh-5rem)] animate-pop overflow-hidden rounded-lg border border-line bg-white shadow-lg sm:absolute sm:inset-x-auto sm:top-full sm:right-0 sm:mt-2";
const iconBtn = "relative grid size-11 place-items-center rounded-full text-navy transition hover:bg-navy-50 active:bg-navy-100";

export function Topbar({ user, yearLabel, notices, unread, logout }: {
  user: { fullName: string; role: string; email: string };
  yearLabel: string | null;
  notices: Notice[];
  unread: number;
  logout: () => Promise<void>;
}) {
  const [openN, setOpenN] = useState(false);
  const [openP, setOpenP] = useState(false);
  const nRef = useRef<HTMLDivElement>(null);
  const pRef = useRef<HTMLDivElement>(null);
  const search = useRef<HTMLDialogElement>(null);
  useOutside(nRef, () => setOpenN(false));
  useOutside(pRef, () => setOpenP(false));
  const initials = user.fullName.split(/\s+/).filter((w) => /^\p{L}/u.test(w)).map((w) => w[0]).slice(0, 2).join("").toUpperCase();

  return (
    <header className="no-print sticky top-0 z-30 border-b border-line bg-white/95 pt-[env(safe-area-inset-top)] backdrop-blur">
      <div className="flex h-14 items-center gap-1 px-2 sm:gap-2 sm:px-4 lg:h-16 lg:px-8">
        <Link href="/dashboard" className="flex shrink-0 items-center rounded px-1.5 lg:hidden" aria-label="VAMOS ACADEMY — tableau de bord">
          <Image src="/brand/logo.png" alt="" width={76} height={40} priority />
        </Link>

        <form action="/search" className="relative hidden max-w-md flex-1 lg:block" role="search">
          <Search aria-hidden className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-faint" />
          <input name="q" type="search" placeholder="Rechercher un élève, parent, enseignant, groupe…" aria-label="Recherche globale"
            className="h-10 w-full rounded-md border border-line bg-surface pr-3 pl-9 text-sm outline-none transition focus:border-brand focus:bg-white focus:ring-3 focus:ring-brand/15" />
        </form>

        <span className="flex-1" />
        <span className="mr-1 hidden rounded-full border border-brand/20 bg-brand-50 px-3 py-1 text-xs font-semibold text-brand-700 md:inline">
          {yearLabel ? `Année ${yearLabel}` : "Aucune année active"}
        </span>

        <button type="button" className={clsx(iconBtn, "lg:hidden")} aria-label="Ouvrir la recherche" aria-haspopup="dialog" onClick={() => search.current?.showModal()}>
          <Search className="size-5" />
        </button>

        <div className="sm:relative" ref={nRef}>
          <button type="button" onClick={() => { setOpenN((v) => !v); setOpenP(false); }} className={iconBtn} aria-label={`Notifications (${unread} nouvelle(s))`} aria-expanded={openN}>
            <Bell className="size-5" />
            {unread > 0 && <span className="absolute top-1.5 right-1 grid h-4.5 min-w-4.5 place-items-center rounded-full bg-brand px-1 text-[10px] font-bold text-white ring-2 ring-white">{unread > 99 ? "99+" : unread}</span>}
          </button>
          {openN && (
            <div className={clsx(panel, "sm:w-96")}>
              <p className="flex items-center justify-between border-b border-line px-4 py-3 text-sm font-bold text-navy">Notifications <span className="text-xs font-medium text-muted">{unread} nouvelle(s)</span></p>
              {notices.length === 0 ? <p className="px-4 py-8 text-center text-sm text-muted">Aucune nouvelle notification.</p> : (
                <ul className="max-h-[min(24rem,60dvh)] divide-y divide-line overflow-y-auto overscroll-contain">
                  {notices.map((n) => (
                    <li key={n.id}>
                      <Link href={n.href} onClick={() => setOpenN(false)} className="flex gap-3 px-4 py-3 hover:bg-surface">
                        <span aria-hidden className={clsx("mt-1.5 size-2 shrink-0 rounded-full", { red: "bg-brand", amber: "bg-warning-600", blue: "bg-info-600" }[n.tone])} />
                        <span className="min-w-0"><span className="block text-sm font-semibold text-ink">{n.title}</span><span className="block text-xs text-muted">{n.detail}</span></span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
              <Link href="/notifications" onClick={() => setOpenN(false)} className="flex min-h-11 items-center justify-center border-t border-line px-4 text-sm font-semibold text-brand hover:bg-surface">Voir toutes les notifications</Link>
            </div>
          )}
        </div>

        <div className="sm:relative" ref={pRef}>
          <button type="button" onClick={() => { setOpenP((v) => !v); setOpenN(false); }} className="flex min-h-11 items-center gap-2 rounded-full py-1 pr-1 pl-1 transition hover:bg-navy-50 sm:pr-2" aria-expanded={openP} aria-label="Menu du profil">
            <span className="grid size-9 place-items-center rounded-full bg-navy text-xs font-bold text-white">{initials}</span>
            <span className="hidden text-left md:block"><span className="block max-w-40 truncate text-sm font-semibold leading-tight text-navy">{user.fullName}</span><span className="block text-[11px] leading-tight text-muted">{user.role}</span></span>
            <ChevronDown aria-hidden className="hidden size-4 text-muted sm:block" />
          </button>
          {openP && (
            <div className={clsx(panel, "py-1 sm:w-64")}>
              <div className="border-b border-line px-4 py-3">
                <p className="truncate text-sm font-semibold text-navy">{user.fullName}</p>
                <p className="truncate text-xs text-muted">{user.role} · {user.email}</p>
              </div>
              <Link href="/profile" onClick={() => setOpenP(false)} className="flex min-h-11 items-center gap-2.5 px-4 text-sm hover:bg-surface"><KeyRound aria-hidden className="size-4 text-muted" /> Mon profil & mot de passe</Link>
              <form action={logout}><button className="flex min-h-11 w-full items-center gap-2.5 px-4 text-left text-sm font-medium text-danger-600 hover:bg-danger-50"><LogOut aria-hidden className="size-4" /> Se déconnecter</button></form>
            </div>
          )}
        </div>
      </div>

      {/* Recherche plein écran (mobile, tablette) */}
      <dialog ref={search} aria-label="Recherche" onClick={(e) => { if (e.target === e.currentTarget) e.currentTarget.close(); }}
        className="m-0 mt-0 w-full max-w-none bg-transparent p-0 backdrop:bg-navy-950/50 open:animate-fade-in lg:hidden">
        <form action="/search" role="search" className="flex items-center gap-2 border-b border-line bg-white px-3 pt-[max(0.5rem,env(safe-area-inset-top))] pb-2" onSubmit={() => search.current?.close()}>
          <Search aria-hidden className="ml-1 size-5 shrink-0 text-faint" />
          <input name="q" type="search" enterKeyHint="search" autoFocus placeholder="Élève, parent, téléphone, matricule…" aria-label="Recherche globale"
            className="h-12 min-w-0 flex-1 bg-transparent text-base outline-none" />
          <button type="button" className={iconBtn} aria-label="Fermer la recherche" onClick={() => search.current?.close()}><X className="size-5" /></button>
        </form>
      </dialog>
    </header>
  );
}
