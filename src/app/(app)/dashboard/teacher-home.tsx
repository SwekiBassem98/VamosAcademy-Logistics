import Link from "next/link";
import { CalendarDays, CheckCircle2, ClipboardCheck, Clock3, DoorOpen, NotebookPen, Phone as PhoneIcon, Sparkles, UserX } from "lucide-react";
import { Card, CardLink, EmptyState, LinkButton, Badge, Stat } from "@/components/ui";
import type { CurrentUser } from "@/server/auth";
import { teacherHome, type Occurrence } from "@/server/services/teacher";
import { formatDate, formatDuration, formatMinutes, todayISO, WEEKDAYS } from "@/lib/format";
import { ClassCard } from "../classes/class-card";

const DAY = 86400_000;

function hello(now: number) {
  return now >= 18 * 60 ? "Bonsoir" : now < 12 * 60 ? "Bonjour" : "Bon après-midi";
}

/** « en cours », « dans 45 min », « demain à 09:00 », « samedi à 14:00 » */
function when(o: Occurrence, today: Date, now: number) {
  const days = Math.round((o.date.getTime() - today.getTime()) / DAY);
  if (days === 0) return o.startMin <= now ? `en cours · fin à ${formatMinutes(o.endMin)}` : `dans ${formatDuration(o.startMin - now)}`;
  if (days === 1) return `demain à ${formatMinutes(o.startMin)}`;
  return `${WEEKDAYS[o.weekday].toLowerCase()} à ${formatMinutes(o.startMin)}`;
}

