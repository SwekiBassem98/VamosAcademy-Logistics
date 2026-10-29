import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { AppShell, type NavItem } from "@/components/sidebar";
import { requireUser, logout } from "@/server/auth";
import { db } from "@/server/db";
import { noticesFor } from "@/server/notifications";
import type { Role } from "@prisma/client";
import { can, ROLE_LABELS, type Permission } from "@/lib/permissions";

const NAV: (NavItem & { perm?: Permission })[] = [
  { href: "/dashboard", label: "Tableau de bord", short: "Accueil", icon: "dashboard", section: "Général" },
  { href: "/notifications", label: "Notifications", icon: "bell", section: "Général" },
  { href: "/messages", label: "Messages & rappels", icon: "messages", section: "Général", perm: "messages.write" },
  { href: "/documents", label: "Documents", icon: "documents", section: "Général" },
  { href: "/students", label: "Élèves", icon: "students", section: "Scolarité", perm: "students.read" },
  { href: "/guardians", label: "Parents", icon: "guardians", section: "Scolarité", perm: "students.write" },
  { href: "/attendance", label: "Présences", short: "Appels", icon: "attendance", section: "Scolarité", perm: "attendance.read" },
  { href: "/grades", label: "Notes", icon: "grades", section: "Scolarité", perm: "grades.read" },
  { href: "/schedule", label: "Emploi du temps", short: "Agenda", icon: "schedule", section: "Organisation", perm: "academics.read" },
  { href: "/academics", label: "Groupes, salles & cours", short: "Groupes", icon: "academics", section: "Organisation", perm: "academics.read" },
  { href: "/teachers", label: "Enseignants", icon: "teachers", section: "Organisation", perm: "teachers.read" },
  { href: "/payments", label: "Paiements", short: "Caisse", icon: "payments", section: "Finances", perm: "payments.read" },
  { href: "/unpaid", label: "Impayés", icon: "unpaid", section: "Finances", perm: "payments.read" },
  { href: "/expenses", label: "Dépenses", icon: "expenses", section: "Finances", perm: "expenses.read" },
  { href: "/payroll", label: "Rémunérations", icon: "payroll", section: "Finances", perm: "expenses.read" },
  { href: "/reports", label: "Rapports", icon: "reports", section: "Finances", perm: "reports.read" },
  { href: "/settings", label: "Paramètres", icon: "settings", section: "Administration", perm: "settings.manage" },
  { href: "/users", label: "Utilisateurs", icon: "users", section: "Administration", perm: "users.manage" },
  { href: "/audit", label: "Journal d'audit", icon: "audit", section: "Administration", perm: "audit.read" },
];

// Barre d'onglets mobile : les 4 destinations les plus utilisées par chaque rôle (le reste est dans « Menu »)
const TABS: Record<Role, string[]> = {
  ADMIN: ["/dashboard", "/students", "/attendance", "/payments"],
  RESPONSABLE: ["/dashboard", "/students", "/attendance", "/payments"],
  COMPTABLE: ["/dashboard", "/payments", "/unpaid", "/expenses"],
  ENSEIGNANT: ["/dashboard", "/attendance", "/grades", "/schedule"],
  LECTURE: ["/dashboard", "/students", "/schedule", "/attendance"],
};

async function logoutAction() {
  "use server";
  await logout();
  redirect("/login");
}

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  // Compte initial ou mot de passe réinitialisé : aucune autre page tant que le mot de passe n'est pas changé
  if (user.mustChangePassword && (await headers()).get("x-pathname") !== "/profile") redirect("/profile");
  const [year, { items: notices, unread }] = await Promise.all([
    db.schoolYear.findFirst({ where: { active: true }, select: { label: true } }),
    noticesFor(user),
  ]);
  const items = NAV.filter((n) => !n.perm || can(user.role, n.perm)).map((n) => ({ href: n.href, label: n.label, short: n.short, icon: n.icon, section: n.section }));
  const tabs = TABS[user.role].filter((h) => items.some((i) => i.href === h));
  return (
    <AppShell items={items} tabs={tabs} user={{ fullName: user.fullName, role: ROLE_LABELS[user.role], email: user.email }} yearLabel={year?.label ?? null} notices={notices} unread={unread} logout={logoutAction}>
      {children}
    </AppShell>
  );
}
