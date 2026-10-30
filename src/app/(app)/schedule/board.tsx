"use client";

import Link from "next/link";
import { useState } from "react";
import { AlertTriangle } from "lucide-react";
import clsx from "clsx";
import { formatMinutes, WEEKDAYS } from "@/lib/format";

export type BoardSlot = {
  id: string; weekday: number; startMin: number; endMin: number; groupId: string; group: string; color: string;
  room: string; teacher: string | null; conflicts: string[]; status?: "fait" | "a-faire"; absent?: number; href?: string;
};

/**
 * Emploi du temps : sur téléphone, un jour à la fois (onglets, aujourd'hui par défaut) en vue agenda ;
 * à partir de 768 px, la semaine en colonnes. Conflits (salle / enseignant) et appels du jour signalés sur chaque créneau.
 */
export function ScheduleBoard({ slots, days, today }: { slots: BoardSlot[]; days: number[]; today: number }) {
  const [day, setDay] = useState(days.includes(today) ? today : days[0]);
  return (
    <>
      <div role="tablist" aria-label="Jour affiché" className="no-print -mx-4 mb-4 flex gap-1.5 overflow-x-auto px-4 pb-1 [scrollbar-width:none] md:hidden">
        {days.map((d) => {
          const n = slots.filter((s) => s.weekday === d).length;
          return (
            <button key={d} type="button" role="tab" aria-selected={day === d} onClick={() => setDay(d)}
              className={clsx("flex min-h-12 min-w-14 shrink-0 flex-col items-center justify-center rounded-lg border px-2 text-xs font-semibold transition",
                day === d ? "border-navy bg-navy text-white" : "border-line bg-white text-navy")}>
              <span>{WEEKDAYS[d].slice(0, 3)}.</span>
              <span className={clsx("text-[11px] font-medium", day === d ? "text-white/80" : "text-muted")}>{d === today ? "auj." : `${n} cours`}</span>
            </button>
          );
        })}
      </div>
      <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6 print:grid-cols-6">
        {days.map((d) => {
          const daySlots = slots.filter((s) => s.weekday === d);
          return (
            <section key={d} aria-label={WEEKDAYS[d]} className={clsx("min-w-0 rounded-lg border bg-white", d === today ? "border-brand/40 ring-1 ring-brand/20" : "border-line", d !== day && "max-md:hidden print:block")}>
              <h2 className={clsx("flex flex-wrap items-center justify-between gap-x-2 rounded-t-lg px-3 py-2 text-sm font-bold", d === today ? "bg-brand text-white" : "bg-navy text-white")}>
                {WEEKDAYS[d]}{d === today && <span className="rounded-full bg-white/20 px-2 text-[11px] font-semibold">Aujourd&apos;hui</span>}
              </h2>
              <ol className="space-y-2 p-2">
                {daySlots.length === 0 && <li className="px-1 py-4 text-center text-sm text-muted">Aucun cours</li>}
                {daySlots.map((s) => (
                  <li key={s.id}>
                    <Link href={s.href ?? `/academics/groups/${s.groupId}`}
                      className={clsx("flex gap-3 rounded-md border-l-4 px-2.5 py-2 text-sm transition hover:bg-surface-2 md:block md:text-xs", s.conflicts.length ? "bg-danger-50" : "bg-surface")}
                      style={{ borderLeftColor: s.conflicts.length ? "#b42318" : s.color }}>
                      <span className="w-12 shrink-0 font-display font-bold text-navy tabular-nums md:w-auto">
                        {formatMinutes(s.startMin)}<span className="md:hidden"><br /></span><span className="hidden md:inline">–</span>
                        <span className="font-medium text-muted md:text-navy">{formatMinutes(s.endMin)}</span>
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block font-semibold text-ink">{s.group}</span>
                        <span className="block text-muted">{s.room}{s.teacher && ` · ${s.teacher}`}</span>
                        {s.status && (
                          <span className={clsx("mt-1 inline-block rounded-full px-1.5 text-[11px] font-semibold", s.status === "fait" ? (s.absent ? "bg-warning-50 text-warning-700" : "bg-success-50 text-success-700") : "bg-danger-50 text-danger-700")}>
                            {s.status === "fait" ? (s.absent ? `${s.absent} absent(s)` : "appel fait") : "appel à faire"}
                          </span>
                        )}
                        {s.conflicts.map((c) => (
                          <span key={c} className="mt-1 flex items-start gap-1 text-[11px] font-semibold text-danger-700"><AlertTriangle aria-hidden className="mt-px size-3 shrink-0" />{c}</span>
                        ))}
                      </span>
                    </Link>
                  </li>
                ))}
              </ol>
            </section>
          );
        })}
      </div>
    </>
  );
}
