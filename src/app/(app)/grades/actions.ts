"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requirePermission } from "@/server/auth";
import { db } from "@/server/db";
import { audit } from "@/server/audit";
import { assertGroupAccess } from "@/server/scope";
import { runAction, BusinessError, type ActionState } from "@/server/action";
import { assessmentSchema, formToObject } from "@/lib/validation";
import { parseScore } from "@/lib/grades";
import { parseDay } from "@/lib/format";

export async function saveAssessment(id: string | null, _: ActionState, fd: FormData): Promise<ActionState> {
  let target = "";
  const res = await runAction(async () => {
    const user = await requirePermission("grades.write");
    const v = assessmentSchema.parse(formToObject(fd));
    await assertGroupAccess(user, v.groupId);
    const data = { ...v, date: parseDay(v.date) };
    if (id) {
      const before = await db.assessment.findUniqueOrThrow({ where: { id }, include: { grades: { where: { score: { not: null } } } } });
      if (before.groupId !== v.groupId) throw new BusinessError("Groupe non modifiable.");
      const over = before.grades.find((g) => (g.score ?? 0) > v.maxScore);
      if (over) throw new BusinessError(`Une note saisie (${over.score}) dépasse le nouveau barème.`);
      await db.assessment.update({ where: { id }, data });
      await audit(user.id, "assessment.update", "Group", v.groupId, { assessmentId: id, ...v });
    } else {
      const a = await db.assessment.create({ data });
      await audit(user.id, "assessment.create", "Group", v.groupId, { assessmentId: a.id, ...v });
      target = `/grades?group=${v.groupId}&a=${a.id}`;
    }
    revalidatePath("/grades");
    return "Évaluation enregistrée.";
  });
  if (res?.ok && target) redirect(target);
  return res;
}

export async function deleteAssessment(id: string) {
  const user = await requirePermission("grades.write");
  const a = await db.assessment.findUniqueOrThrow({ where: { id }, include: { _count: { select: { grades: true } } } });
  await assertGroupAccess(user, a.groupId);
  await db.assessment.delete({ where: { id } });
  await audit(user.id, "assessment.delete", "Group", a.groupId, { assessmentId: id, title: a.title, grades: a._count.grades });
  redirect(`/grades?group=${a.groupId}`);
}

export async function saveGrades(assessmentId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await requirePermission("grades.write");
    const a = await db.assessment.findUniqueOrThrow({
      where: { id: assessmentId },
      include: { group: { include: { enrollments: { where: { status: "ACTIVE" }, select: { studentId: true } } } } },
    });
    await assertGroupAccess(user, a.groupId);
    const errors: Record<string, string> = {};
    const rows = a.group.enrollments.map(({ studentId }) => {
      const raw = String(fd.get(`g_${studentId}`) ?? "");
      let score: number | null = null;
      try { score = parseScore(raw, a.maxScore); } catch (e) { errors[`g_${studentId}`] = (e as Error).message; }
      const comment = String(fd.get(`c_${studentId}`) ?? "").trim().slice(0, 500) || null;
      return { studentId, score, comment };
    });
    if (Object.keys(errors).length) {
      throw new BusinessError(`Notes invalides : ${Object.values(errors).join(" ; ")}`);
    }
    await db.$transaction(async (tx) => {
      for (const r of rows) {
        if (r.score == null && !r.comment) {
          await tx.grade.deleteMany({ where: { assessmentId, studentId: r.studentId } });
          continue;
        }
        await tx.grade.upsert({
          where: { assessmentId_studentId: { assessmentId, studentId: r.studentId } },
          update: { score: r.score, comment: r.comment },
          create: { assessmentId, ...r },
        });
      }
      await audit(user.id, "grades.save", "Group", a.groupId, { assessmentId, title: a.title, entered: rows.filter((r) => r.score != null).length }, tx);
    });
    revalidatePath("/grades");
    return `Notes enregistrées (${rows.filter((r) => r.score != null).length}/${rows.length}).`;
  });
}
