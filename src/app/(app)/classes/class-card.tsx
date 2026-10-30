import Link from "next/link";
import { ChevronRight, DoorOpen, Users } from "lucide-react";
import { formatMinutes, WEEKDAYS } from "@/lib/format";
import type { TeacherClass } from "@/server/services/teacher";

/** Carte d'une classe de l'enseignant : matière, niveau, horaires, effectif et assiduité. */
export function ClassCard({ c }: { c: TeacherClass }) {
  return (
    <Link href={`/classes/${c.id}`}
      className="group relative flex min-w-0 flex-col overflow-hidden rounded-lg border border-line bg-white p-4 shadow-xs transition hover:-translate-y-0.5 hover:border-navy-200 hover:shadow-sm motion-reduce:hover:translate-y-0 sm:p-5">
      <span aria-hidden className="absolute inset-x-0 top-0 h-1" style={{ background: c.subject.color }} />
      <span className="flex items-start justify-between gap-2">
        <span className="min-w-0">
          <span className="block text-xs font-semibold uppercase tracking-wide" style={{ color: c.subject.color }}>{c.subject.name}</span>
          <span className="mt-0.5 block truncate font-display text-lg font-bold text-navy">{c.name}</span>
          <span className="block truncate text-sm text-muted">{c.level.name}</span>
        </span>
        <ChevronRight aria-hidden className="mt-1 size-5 shrink-0 text-faint transition group-hover:translate-x-0.5 group-hover:text-brand" />
      </span>
      <span className="mt-3 flex flex-wrap gap-1.5">
        {c.slots.length === 0 && <span className="text-xs text-muted">Horaires à définir par l&apos;administration</span>}
        {c.slots.map((s) => (
          <span key={s.id} className="inline-flex items-center rounded-full bg-navy-50 px-2 py-0.5 text-xs font-medium text-navy">
            {WEEKDAYS[s.weekday].slice(0, 3)}. {formatMinutes(s.startMin)}–{formatMinutes(s.endMin)}
          </span>
        ))}
      </span>
      <span className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-line pt-3 text-sm">
        <span className="inline-flex items-center gap-1.5 text-ink"><Users aria-hidden className="size-4 text-faint" />{c.students} élève{c.students > 1 ? "s" : ""}</span>
        {(c.room ?? c.slots[0]?.room) && <span className="inline-flex items-center gap-1.5 text-ink"><DoorOpen aria-hidden className="size-4 text-faint" />{(c.room ?? c.slots[0].room).name}</span>}
        <span className="ml-auto text-xs font-semibold text-muted">{c.attendanceRate == null ? "Pas encore d'appel" : `${c.attendanceRate} % de présence`}</span>
      </span>
    </Link>
  );
}

/** Initiales colorées d'un élève (pas de photo stockée). */
export function Initials({ first, last, color }: { first: string; last: string; color?: string }) {
  return (
    <span aria-hidden className="grid size-10 shrink-0 place-items-center rounded-full text-sm font-bold text-white" style={{ background: color ?? "var(--color-navy-700)" }}>
      {(first[0] ?? "").toUpperCase()}{(last.replace(/^Démo-/, "")[0] ?? "").toUpperCase()}
    </span>
  );
}
