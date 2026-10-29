import "server-only";
import { db } from "../db";
import { BusinessError } from "../action";
import { findConflicts } from "@/lib/schedule";
import { formatMinutes, WEEKDAYS } from "@/lib/format";

/**
 * Vérifie un créneau (nouveau ou modifié) : salle, enseignant, groupe, disponibilités, capacité de la salle.
 * `teacherId` permet de simuler un changement d'enseignant du groupe.
 */
export async function assertSlotAllowed(input: {
  slotId?: string | null;
  groupId: string;
  roomId: string;
  weekday: number;
  startMin: number;
  endMin: number;
  teacherId?: string | null;
}) {
  const group = await db.group.findUniqueOrThrow({ where: { id: input.groupId } });
  const teacherId = input.teacherId === undefined ? group.teacherId : input.teacherId;
  const [room, existing, availability] = await Promise.all([
    db.room.findUniqueOrThrow({ where: { id: input.roomId } }),
    db.scheduleSlot.findMany({
      where: { weekday: input.weekday, group: { schoolYearId: group.schoolYearId, active: true } },
      include: { group: true },
    }),
    teacherId ? db.teacherAvailability.findMany({ where: { teacherId } }) : [],
  ]);
  if (room.capacity < group.capacity) {
    throw new BusinessError(`${room.name} (${room.capacity} places) est trop petite pour ce groupe (${group.capacity} élèves max.).`);
  }
  const conflicts = findConflicts(
    { id: input.slotId ?? undefined, groupId: group.id, weekday: input.weekday, startMin: input.startMin, endMin: input.endMin, roomId: input.roomId, teacherId },
    existing.map((s) => ({ ...s, groupId: s.groupId, teacherId: s.group.teacherId, label: `${s.group.name}, ${formatMinutes(s.startMin)}–${formatMinutes(s.endMin)}` })),
    availability,
  );
  if (conflicts.length) {
    throw new BusinessError(`Conflit ${WEEKDAYS[input.weekday]} ${formatMinutes(input.startMin)}–${formatMinutes(input.endMin)} : ${[...new Set(conflicts)].join(" ; ")}.`);
  }
}

/** Avant de changer l'enseignant d'un groupe : ses créneaux doivent rester compatibles. */
export async function assertTeacherCanTakeGroup(groupId: string, teacherId: string | null, subjectId: string) {
  if (!teacherId) return;
  const teacher = await db.teacher.findUniqueOrThrow({ where: { id: teacherId }, include: { subjects: true } });
  if (!teacher.active) throw new BusinessError("Cet enseignant est inactif.");
  if (teacher.subjects.length && !teacher.subjects.some((s) => s.subjectId === subjectId)) {
    throw new BusinessError(`${teacher.lastName} ${teacher.firstName} n'enseigne pas cette matière (à ajouter dans sa fiche si besoin).`);
  }
  const slots = await db.scheduleSlot.findMany({ where: { groupId } });
  for (const s of slots) await assertSlotAllowed({ slotId: s.id, groupId, roomId: s.roomId, weekday: s.weekday, startMin: s.startMin, endMin: s.endMin, teacherId });
}
