"use client";

import Link, { useLinkStatus } from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useRef, type ReactNode } from "react";
import {
  LayoutDashboard, Users, UserRound, GraduationCap, Layers, CalendarDays, ClipboardCheck, Wallet,
  AlertTriangle, Receipt, BarChart3, Settings, ShieldCheck, History, X, NotebookPen, DoorOpen, HandCoins, Bell, MessageSquareText, Printer, Menu, Search,
} from "lucide-react";
import clsx from "clsx";
import { Topbar, type Notice } from "./topbar";

const ICONS = {
  dashboard: LayoutDashboard, students: Users, guardians: UserRound, teachers: GraduationCap, academics: Layers,
  schedule: CalendarDays, attendance: ClipboardCheck, grades: NotebookPen, rooms: DoorOpen, payments: Wallet,
  unpaid: AlertTriangle, expenses: Receipt, reports: BarChart3, settings: Settings, users: ShieldCheck, audit: History,
  payroll: HandCoins, bell: Bell, messages: MessageSquareText, documents: Printer,
};
export type NavItem = { href: string; label: string; short?: string; icon: keyof typeof ICONS; section: string };

const isActive = (path: string, href: string) => path === href || path.startsWith(href + "/");

/** Indicateur de chargement pendant la navigation vers une page (remplace un squelette global). */
function PendingDot({ light = true }: { light?: boolean }) {
  const { pending } = useLinkStatus();
  return pending ? <span role="status" aria-label="Chargement" className={clsx("ml-auto size-3.5 shrink-0 animate-spin rounded-full border-2", light ? "border-white/30 border-t-white" : "border-navy/20 border-t-brand")} /> : null;
}

