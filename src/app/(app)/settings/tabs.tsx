import Link from "next/link";
import clsx from "clsx";

const TABS = [
  { key: "general", href: "/settings", label: "Centre & années" },
  { key: "finance", href: "/settings/finance", label: "Tarifs & paiements" },
  { key: "templates", href: "/settings/templates", label: "Modèles de messages" },
] as const;

export function SettingsTabs({ active }: { active: (typeof TABS)[number]["key"] }) {
  return (
    <nav className="-mx-4 -mt-2 mb-6 flex gap-1 overflow-x-auto border-b border-line px-4 [scrollbar-width:none] sm:mx-0 sm:px-0" aria-label="Sections des paramètres">
      {TABS.map((t) => (
        <Link key={t.key} href={t.href} aria-current={active === t.key ? "page" : undefined}
          className={clsx("-mb-px inline-flex min-h-11 shrink-0 items-center border-b-2 px-3 text-sm whitespace-nowrap", active === t.key ? "border-brand font-semibold text-navy" : "border-transparent text-muted hover:text-navy")}>
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
