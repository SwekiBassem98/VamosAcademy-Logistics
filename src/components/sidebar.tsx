"use client";

import Link, { useLinkStatus } from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import {
  LayoutDashboard, Users, UserRound, GraduationCap, Layers, CalendarDays, ClipboardCheck, Wallet,
  AlertTriangle, Receipt, BarChart3, Settings, ShieldCheck, History, X, NotebookPen, DoorOpen, HandCoins, Bell, MessageSquareText, Printer,
} from "lucide-react";
import clsx from "clsx";
import { Topbar, type Notice } from "./topbar";

const ICONS = {
  dashboard: LayoutDashboard, students: Users, guardians: UserRound, teachers: GraduationCap, academics: Layers,
  schedule: CalendarDays, attendance: ClipboardCheck, grades: NotebookPen, rooms: DoorOpen, payments: Wallet,
  unpaid: AlertTriangle, expenses: Receipt, reports: BarChart3, settings: Settings, users: ShieldCheck, audit: History,
  payroll: HandCoins, bell: Bell, messages: MessageSquareText, documents: Printer,
};
export type NavItem = { href: string; label: string; icon: keyof typeof ICONS; section: string };

/** Indicateur de chargement pendant la navigation vers une page (remplace un squelette global). */
function PendingDot() {
  const { pending } = useLinkStatus();
  return pending ? <span className="ml-auto size-3 animate-spin rounded-full border-2 border-white/30 border-t-white" aria-label="Chargement" /> : null;
}

function Nav({ items, onNavigate, onClose }: { items: NavItem[]; onNavigate?: () => void; onClose?: () => void }) {
  const path = usePathname();
  const sections = [...new Set(items.map((i) => i.section))];
  return (
    <nav className="flex h-full flex-col" aria-label="Navigation principale">
      <div className="flex items-center justify-between gap-2 bg-white px-4 py-3">
        <Link href="/dashboard" onClick={onNavigate}><Image src="/brand/logo.png" alt="VAMOS ACADEMY — accueil" width={122} height={64} priority /></Link>
        {onClose && <button className="text-navy" onClick={onClose} aria-label="Fermer le menu"><X /></button>}
      </div>
      <div className="h-1 bg-brand" />
      <div className="flex-1 overflow-y-auto px-2 pb-4">
        {sections.map((s) => (
          <div key={s} className="mt-4">
            <p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-white/40">{s}</p>
            {items.filter((i) => i.section === s).map((i) => {
              const Icon = ICONS[i.icon];
              const active = path === i.href || path.startsWith(i.href + "/");
              return (
                <Link key={i.href} href={i.href} onClick={onNavigate}
                  className={clsx("relative flex items-center gap-3 rounded-md px-3 py-2 text-sm transition",
                    active ? "bg-white/10 font-medium text-white before:absolute before:inset-y-1.5 before:left-0 before:w-1 before:rounded-r before:bg-brand" : "text-white/75 hover:bg-white/5 hover:text-white")}
                  aria-current={active ? "page" : undefined}>
                  <Icon className={clsx("size-4 shrink-0", active && "text-brand")} /> {i.label}
                  <PendingDot />
                </Link>
              );
            })}
          </div>
        ))}
      </div>
      <p className="border-t border-white/10 px-4 py-3 text-[11px] leading-relaxed text-white/50">
        VAMOS ACADEMY · Kelibia<br />Tél. 20 807 657
      </p>
    </nav>
  );
}

export function AppShell({ items, user, yearLabel, notices, unread, logout, children }: {
  items: NavItem[];
  user: { fullName: string; role: string; email: string };
  yearLabel: string | null;
  notices: Notice[];
  unread: number;
  logout: () => Promise<void>;
  children: ReactNode;
}) {
  // Menu mobile lié à la page où il a été ouvert : il se referme de lui-même après une navigation.
  const path = usePathname();
  const [openOn, setOpenOn] = useState<string | null>(null);
  const open = openOn === path;
  const setOpen = (o: boolean) => setOpenOn(o ? path : null);
  return (
    <div className="min-h-screen">
      <aside className="no-print fixed inset-y-0 left-0 z-20 hidden w-64 bg-navy lg:block"><Nav items={items} /></aside>
      {open && (
        <div className="no-print fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="Menu">
          <div className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-72 max-w-[85vw] bg-navy shadow-xl"><Nav items={items} onNavigate={() => setOpen(false)} onClose={() => setOpen(false)} /></aside>
        </div>
      )}
      <div className="lg:pl-64 print:pl-0">
        <Topbar user={user} yearLabel={yearLabel} notices={notices} unread={unread} logout={logout} onMenu={() => setOpen(true)} />
        <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8 print:p-0">{children}</main>
      </div>
    </div>
  );
}
