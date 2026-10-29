"use server";

import { revalidatePath } from "next/cache";
import type { AttendanceStatus } from "@prisma/client";
import { requirePermission } from "@/server/auth";
import { db } from "@/server/db";
import { audit } from "@/server/audit";
import { assertGroupAccess } from "@/server/scope";
import { runAction, BusinessError, type ActionState } from "@/server/action";
import { formatDate, parseDay, todayISO } from "@/lib/format";
import { notify, resolveByKey } from "@/server/services/notifications";

const STATUSES: AttendanceStatus[] = ["PRESENT", "ABSENT", "RETARD", "EXCUSE"];

export async function saveAttendance(groupId: string, date: string, _: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await requirePermission("attendance.write");
    await assertGroupAccess(user, groupId);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new BusinessError("Date invalide.");
    if (date > todayISO()) throw new BusinessError("Impossible de faire l'appel pour une date future.");
    const group = await db.group.findUniqueOrThrow({
      where: { id: groupId },
      include: { schoolYear: true, enrollments: { where: { status: "ACTIVE" }, select: { studentId: true } } },
    });
    const day = parseDay(date);
    if (day < group.schoolYear.startDate || day > group.schoolYear.endDate) throw new BusinessError(`Date hors de l'année ${group.schoolYear.label}.`);
    const records = group.enrollments.map(({ studentId }) => {
      const status = String(fd.get(`s_${studentId}`) ?? "PRESENT") as AttendanceStatus;
      if (!STATUSES.includes(status)) throw new BusinessError("Statut invalide.");
      const note = String(fd.get(`n_${studentId}`) ?? "").trim().slice(0, 300) || null;
      return { studentId, status, note: status === "PRESENT" ? null : note };
    });
    const topic = String(fd.get("topic") || "").trim().slice(0, 200) || null;
    await db.$transaction(async (tx) => {
      const session = await tx.attendanceSession.upsert({
        where: { groupId_date: { groupId, date: day } },
        update: { topic },
        create: { groupId, date: day, topic },
      });
      for (const r of records) {
        await tx.attendanceRecord.upsert({
          where: { sessionId_studentId: { sessionId: session.id, studentId: r.studentId } },
          update: { status: r.status, note: r.note },
          create: { sessionId: session.id, ...r },
        });
      }
      await audit(user.id, "attendance.save", "Group", groupId, {
        date, absents: records.filter((r) => r.status === "ABSENT").length, retards: records.filter((r) => r.status === "RETARD").length,
      }, tx);
    });
    // Notifications : une par absence ; les alertes « justificatif manquant » se ferment si un motif est saisi
    const saved = await db.attendanceRecord.findMany({ where: { session: { groupId, date: day } }, include: { student: true } });
    for (const r of saved) {
      if (r.status === "ABSENT") {
        await notify({
          type: "ABSENCE", permission: "students.write", dedupeKey: `abs:${r.id}`,
          title: `Absence : ${r.student.lastName} ${r.student.firstName}`, body: `${group.name} — ${formatDate(day)}`, href: `/students/${r.studentId}`,
        });
      }
      if (r.note || r.status !== "ABSENT") await resolveByKey(`just:${r.id}`, r.note ? `Justificatif : ${r.note}` : "Statut modifié");
    }
    revalidatePath("/attendance");
    const n = (st: AttendanceStatus) => records.filter((r) => r.status === st).length;
    return `Appel enregistré : ${n("PRESENT")} présent(s), ${n("RETARD")} retard(s), ${n("ABSENT")} absent(s), ${n("EXCUSE")} excusé(s).`;
  });
}
