import "server-only";
import { db } from "../db";
import type { CurrentUser } from "../auth";
import { visibleWhere } from "./notifications";
import { minutesNowTunis, parseDay, todayISO } from "@/lib/format";

const DAY = 86400_000;
export const weekdayOf = (d: Date) => ((d.getUTCDay() + 6) % 7) + 1;
const presentish = (s: string) => s === "PRESENT" || s === "RETARD";

/** Classes (groupes actifs de l'année active) de l'enseignant connecté, avec indicateurs. */
export async function teacherClasses(user: CurrentUser) {
  const teacherId = user.teacherId ?? "__aucun__";
  const today = parseDay(todayISO());
  const since = new Date(today.getTime() - 56 * DAY);
  const groups = await db.group.findMany({
    where: { teacherId, active: true, schoolYear: { active: true } },
    include: {
      subject: true, level: true, room: true,
      slots: { include: { room: true }, orderBy: [{ weekday: "asc" }, { startMin: "asc" }] },
      _count: { select: { enrollments: { where: { status: "ACTIVE" } } } },
      sessions: { where: { date: { gte: since } }, select: { date: true, records: { select: { status: true } } } },
    },
    orderBy: [{ subject: { name: "asc" } }, { name: "asc" }],
  });
  return groups.map((g) => {
    const recs = g.sessions.flatMap((s) => s.records);
    return {
      ...g,
      students: g._count.enrollments,
      attendanceRate: recs.length ? Math.round((recs.filter((r) => presentish(r.status)).length / recs.length) * 100) : null,
      lastSession: g.sessions.reduce<Date | null>((d, s) => (!d || s.date > d ? s.date : d), null),
    };
  });
}
export type TeacherClass = Awaited<ReturnType<typeof teacherClasses>>[number];

export type Occurrence = { slotId: string; date: Date; weekday: number; startMin: number; endMin: number; room: string; cls: TeacherClass };

/** Prochaines séances (aujourd'hui compris) sur `days` jours, dans l'ordre. */
export function upcomingOccurrences(classes: TeacherClass[], days = 7): Occurrence[] {
  const today = parseDay(todayISO());
  const out: Occurrence[] = [];
  for (let i = 0; i < days; i++) {
    const date = new Date(today.getTime() + i * DAY);
    const wd = weekdayOf(date);
    for (const c of classes) for (const s of c.slots) if (s.weekday === wd) out.push({ slotId: s.id, date, weekday: wd, startMin: s.startMin, endMin: s.endMin, room: s.room.name, cls: c });
  }
  return out.sort((a, b) => a.date.getTime() - b.date.getTime() || a.startMin - b.startMin);
}

/** Tout ce que l'accueil enseignant affiche, calculé côté serveur sur ses seuls groupes. */
export async function teacherHome(user: CurrentUser) {
  const classes = await teacherClasses(user);
  const ids = classes.map((c) => c.id);
  const today = parseDay(todayISO());
  const wd = weekdayOf(today);
  const monday = new Date(today.getTime() - (wd - 1) * DAY);
  const now = minutesNowTunis();
  const [weekSessions, absences, assessments, unread, center, distinctStudents, teacher] = await Promise.all([
    db.attendanceSession.findMany({ where: { groupId: { in: ids }, date: { gte: monday, lte: today } }, select: { groupId: true, date: true, records: { select: { status: true } } } }),
    db.attendanceRecord.findMany({
      where: { status: "ABSENT", session: { groupId: { in: ids }, date: { gte: new Date(today.getTime() - 14 * DAY) } } },
      include: { student: { select: { id: true, firstName: true, lastName: true } }, session: { select: { date: true, group: { select: { name: true } } } } },
      orderBy: { session: { date: "desc" } }, take: 6,
    }),
    db.assessment.findMany({
      where: { groupId: { in: ids } },
      select: { id: true, title: true, date: true, groupId: true, group: { select: { name: true } }, _count: { select: { grades: { where: { score: { not: null } } } } } },
      orderBy: { date: "desc" }, take: 30,
    }),
    db.notification.count({ where: { ...visibleWhere(user), status: "NOUVELLE" } }),
    db.centerSettings.findUnique({ where: { id: 1 } }),
    db.enrollment.findMany({ where: { groupId: { in: ids }, status: "ACTIVE" }, distinct: ["studentId"], select: { studentId: true } }),
    db.teacher.findUnique({ where: { id: user.teacherId ?? "__aucun__" }, select: { firstName: true } }),
  ]);
  const held = new Set(weekSessions.map((s) => `${s.groupId}:${s.date.toISOString().slice(0, 10)}`));
  // Appels attendus depuis lundi : séances passées ou commencées aujourd'hui
  const expected: Occurrence[] = [];
  for (let d = 0; d < wd; d++) {
    const date = new Date(monday.getTime() + d * DAY);
    const w = weekdayOf(date);
    for (const c of classes) for (const s of c.slots) {
      if (s.weekday !== w || (d === wd - 1 && s.startMin > now)) continue;
      expected.push({ slotId: s.id, date, weekday: w, startMin: s.startMin, endMin: s.endMin, room: s.room.name, cls: c });
    }
  }
  const missing = expected.filter((o) => !held.has(`${o.cls.id}:${o.date.toISOString().slice(0, 10)}`));
  const counts = new Map(classes.map((c) => [c.id, c.students]));
  const toGrade = assessments.filter((a) => a._count.grades < (counts.get(a.groupId) ?? 0)).slice(0, 5);
  const occurrences = upcomingOccurrences(classes);
  const todayOcc = occurrences.filter((o) => o.date.getTime() === today.getTime());
  const next = occurrences.find((o) => o.date.getTime() > today.getTime() || o.endMin > now) ?? null;
  return {
    firstName: teacher?.firstName ?? user.fullName.split(" ")[0],
    classes, now, today, todayOcc, next, occurrences, missing, toGrade, absences, unread, center,
    calls: { expected: expected.length, done: expected.length - missing.length },
    todayHeld: new Map(weekSessions.filter((s) => s.date.toISOString().slice(0, 10) === today.toISOString().slice(0, 10)).map((s) => [s.groupId, s.records.filter((r) => r.status === "ABSENT").length])),
    students: distinctStudents.length,
  };
}
