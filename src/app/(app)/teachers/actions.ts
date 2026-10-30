"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requirePermission } from "@/server/auth";
import { db } from "@/server/db";
import { audit } from "@/server/audit";
import { runAction, BusinessError, type ActionState } from "@/server/action";
import { teacherSchema, availabilitySchema, formToObject } from "@/lib/validation";
import { overlaps } from "@/lib/schedule";
import { diff } from "@/lib/history";
import { parseMoney } from "@/lib/format";

function parse(fd: FormData) {
  const { subjectIds, cycleIds, payRate, ...v } = teacherSchema.parse(formToObject(fd, ["subjectIds", "cycleIds"]));
  const rate = v.payMode === "POURCENTAGE" ? Number(payRate.replace(",", ".")) : parseMoney(payRate);
  if (rate === null || Number.isNaN(rate) || rate < 0 || (v.payMode === "POURCENTAGE" && rate > 100)) {
    throw new BusinessError("Taux de rémunération invalide.");
  }
  return { data: { ...v, payRate: Math.round(rate) }, subjectIds, cycleIds };
}

export async function saveTeacher(id: string | null, _: ActionState, fd: FormData): Promise<ActionState> {
  let createdId = "";
  const res = await runAction(async () => {
    const user = await requirePermission("teachers.write");
    const { data, subjectIds, cycleIds } = parse(fd);
    const dup = await db.teacher.findFirst({ where: { phone: data.phone, ...(id ? { NOT: { id } } : {}) } });
    if (dup) throw new BusinessError(`Ce téléphone est déjà celui de ${dup.lastName} ${dup.firstName}.`);
    const active = id ? fd.get("active") === "on" : true;
    const relations = {
      subjects: { create: subjectIds.map((subjectId) => ({ subjectId })) },
      cycles: { create: cycleIds.map((cycleId) => ({ cycleId })) },
    };
    if (id) {
      const before = await db.teacher.findUniqueOrThrow({ where: { id } });
      await db.teacher.update({
        where: { id },
        data: { ...data, active, subjects: { deleteMany: {}, ...relations.subjects }, cycles: { deleteMany: {}, ...relations.cycles } },
      });
      await audit(user.id, "teacher.update", "Teacher", id, { changes: diff(before as unknown as Record<string, unknown>, { ...data, active }), subjectIds, cycleIds });
    } else {
      const t = await db.teacher.create({ data: { ...data, ...relations } });
      await audit(user.id, "teacher.create", "Teacher", t.id, { ...data });
      createdId = t.id;
    }
    revalidatePath("/teachers");
    return "Enseignant enregistré.";
  });
  if (res?.ok && createdId) redirect(`/teachers/${createdId}`);
  return res;
}

export async function addAvailability(teacherId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await requirePermission("teachers.write");
    const v = availabilitySchema.parse(formToObject(fd));
    const existing = await db.teacherAvailability.findMany({ where: { teacherId, weekday: v.weekday } });
    if (existing.some((a) => overlaps(a, { weekday: v.weekday, startMin: v.start, endMin: v.end }))) {
      throw new BusinessError("Cette plage chevauche une disponibilité déjà déclarée.");
    }
    await db.teacherAvailability.create({ data: { teacherId, weekday: v.weekday, startMin: v.start, endMin: v.end } });
    await audit(user.id, "teacher.availability.add", "Teacher", teacherId, v);
    revalidatePath(`/teachers/${teacherId}`);
    return "Disponibilité ajoutée.";
  });
}

export async function deleteAvailability(id: string): Promise<ActionState> {
  return runAction(async () => {
    const user = await requirePermission("teachers.write");
    const a = await db.teacherAvailability.findUnique({ where: { id } });
    if (!a) throw new BusinessError("Cette disponibilité a déjà été retirée.");
    await db.teacherAvailability.delete({ where: { id } });
    await audit(user.id, "teacher.availability.delete", "Teacher", a.teacherId, { weekday: a.weekday, startMin: a.startMin, endMin: a.endMin });
    revalidatePath(`/teachers/${a.teacherId}`);
    return "Disponibilité retirée.";
  });
}
