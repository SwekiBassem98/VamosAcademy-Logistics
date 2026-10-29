import Link from "next/link";
import clsx from "clsx";

const TABS = [
  { key: "general", href: "/settings", label: "Centre & années" },
  { key: "finance", href: "/settings/finance", label: "Tarifs & paiements" },
  { key: "templates", href: "/settings/templates", label: "Modèles de messages" },
] as const;

export function SettingsTabs({ active }: { active: (typeof TABS)[number]["key"] }) {
  return (
    <nav className="-mt-2 mb-6 flex gap-1 border-b border-line" aria-label="Sections des paramètres">
      {TABS.map((t) => (
        <Link key={t.key} href={t.href} aria-current={active === t.key ? "page" : undefined}
          className={clsx("-mb-px border-b-2 px-3 py-2 text-sm", active === t.key ? "border-brand font-medium text-navy" : "border-transparent text-muted hover:text-navy")}>
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
