"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requirePermission } from "@/server/auth";
import { db } from "@/server/db";
import { audit } from "@/server/audit";
import { runAction, BusinessError, type ActionState } from "@/server/action";
import { getActiveYear } from "@/server/services/finance";
import { assertSlotAllowed, assertTeacherCanTakeGroup } from "@/server/services/schedule";
import { suggestedFee } from "@/server/services/fees";
import { groupSchema, slotSchema, formToObject } from "@/lib/validation";
import { diff } from "@/lib/history";

const name = z.string().trim().min(1, "Nom obligatoire");

export async function createLevel(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await requirePermission("academics.write");
    const v = z.object({ cycleId: z.string().min(1, "Cycle obligatoire"), name }).parse(formToObject(fd));
    const order = (await db.level.count({ where: { cycleId: v.cycleId } })) + 1;
    const l = await db.level.create({ data: { ...v, order } });
    await audit(user.id, "level.create", "Level", l.id, v);
    revalidatePath("/academics");
    return "Niveau ajouté.";
  });
}

export async function createSubject(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await requirePermission("academics.write");
    const v = z.object({
      code: z.string().trim().toUpperCase().regex(/^[A-Z0-9_-]{2,10}$/, "Code : 2 à 10 lettres/chiffres"),
      name,
      color: z.string().regex(/^#[0-9a-fA-F]{6}$/).default("#C1272D"),
    }).parse(formToObject(fd));
    const s = await db.subject.create({ data: v });
    await audit(user.id, "subject.create", "Subject", s.id, v);
    revalidatePath("/academics");
    return "Matière ajoutée.";
  });
}

export async function saveRoom(id: string | null, _: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await requirePermission("academics.write");
    const v = z.object({ name, capacity: z.coerce.number().int().min(1, "Capacité invalide").max(200) }).parse(formToObject(fd));
    const r = id ? await db.room.update({ where: { id }, data: v }) : await db.room.create({ data: v });
    await audit(user.id, id ? "room.update" : "room.create", "Room", r.id, v);
    revalidatePath("/academics");
    return id ? "Salle modifiée." : "Salle ajoutée.";
  });
}

/** Suppressions du référentiel : refusées si des données y sont rattachées. */
export async function deleteReference(kind: "room" | "subject" | "level", id: string): Promise<ActionState> {
  return runAction(async () => {
    const user = await requirePermission("academics.write");
    const used =
      kind === "room" ? await db.group.count({ where: { roomId: id } }) + (await db.scheduleSlot.count({ where: { roomId: id } }))
      : kind === "subject" ? await db.group.count({ where: { subjectId: id } })
      : await db.group.count({ where: { levelId: id } }) + (await db.student.count({ where: { levelId: id } }));
    if (used) throw new BusinessError("Suppression impossible : élément utilisé par des groupes, créneaux ou élèves.");
    if (kind === "room") await db.room.delete({ where: { id } });
    else if (kind === "subject") await db.subject.delete({ where: { id } });
    else await db.level.delete({ where: { id } });
    await audit(user.id, `${kind}.delete`, kind, id);
    revalidatePath("/academics");
    return kind === "room" ? "Salle supprimée." : kind === "subject" ? "Matière supprimée." : "Niveau supprimé.";
  });
}