function NavList({ items, onNavigate }: { items: NavItem[]; onNavigate?: () => void }) {
  const path = usePathname();
  const sections = [...new Set(items.map((i) => i.section))];
  return (
    <div className="flex-1 overflow-y-auto overscroll-contain px-3 pb-4">
      {sections.map((s) => (
        <div key={s} className="mt-5 first:mt-3">
          <p className="px-3 pb-1.5 text-[11px] font-bold uppercase tracking-wider text-white/60">{s}</p>
          <ul className="space-y-0.5">
            {items.filter((i) => i.section === s).map((i) => {
              const Icon = ICONS[i.icon];
              const active = isActive(path, i.href);
              return (
                <li key={i.href}>
                  <Link href={i.href} onClick={onNavigate} aria-current={active ? "page" : undefined}
                    className={clsx("group relative flex min-h-11 items-center gap-3 rounded-md px-3 text-sm transition pointer-fine:min-h-9",
                      active ? "bg-white/12 font-semibold text-white" : "text-white/80 hover:bg-white/6 hover:text-white")}>
                    {active && <span aria-hidden className="absolute inset-y-2 left-0 w-1 rounded-r bg-brand-500" />}
                    <Icon aria-hidden className={clsx("size-[18px] shrink-0", active ? "text-brand-200" : "text-white/60 group-hover:text-white/90")} />
                    <span className="truncate">{i.label}</span>
                    <PendingDot />
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}

function Brand({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <Link href="/dashboard" onClick={onNavigate} className="flex items-center rounded-lg bg-white px-3 py-2 shadow-sm">
      <Image src="/brand/logo.png" alt="VAMOS ACADEMY — accueil" width={110} height={58} priority />
    </Link>
  );
}

function NavFooter({ yearLabel }: { yearLabel: string | null }) {
  return (
    <div className="border-t border-white/10 px-5 py-3 text-xs leading-relaxed text-white/65">
      <p className="font-semibold text-white/85">{yearLabel ? `Année scolaire ${yearLabel}` : "Aucune année active"}</p>
      <p>VAMOS ACADEMY · Kelibia · 20 807 657</p>
    </div>
  );
}

/** Barre d'onglets inférieure (téléphone, tablette) : 4 destinations selon le rôle + « Menu ». */
function TabBar({ tabs, onMenu }: { tabs: NavItem[]; onMenu: () => void }) {
  const path = usePathname();
  return (
    <nav aria-label="Navigation rapide" className="no-print fixed inset-x-0 bottom-0 z-30 border-t border-line bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden">
      <ul className="mx-auto grid max-w-xl grid-cols-5">
        {tabs.map((t) => {
          const Icon = ICONS[t.icon];
          const active = isActive(path, t.href);
          return (
            <li key={t.href}>
              <Link href={t.href} aria-current={active ? "page" : undefined}
                className={clsx("relative flex h-16 flex-col items-center justify-center gap-1 px-1 text-[11px] font-semibold transition active:bg-navy-50", active ? "text-brand" : "text-muted")}>
                {active && <span aria-hidden className="absolute inset-x-5 top-0 h-0.5 rounded-b bg-brand" />}
                <Icon aria-hidden className="size-[22px]" strokeWidth={active ? 2.4 : 2} />
                <span className="max-w-full truncate">{t.short ?? t.label}</span>
                <span className="absolute top-2 right-3"><PendingDot light={false} /></span>
              </Link>
            </li>
          );
        })}
        <li>
          <button type="button" onClick={onMenu} aria-label="Ouvrir le menu" aria-haspopup="dialog"
            className="flex h-16 w-full flex-col items-center justify-center gap-1 text-[11px] font-semibold text-muted transition active:bg-navy-50">
            <Menu aria-hidden className="size-[22px]" />
            <span>Menu</span>
          </button>
        </li>
      </ul>
    </nav>
  );
}

export function AppShell({ items, tabs, user, yearLabel, notices, unread, logout, children }: {
  items: NavItem[];
  tabs: string[];
  user: { fullName: string; role: string; email: string };
  yearLabel: string | null;
  notices: Notice[];
  unread: number;
  logout: () => Promise<void>;
  children: ReactNode;
}) {
  const drawer = useRef<HTMLDialogElement>(null);
  const close = () => drawer.current?.close();
  const tabItems = tabs.map((h) => items.find((i) => i.href === h)).filter((i): i is NavItem => !!i);
  return (
    <div className="min-h-dvh">
      <a href="#contenu" className="sr-only z-50 rounded-md bg-navy px-4 py-2 text-white focus:not-sr-only focus:fixed focus:top-2 focus:left-2">Aller au contenu</a>

      <aside className="no-print fixed inset-y-0 left-0 z-20 hidden w-64 flex-col bg-navy lg:flex">
        <nav aria-label="Navigation principale" className="flex min-h-0 flex-1 flex-col">
          <div className="px-4 pt-4"><Brand /></div>
          <NavList items={items} />
        </nav>
        <NavFooter yearLabel={yearLabel} />
      </aside>

      {/* Tiroir de navigation complet (mobile, tablette) */}
      <dialog ref={drawer} aria-label="Menu" onClick={(e) => { if (e.target === e.currentTarget) close(); }}
        className="no-print fixed inset-y-0 left-0 m-0 h-dvh max-h-none w-[min(20rem,88vw)] max-w-none overflow-hidden bg-navy p-0 text-white shadow-lg backdrop:bg-navy-950/60 open:flex open:animate-sheet-left lg:hidden">
        <div className="flex min-h-0 w-full flex-col pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]">
          <div className="flex items-center justify-between gap-2 px-4 pt-3">
            <Brand onNavigate={close} />
            <button type="button" className="grid size-11 place-items-center rounded-full text-white hover:bg-white/10" onClick={close} aria-label="Fermer le menu"><X /></button>
          </div>
          <form action="/search" role="search" className="relative mx-4 mt-4" onSubmit={close}>
            <Search aria-hidden className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-white/60" />
            <input name="q" type="search" enterKeyHint="search" placeholder="Rechercher…" aria-label="Recherche globale"
              className="h-11 w-full rounded-md border border-white/15 bg-white/10 pr-3 pl-9 text-base text-white outline-none placeholder:text-white/55 focus:border-white/40 focus:bg-white/15" />
          </form>
          <p className="mx-4 mt-3 truncate text-xs text-white/70">{user.fullName} · {user.role}</p>
          <nav aria-label="Menu complet" className="flex min-h-0 flex-1 flex-col"><NavList items={items} onNavigate={close} /></nav>
          <NavFooter yearLabel={yearLabel} />
        </div>
      </dialog>

      <div className="lg:pl-64 print:pl-0">
        <Topbar user={user} yearLabel={yearLabel} notices={notices} unread={unread} logout={logout} />
        <main id="contenu" tabIndex={-1} className="mx-auto max-w-7xl px-4 pt-5 pb-[calc(5.5rem+env(safe-area-inset-bottom))] outline-none sm:px-6 lg:px-8 lg:pt-7 lg:pb-12 print:max-w-none print:p-0">
          {children}
        </main>
      </div>

      <TabBar tabs={tabItems} onMenu={() => drawer.current?.showModal()} />
    </div>
  );
}