export async function TeacherHome({ user, yearLabel }: { user: CurrentUser; yearLabel: string }) {
  const firstName = user.fullName.split(" ")[0];
  if (!user.teacherId) {
    return (
      <>
        <h1 className="mb-5 font-display text-2xl font-extrabold text-navy">Bienvenue {firstName}</h1>
        <EmptyState icon={<Sparkles />} title="Votre espace enseignant est presque prêt"
          text="Votre compte n'est pas encore relié à votre fiche enseignant. Contactez l'administration du centre : dès que c'est fait, vos classes et votre emploi du temps apparaîtront ici." />
      </>
    );
  }
  const h = await teacherHome(user);
  const today = todayISO();
  const pct = h.calls.expected ? Math.round((h.calls.done / h.calls.expected) * 100) : 100;
  const next = h.next;
  const nextIsToday = next && next.date.getTime() === h.today.getTime();
  // Agenda : 7 prochains jours, regroupés
  const week = Array.from({ length: 7 }, (_, i) => {
    const date = new Date(h.today.getTime() + i * DAY);
    return { date, items: h.occurrences.filter((o) => o.date.getTime() === date.getTime()) };
  });

  return (
    <div className="space-y-5 sm:space-y-6">
      {/* Accueil + prochain cours */}
      <section className="relative overflow-hidden rounded-xl bg-navy text-white shadow-sm">
        <span aria-hidden className="absolute inset-y-0 left-0 w-1.5 bg-brand" />
        <div className="grid gap-5 p-5 sm:p-6 lg:grid-cols-[1fr_minmax(0,24rem)] lg:items-center">
          <div className="min-w-0">
            <p className="text-sm text-white/70"><span className="capitalize">{WEEKDAYS[((h.today.getUTCDay() + 6) % 7) + 1].toLowerCase()}</span> {formatDate(new Date())} · Année {yearLabel}</p>
            <h1 className="mt-1 font-display text-2xl font-extrabold tracking-tight sm:text-3xl">{hello(h.now)} {h.firstName}</h1>
            <p className="mt-2 max-w-xl text-sm text-white/80">
              {h.todayOcc.length === 0 ? "Pas de cours aujourd'hui : profitez-en pour préparer vos prochaines séances."
                : `${h.todayOcc.length} séance${h.todayOcc.length > 1 ? "s" : ""} au programme aujourd'hui. Bonne journée de cours !`}
            </p>
          </div>
          {next ? (
            <div className="min-w-0 animate-pop rounded-lg bg-white p-4 text-ink shadow-sm">
              <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-brand"><Clock3 aria-hidden className="size-3.5" />Prochain cours · {when(next, h.today, h.now)}</p>
              <p className="mt-1.5 flex items-center gap-2 font-display text-lg font-bold text-navy">
                <span aria-hidden className="size-2.5 shrink-0 rounded-full" style={{ background: next.cls.subject.color }} />
                <span className="truncate">{next.cls.name}</span>
              </p>
              <p className="mt-0.5 text-sm text-muted">{formatMinutes(next.startMin)}–{formatMinutes(next.endMin)} · <DoorOpen aria-hidden className="inline size-3.5" /> {next.room} · {next.cls.students} élève{next.cls.students > 1 ? "s" : ""}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {nextIsToday && next.startMin - h.now <= 30
                  ? <LinkButton href={`/attendance?group=${next.cls.id}&date=${today}`} size="sm"><ClipboardCheck /> Faire l&apos;appel</LinkButton>
                  : null}
                <LinkButton href={`/classes/${next.cls.id}`} size="sm" variant="secondary">Voir la classe</LinkButton>
              </div>
            </div>
          ) : (
            <p className="rounded-lg bg-white/10 p-4 text-sm text-white/80">Aucun cours programmé dans les 7 prochains jours.</p>
          )}
        </div>
      </section>

      {/* Indicateurs */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <Stat label="Mes classes" value={h.classes.length} hint={`${h.students} élève${h.students > 1 ? "s" : ""} suivi${h.students > 1 ? "s" : ""}`} href="/classes" />
        <Stat label="Cours cette semaine" value={h.occurrences.filter((o) => o.date.getTime() - h.today.getTime() < 7 * DAY).length} hint="sur les 7 prochains jours" href="/schedule" />
        <div className="block min-w-0 rounded-lg border border-line bg-white p-3.5 shadow-xs sm:p-4">
          <p className="text-xs font-semibold text-muted">Appels de la semaine</p>
          <p className="mt-1.5 font-display text-xl font-extrabold text-navy tabular-nums sm:text-2xl">{h.calls.done}/{h.calls.expected}</p>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-2" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Appels faits cette semaine">
            <div className="h-full rounded-full bg-success-600 transition-[width] duration-700" style={{ width: `${pct}%` }} />
          </div>
        </div>
        <Stat label="Notifications" value={h.unread} hint={h.unread ? "non lues" : "tout est lu"} href="/notifications" tone={h.unread ? "brand" : "navy"} />
      </div>

      <div className="grid gap-5 sm:gap-6 lg:grid-cols-3">
        <div className="min-w-0 space-y-5 sm:space-y-6 lg:col-span-2">
          {/* Aujourd'hui */}
          <Card title="Aujourd'hui" description={h.todayOcc.length ? "Touchez une séance pour faire l'appel" : undefined} actions={<CardLink href="/attendance">Appels →</CardLink>} flush>
            {h.todayOcc.length === 0 ? <p className="px-4 py-6 text-sm text-muted sm:px-5">Aucune séance aujourd&apos;hui.</p> : (
              <ul className="divide-y divide-line">
                {h.todayOcc.map((o) => {
                  const absent = h.todayHeld.get(o.cls.id);
                  const done = absent !== undefined;
                  const future = o.startMin > h.now;
                  return (
                    <li key={o.slotId}>
                      <Link href={`/attendance?group=${o.cls.id}&date=${today}`} className="flex min-h-16 items-center gap-3 px-4 py-3 transition hover:bg-surface sm:px-5">
                        <span className="w-14 shrink-0 font-display text-sm font-bold text-navy tabular-nums">{formatMinutes(o.startMin)}<span className="block text-xs font-medium text-muted">{formatMinutes(o.endMin)}</span></span>
                        <span aria-hidden className="h-10 w-1 shrink-0 rounded-full" style={{ background: o.cls.subject.color }} />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-semibold text-ink">{o.cls.name}</span>
                          <span className="block truncate text-xs text-muted">{o.room} · {o.cls.students} élève{o.cls.students > 1 ? "s" : ""}</span>
                        </span>
                        {done ? <Badge tone={absent ? "amber" : "green"}>{absent ? `${absent} absent${absent > 1 ? "s" : ""}` : "appel fait"}</Badge>
                          : future ? <Badge tone="blue">à venir</Badge> : <Badge tone="red" dot>appel à faire</Badge>}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>

          {/* Mes classes */}
          <section aria-labelledby="mes-classes">
            <div className="mb-3 flex items-center justify-between">
              <h2 id="mes-classes" className="font-display text-lg font-bold text-navy">Mes classes</h2>
              <Link href="/classes" className="inline-flex min-h-10 items-center text-sm font-medium text-brand hover:underline">Tout voir →</Link>
            </div>
            {h.classes.length === 0
              ? <EmptyState title="Aucune classe pour le moment" text="L'administration vous affectera vos groupes ; ils apparaîtront ici automatiquement." />
              : <div className="grid gap-3 sm:grid-cols-2 sm:gap-4">{h.classes.map((c) => <ClassCard key={c.id} c={c} />)}</div>}
          </section>

          {/* Ma semaine */}
          <Card title="Mes 7 prochains jours" actions={<CardLink href="/schedule">Emploi du temps →</CardLink>}>
            <ol className="grid gap-2 sm:grid-cols-7 sm:gap-1.5">
              {week.map(({ date, items }, i) => (
                <li key={date.toISOString()} className={`min-w-0 rounded-md p-2 ${i === 0 ? "bg-brand-50 ring-1 ring-brand/20" : "bg-surface"} max-sm:flex max-sm:items-start max-sm:gap-3`}>
                  <p className="text-xs font-bold uppercase text-muted max-sm:w-20 max-sm:shrink-0 max-sm:pt-0.5">{i === 0 ? "Auj." : WEEKDAYS[((date.getUTCDay() + 6) % 7) + 1].slice(0, 3) + "."} <span className="font-medium normal-case">{formatDate(date).slice(0, 5)}</span></p>
                  <ul className="space-y-1 sm:mt-1.5">
                    {items.length === 0 && <li className="text-xs text-faint">—</li>}
                    {items.map((o) => (
                      <li key={o.slotId} className="min-w-0 text-xs sm:rounded sm:bg-white sm:p-1 sm:shadow-xs">
                        <span className="font-semibold tabular-nums text-navy">{formatMinutes(o.startMin)}</span>{" "}
                        <span className="text-ink sm:block sm:leading-tight sm:break-words">{o.cls.name}</span>
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ol>
          </Card>
        </div>

        <div className="min-w-0 space-y-5 sm:space-y-6">
          {/* À faire */}
          <Card title="À faire" flush>
            <ul className="divide-y divide-line text-sm">
              {h.missing.length === 0 && h.toGrade.length === 0 && (
                <li className="flex items-center gap-2 px-4 py-4 text-success-700 sm:px-5"><CheckCircle2 aria-hidden className="size-5" /> Tout est à jour, bravo !</li>
              )}
              {h.missing.slice(0, 5).map((o) => (
                <li key={`${o.slotId}:${o.date.toISOString()}`}>
                  <Link href={`/attendance?group=${o.cls.id}&date=${todayISO(o.date)}`} className="flex min-h-12 items-center gap-3 px-4 py-2 hover:bg-surface sm:px-5">
                    <ClipboardCheck aria-hidden className="size-4 shrink-0 text-brand" />
                    <span className="min-w-0 flex-1"><span className="block truncate font-medium text-ink">Appel {o.cls.name}</span><span className="text-xs text-muted">{WEEKDAYS[o.weekday]} {formatDate(o.date).slice(0, 5)} · {formatMinutes(o.startMin)}</span></span>
                  </Link>
                </li>
              ))}
              {h.toGrade.map((a) => (
                <li key={a.id}>
                  <Link href={`/grades?group=${a.groupId}&a=${a.id}`} className="flex min-h-12 items-center gap-3 px-4 py-2 hover:bg-surface sm:px-5">
                    <NotebookPen aria-hidden className="size-4 shrink-0 text-warning-600" />
                    <span className="min-w-0 flex-1"><span className="block truncate font-medium text-ink">Notes : {a.title}</span><span className="text-xs text-muted">{a.group.name} · {a._count.grades} note(s) saisie(s)</span></span>
                  </Link>
                </li>
              ))}
            </ul>
          </Card>

          {/* Absences */}
          <Card title="Absences récentes" description="14 derniers jours, dans vos classes" flush>
            {h.absences.length === 0 ? <p className="px-4 py-5 text-sm text-muted sm:px-5">Aucune absence. Vos élèves sont assidus !</p> : (
              <ul className="divide-y divide-line text-sm">
                {h.absences.map((a) => (
                  <li key={a.id}>
                    <Link href={`/students/${a.student.id}`} className="flex min-h-12 items-center gap-3 px-4 py-2 hover:bg-surface sm:px-5">
                      <UserX aria-hidden className="size-4 shrink-0 text-faint" />
                      <span className="min-w-0 flex-1"><span className="block truncate font-medium text-ink">{a.student.lastName} {a.student.firstName}</span><span className="text-xs text-muted">{formatDate(a.session.date)} · {a.session.group.name}</span></span>
                      <Badge tone={a.note ? "gray" : "amber"}>{a.note ? "justifiée" : "à justifier"}</Badge>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {/* Le centre */}
          {h.center && (
            <Card title="Le centre">
              <p className="font-semibold text-navy">{h.center.name}</p>
              <p className="mt-0.5 text-sm text-muted">{h.center.addressFr}</p>
              <a href={`tel:${h.center.phone.replace(/\s/g, "")}`} className="mt-3 inline-flex min-h-10 items-center gap-2 rounded-md bg-navy-50 px-3 text-sm font-semibold text-navy hover:bg-navy-100">
                <PhoneIcon aria-hidden className="size-4" /> Administration : {h.center.phone}
              </a>
              <p className="mt-3 text-xs text-muted">Un changement d&apos;horaire, une salle, un élève à signaler ? L&apos;administration s&apos;en occupe : un appel suffit.</p>
              <Link href="/schedule" className="mt-2 inline-flex min-h-10 items-center gap-1.5 text-sm font-medium text-brand hover:underline"><CalendarDays aria-hidden className="size-4" /> Mon emploi du temps</Link>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