async function groupData(fd: FormData, groupId?: string) {
  const parsed = groupSchema.parse(formToObject(fd));
  // Tarif vide → grille tarifaire de l'année
  const yearId = groupId ? (await db.group.findUniqueOrThrow({ where: { id: groupId } })).schoolYearId : (await getActiveYear()).id;
  const rule = parsed.monthlyFee == null || parsed.registrationFee == null ? await suggestedFee(yearId, parsed.levelId, parsed.subjectId) : null;
  const monthlyFee = parsed.monthlyFee ?? rule?.monthlyFee;
  if (monthlyFee == null) throw new BusinessError("Aucun tarif dans la grille pour ce niveau / cette matière : saisissez la mensualité ou complétez la grille tarifaire (Paramètres).");
  const v = { ...parsed, monthlyFee, registrationFee: parsed.registrationFee ?? rule?.registrationFee ?? 0 };
  if (v.roomId) {
    const room = await db.room.findUniqueOrThrow({ where: { id: v.roomId } });
    if (room.capacity < v.capacity) throw new BusinessError(`${room.name} n'a que ${room.capacity} places pour une capacité de ${v.capacity}.`);
  }
  if (groupId) await assertTeacherCanTakeGroup(groupId, v.teacherId, v.subjectId);
  else if (v.teacherId) {
    const t = await db.teacher.findUniqueOrThrow({ where: { id: v.teacherId }, include: { subjects: true } });
    if (t.subjects.length && !t.subjects.some((s) => s.subjectId === v.subjectId)) throw new BusinessError(`${t.lastName} ${t.firstName} n'enseigne pas cette matière.`);
  }
  return v;
}

export async function createGroup(_: ActionState, fd: FormData): Promise<ActionState> {
  let id = "";
  const res = await runAction(async () => {
    const user = await requirePermission("academics.write");
    const v = await groupData(fd);
    const year = await getActiveYear();
    const g = await db.group.create({ data: { ...v, schoolYearId: year.id } });
    await audit(user.id, "group.create", "Group", g.id, v);
    id = g.id;
  });
  if (res?.ok) redirect(`/academics/groups/${id}`);
  return res;
}

export async function updateGroup(id: string, _: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await requirePermission("academics.write");
    const before = await db.group.findUniqueOrThrow({ where: { id }, include: { _count: { select: { enrollments: { where: { status: "ACTIVE" } } } } } });
    const v = await groupData(fd, id);
    const active = fd.get("active") === "on";
    if (v.capacity < before._count.enrollments) throw new BusinessError(`Capacité inférieure au nombre d'inscrits (${before._count.enrollments}).`);
    if (!active && before._count.enrollments > 0) throw new BusinessError("Terminez d'abord les inscriptions en cours avant d'archiver le groupe.");
    const changes = diff(before as unknown as Record<string, unknown>, { ...v, active });
    await db.group.update({ where: { id }, data: { ...v, active } });
    await audit(user.id, "group.update", "Group", id, { changes });
    revalidatePath(`/academics/groups/${id}`);
    return "Groupe mis à jour. (Les mensualités des inscriptions existantes ne changent pas.)";
  });
}

export async function saveSlot(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await requirePermission("academics.write");
    const v = slotSchema.parse(formToObject(fd));
    await assertSlotAllowed({ slotId: v.slotId, groupId: v.groupId, roomId: v.roomId, weekday: v.weekday, startMin: v.start, endMin: v.end });
    const data = { groupId: v.groupId, roomId: v.roomId, weekday: v.weekday, startMin: v.start, endMin: v.end };
    const slot = v.slotId ? await db.scheduleSlot.update({ where: { id: v.slotId }, data }) : await db.scheduleSlot.create({ data });
    await audit(user.id, v.slotId ? "slot.update" : "slot.create", "Group", v.groupId, { slotId: slot.id, ...data });
    revalidatePath(`/academics/groups/${v.groupId}`);
    return v.slotId ? "Créneau modifié." : "Créneau ajouté.";
  });
}

export async function deleteSlot(slotId: string): Promise<ActionState> {
  return runAction(async () => {
    const user = await requirePermission("academics.write");
    const s = await db.scheduleSlot.findUnique({ where: { id: slotId } });
    if (!s) throw new BusinessError("Ce créneau a déjà été supprimé.");
    await db.scheduleSlot.delete({ where: { id: slotId } });
    await audit(user.id, "slot.delete", "Group", s.groupId, { slotId, weekday: s.weekday, startMin: s.startMin });
    revalidatePath(`/academics/groups/${s.groupId}`);
    revalidatePath("/schedule");
    return "Créneau supprimé.";
  });
}
