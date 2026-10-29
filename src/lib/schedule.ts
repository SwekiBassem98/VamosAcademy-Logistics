// Détection de conflits d'emploi du temps — testée dans tests/unit.test.ts

export interface Slot {
  id?: string;
  weekday: number;
  startMin: number;
  endMin: number;
  roomId: string;
  groupId?: string;
  teacherId?: string | null;
  label?: string;
}

export interface Availability {
  weekday: number;
  startMin: number;
  endMin: number;
}

export function overlaps(a: Pick<Slot, "weekday" | "startMin" | "endMin">, b: Pick<Slot, "weekday" | "startMin" | "endMin">): boolean {
  return a.weekday === b.weekday && a.startMin < b.endMin && b.startMin < a.endMin;
}

/**
 * Conflits entre `candidate` et les créneaux existants : même salle, même enseignant ou même groupe
 * sur un horaire qui se chevauche ; et, si l'enseignant a déclaré des disponibilités, créneau hors disponibilité.
 */
export function findConflicts(candidate: Slot, existing: Slot[], availability: Availability[] = []): string[] {
  const msgs: string[] = [];
  for (const s of existing) {
    if (s.id && s.id === candidate.id) continue;
    if (!overlaps(candidate, s)) continue;
    const who = s.label ?? "autre groupe";
    if (candidate.groupId && s.groupId === candidate.groupId) msgs.push(`Le groupe a déjà un cours sur ce créneau`);
    else {
      if (s.roomId === candidate.roomId) msgs.push(`Salle déjà occupée (${who})`);
      if (candidate.teacherId && s.teacherId === candidate.teacherId) msgs.push(`Enseignant déjà pris (${who})`);
    }
  }
  if (candidate.teacherId && availability.length > 0) {
    const covered = availability.some(
      (a) => a.weekday === candidate.weekday && a.startMin <= candidate.startMin && a.endMin >= candidate.endMin,
    );
    if (!covered) msgs.push("Hors des disponibilités déclarées de l'enseignant");
  }
  return msgs;
}
