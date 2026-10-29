"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Bell, ChevronDown, KeyRound, LogOut, Search, Menu } from "lucide-react";
import clsx from "clsx";

export type Notice = { id: string; title: string; detail: string; href: string; tone: "red" | "amber" | "blue" };

function useOutside(ref: React.RefObject<HTMLElement | null>, close: () => void) {
  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) close(); };
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    document.addEventListener("mousedown", h);
    document.addEventListener("keydown", k);
    return () => { document.removeEventListener("mousedown", h); document.removeEventListener("keydown", k); };
  }, [ref, close]);
}

export function Topbar({ user, yearLabel, notices, unread, logout, onMenu }: {
  user: { fullName: string; role: string; email: string };
  yearLabel: string | null;
  notices: Notice[];
  unread: number;
  logout: () => Promise<void>;
  onMenu?: () => void;
}) {
  const [openN, setOpenN] = useState(false);
  const [openP, setOpenP] = useState(false);
  const nRef = useRef<HTMLDivElement>(null);
  const pRef = useRef<HTMLDivElement>(null);
  useOutside(nRef, () => setOpenN(false));
  useOutside(pRef, () => setOpenP(false));
  const initials = user.fullName.split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase();

  return (
    <header className="no-print sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-line bg-white/95 px-4 backdrop-blur sm:px-6">
      {onMenu && <button onClick={onMenu} className="text-navy lg:hidden" aria-label="Ouvrir le menu"><Menu /></button>}
      <form action="/search" className="relative max-w-md flex-1" role="search">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-gray-400" />
        <input name="q" placeholder="Rechercher un élève, parent, enseignant, groupe…" aria-label="Recherche globale"
          className="w-full rounded-md border border-line bg-surface py-1.5 pl-9 pr-3 text-sm outline-none focus:border-brand focus:bg-white focus:ring-2 focus:ring-brand/20" />
      </form>
      <span className="ml-auto hidden rounded-full border border-brand/20 bg-brand-50 px-3 py-1 text-xs font-medium text-brand-dark sm:inline">
        {yearLabel ? `Année ${yearLabel}` : "Aucune année active"}
      </span>

      <div className="relative" ref={nRef}>
        <button onClick={() => setOpenN((v) => !v)} className="relative rounded-full p-2 text-navy hover:bg-gray-100" aria-label={`Notifications (${unread} nouvelle(s))`} aria-expanded={openN}>
          <Bell className="size-5" />
          {unread > 0 && <span className="absolute right-0.5 top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-brand px-1 text-[10px] font-bold text-white">{unread > 99 ? "99+" : unread}</span>}
        </button>
        {openN && (
          <div className="absolute right-0 mt-2 w-80 overflow-hidden rounded-lg border border-line bg-white shadow-lg">
            <p className="flex items-center justify-between border-b border-line px-4 py-2 text-sm font-semibold text-navy">Notifications <span className="text-xs font-normal text-muted">{unread} nouvelle(s)</span></p>
            {notices.length === 0 ? <p className="px-4 py-6 text-center text-sm text-muted">Aucune nouvelle notification.</p> : (
              <ul className="max-h-96 divide-y divide-line overflow-y-auto">
                {notices.map((n) => (
                  <li key={n.id}>
                    <Link href={n.href} onClick={() => setOpenN(false)} className="flex gap-3 px-4 py-3 hover:bg-gray-50">
                      <span className={clsx("mt-1.5 size-2 shrink-0 rounded-full", { red: "bg-brand", amber: "bg-amber-500", blue: "bg-navy" }[n.tone])} />
                      <span><span className="block text-sm font-medium text-gray-900">{n.title}</span><span className="text-xs text-muted">{n.detail}</span></span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
            <Link href="/notifications" onClick={() => setOpenN(false)} className="block border-t border-line px-4 py-2 text-center text-xs font-medium text-brand hover:bg-gray-50">Voir toutes les notifications et leur traitement</Link>
          </div>
        )}
      </div>

      <div className="relative" ref={pRef}>
        <button onClick={() => setOpenP((v) => !v)} className="flex items-center gap-2 rounded-full py-1 pl-1 pr-2 hover:bg-gray-100" aria-expanded={openP} aria-label="Menu du profil">
          <span className="grid size-8 place-items-center rounded-full bg-navy text-xs font-bold text-white">{initials}</span>
          <span className="hidden text-left md:block"><span className="block text-sm font-medium leading-tight text-navy">{user.fullName}</span><span className="block text-[11px] leading-tight text-muted">{user.role}</span></span>
          <ChevronDown className="size-4 text-muted" />
        </button>
        {openP && (
          <div className="absolute right-0 mt-2 w-60 rounded-lg border border-line bg-white py-1 shadow-lg">
            <p className="truncate border-b border-line px-4 py-2 text-xs text-muted">{user.email}</p>
            <Link href="/profile" onClick={() => setOpenP(false)} className="flex items-center gap-2 px-4 py-2 text-sm hover:bg-gray-50"><KeyRound className="size-4" /> Mon profil & mot de passe</Link>
            <form action={logout}><button className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-red-700 hover:bg-red-50"><LogOut className="size-4" /> Se déconnecter</button></form>
          </div>
        )}
      </div>
    </header>
  );
}
