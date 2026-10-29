"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requirePermission } from "@/server/auth";
import { db, type Tx } from "@/server/db";
import { audit } from "@/server/audit";
import { runAction, BusinessError, type ActionState } from "@/server/action";
import { nextStudentCode } from "@/server/services/students";
import { getActiveYear, syncInvoicesForEnrollment, voidUnpaidInvoices, changeEnrollmentTerms } from "@/server/services/finance";
import { notify } from "@/server/services/notifications";
import { studentSchema, guardianSchema, enrollmentSchema, termsSchema, formToObject } from "@/lib/validation";
import { applyDiscount, dueDateFor } from "@/lib/billing";
import { diff, isProbableDuplicate } from "@/lib/history";
import { parseDay, formatDate } from "@/lib/format";

function studentData(fd: FormData) {
  const v = studentSchema.parse(formToObject(fd));
  return { ...v, birthDate: v.birthDate ? parseDay(v.birthDate) : null, gender: v.gender ?? null };
}

/** Dossiers existants au nom identique (et même date de naissance si connue des deux côtés). */
async function findDuplicates(data: { firstName: string; lastName: string; birthDate: Date | null }, excludeId?: string) {
  const candidates = await db.student.findMany({
    where: {
      firstName: { equals: data.firstName, mode: "insensitive" },
      lastName: { equals: data.lastName, mode: "insensitive" },
      ...(excludeId ? { NOT: { id: excludeId } } : {}),
    },
    select: { id: true, code: true, firstName: true, lastName: true, birthDate: true },
  });
  return candidates.filter((c) => isProbableDuplicate(data, c));
}

export async function createStudent(_: ActionState, fd: FormData): Promise<ActionState> {
  let id = "";
  const res = await runAction(async () => {
    const user = await requirePermission("students.write");
    const data = studentData(fd);
    // Parent principal (facultatif à la création, recommandé)
    const parentPhone = String(fd.get("parent_phone") ?? "").trim();
    let parent = null;
    if (parentPhone) {
      const p = guardianSchema.safeParse({
        firstName: fd.get("parent_firstName"), lastName: fd.get("parent_lastName"), phone: parentPhone,
        relation: fd.get("parent_relation") || "Père", isPayer: true,
      });
      if (!p.success) throw new BusinessError(`Parent : ${p.error.issues.map((i) => i.message).join(", ")}.`);
      parent = p.data;
    }

    if (fd.get("confirmNotDuplicate") !== "on") {
      const dups = await findDuplicates(data);
      if (dups.length) {
        throw new BusinessError(
          `Dossier similaire déjà enregistré : ${dups.map((d) => `${d.lastName} ${d.firstName} (${d.code}${d.birthDate ? `, né(e) le ${formatDate(d.birthDate)}` : ""})`).join(" ; ")}. ` +
          "S'il s'agit bien d'un autre élève, cochez « Ce n'est pas un doublon » puis validez.",
        );
      }
    }
    const year = await getActiveYear();
    const student = await db.$transaction(async (tx) => {
      const code = await nextStudentCode(tx, year.label.slice(0, 4));
      const s = await tx.student.create({ data: { ...data, code } });
      if (parent) {
        const { relation, isPayer, ...g } = parent;
        const guardian = (await tx.guardian.findFirst({ where: { phone: g.phone } })) ?? (await tx.guardian.create({ data: g }));
        await tx.studentGuardian.create({ data: { studentId: s.id, guardianId: guardian.id, relation, isPayer } });
      }
      await audit(user.id, "student.create", "Student", s.id, { code, name: `${s.lastName} ${s.firstName}` }, tx);
      return s;
    });
    id = student.id;
    await notify({
      type: "NOUVEL_INSCRIT", permission: "students.read", dedupeKey: `student:${student.id}`,
      title: `Nouveau dossier : ${student.lastName} ${student.firstName}`, body: `${student.code}${student.status === "PREINSCRIT" ? " — pré-inscription à finaliser" : ""}`, href: `/students/${student.id}`,
    });
  });
  if (res?.ok) redirect(`/students/${id}?created=1`);
  return res;
}

export async function updateStudent(id: string, _: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await requirePermission("students.write");
    const data = studentData(fd);
    const before = await db.student.findUniqueOrThrow({ where: { id } });
    if ((data.status === "ARCHIVE") !== (before.status === "ARCHIVE")) {
      throw new BusinessError("Utilisez les boutons « Archiver » / « Réactiver » pour changer l'archivage.");
    }
    const dups = await findDuplicates(data, id);
    if (dups.length && fd.get("confirmNotDuplicate") !== "on" &&
        (data.firstName !== before.firstName || data.lastName !== before.lastName || +(data.birthDate ?? 0) !== +(before.birthDate ?? 0))) {
      throw new BusinessError(`Ces informations correspondent à un autre dossier (${dups.map((d) => d.code).join(", ")}).`);
    }
    const changes = diff(before as unknown as Record<string, unknown>, data);
    if (!changes.length) return "Aucune modification.";
    await db.student.update({ where: { id }, data });
    await audit(user.id, "student.update", "Student", id, { changes });
    revalidatePath(`/students/${id}`);
    return `Fiche mise à jour (${changes.length} champ(s) modifié(s)).`;
  });
}

async function closeEnrollment(tx: Tx, enrollmentId: string, end: Date, reason: string) {
  await tx.enrollment.update({ where: { id: enrollmentId }, data: { status: "TERMINEE", endDate: end } });
  // Les mensualités postérieures à la sortie et sans paiement sont annulées (jamais supprimées)
  const next = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() + 1, 1)).toISOString().slice(0, 7);
  await voidUnpaidInvoices(tx, enrollmentId, next, reason);
}

export async function archiveStudent(id: string, fd: FormData) {
  const user = await requirePermission("students.write");
  const reason = String(fd.get("reason") ?? "").trim();
  if (reason.length < 3) return { error: "Indiquez le motif de l'archivage." };
  const now = new Date();
  await db.$transaction(async (tx) => {
    const active = await tx.enrollment.findMany({ where: { studentId: id, status: "ACTIVE" }, select: { id: true } });
    for (const e of active) await closeEnrollment(tx, e.id, now, `Dossier archivé : ${reason}`);
    await tx.student.update({ where: { id }, data: { status: "ARCHIVE", archivedAt: now } });
    await audit(user.id, "student.archive", "Student", id, { reason, closedEnrollments: active.length }, tx);
  });
  revalidatePath(`/students/${id}`);
}

export async function restoreStudent(id: string) {
  const user = await requirePermission("students.write");
  await db.student.update({ where: { id }, data: { status: "ACTIF", archivedAt: null } });
  await audit(user.id, "student.restore", "Student", id);
  revalidatePath(`/students/${id}`);
}

export async function addGuardian(studentId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await requirePermission("students.write");
    const { relation, isPayer, ...g } = guardianSchema.parse(formToObject(fd));
    // Réutilise le tuteur s'il existe déjà avec ce téléphone (fratrie)
    const existing = await db.guardian.findFirst({ where: { phone: g.phone } });
    const guardian = existing ?? (await db.guardian.create({ data: g }));
    await db.studentGuardian.upsert({
      where: { studentId_guardianId: { studentId, guardianId: guardian.id } },
      update: { relation, isPayer },
      create: { studentId, guardianId: guardian.id, relation, isPayer },
    });
    await audit(user.id, "guardian.link", "Student", studentId, { guardianId: guardian.id, name: `${guardian.lastName} ${guardian.firstName}`, reused: !!existing });
    revalidatePath(`/students/${studentId}`);
    return existing ? "Parent existant (même téléphone) relié à l'élève." : "Parent ajouté.";
  });
}

export async function updateGuardian(studentId: string, guardianId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await requirePermission("students.write");
    const { relation, isPayer, ...g } = guardianSchema.parse(formToObject(fd));
    const before = await db.guardian.findUniqueOrThrow({ where: { id: guardianId } });
    await db.$transaction([
      db.guardian.update({ where: { id: guardianId }, data: g }),
      db.studentGuardian.update({ where: { studentId_guardianId: { studentId, guardianId } }, data: { relation, isPayer } }),
    ]);
    await audit(user.id, "guardian.update", "Guardian", guardianId, { changes: diff(before as unknown as Record<string, unknown>, g) });
    revalidatePath(`/students/${studentId}`);
    return "Parent mis à jour.";
  });
}

export async function unlinkGuardian(studentId: string, guardianId: string) {
  const user = await requirePermission("students.write");
  await db.studentGuardian.delete({ where: { studentId_guardianId: { studentId, guardianId } } });
  await audit(user.id, "guardian.unlink", "Student", studentId, { guardianId });
  revalidatePath(`/students/${studentId}`);
}

export async function enrollStudent(studentId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await requirePermission("students.write");
    const v = enrollmentSchema.parse(formToObject(fd));
    const student = await db.student.findUniqueOrThrow({ where: { id: studentId } });
    if (student.status === "ARCHIVE") throw new BusinessError("Dossier archivé : réactivez-le avant de l'inscrire.");
    const group = await db.group.findUniqueOrThrow({
      where: { id: v.groupId },
      include: { _count: { select: { enrollments: { where: { status: "ACTIVE" } } } }, schoolYear: true },
    });
    if (!group.active) throw new BusinessError("Ce groupe est archivé.");
    if (group._count.enrollments >= group.capacity) throw new BusinessError("Ce groupe est complet.");
    const already = await db.enrollment.findUnique({ where: { studentId_groupId: { studentId, groupId: group.id } } });
    if (already) throw new BusinessError("L'élève est déjà inscrit dans ce groupe.");
    const discount = v.discountTypeId ? await db.discountType.findFirst({ where: { id: v.discountTypeId, active: true } }) : null;
    if (v.discountTypeId && !discount) throw new BusinessError("Réduction non autorisée.");
    const start = parseDay(v.startDate);
    if (start < group.schoolYear.startDate || start > group.schoolYear.endDate) throw new BusinessError(`La date d'entrée doit être dans l'année ${group.schoolYear.label}.`);

    await db.$transaction(async (tx) => {
      const e = await tx.enrollment.create({
        data: {
          studentId, groupId: group.id, startDate: start,
          baseFee: group.monthlyFee,
          monthlyFee: applyDiscount(group.monthlyFee, { percent: discount?.percent }),
          discountTypeId: discount?.id ?? null,
          discountPercent: discount?.percent ?? 0,
          discountNote: v.discountNote,
          plan: v.plan,
        },
      });
      if (v.chargeRegistration && group.registrationFee > 0) {
        await tx.invoice.create({
          data: { enrollmentId: e.id, kind: "INSCRIPTION", period: "INSCRIPTION", amount: group.registrationFee, dueDate: dueDateFor(v.startDate.slice(0, 7), group.schoolYear.dueDay, start) },
        });
      }
      await syncInvoicesForEnrollment(e.id, tx);
      if (student.status === "PREINSCRIT") await tx.student.update({ where: { id: studentId }, data: { status: "ACTIF" } });
      await audit(user.id, "enrollment.create", "Student", studentId, { enrollmentId: e.id, group: group.name, monthlyFee: e.monthlyFee, plan: v.plan, discount: discount?.name ?? null }, tx);
    });
    await notify({
      type: "NOUVEL_INSCRIT", permission: "students.read", teacherId: group.teacherId, dedupeKey: `enroll:${studentId}:${group.id}`,
      title: `Nouvel inscrit dans ${group.name} : ${student.lastName} ${student.firstName}`, href: `/students/${studentId}`,
    });
    revalidatePath(`/students/${studentId}`);
    return "Inscription enregistrée et échéancier généré.";
  });
}

export async function endEnrollment(enrollmentId: string, fd: FormData) {
  const user = await requirePermission("students.write");
  const endDate = String(fd.get("endDate") || "");
  const end = /^\d{4}-\d{2}-\d{2}$/.test(endDate) ? parseDay(endDate) : new Date();
  const e = await db.enrollment.findUniqueOrThrow({ where: { id: enrollmentId }, include: { group: true } });
  if (e.status !== "ACTIVE") return { error: "Inscription déjà terminée." };
  if (end < e.startDate) return { error: "La date de sortie précède la date d'entrée." };
  await db.$transaction(async (tx) => {
    await closeEnrollment(tx, enrollmentId, end, `Fin d'inscription au ${end.toISOString().slice(0, 10)}`);
    await audit(user.id, "enrollment.end", "Student", e.studentId, { enrollmentId, group: e.group.name, endDate: end.toISOString().slice(0, 10) }, tx);
  });
  revalidatePath(`/students/${e.studentId}`);
}

/** Modifie le tarif / l'échéancier d'une inscription (échéances futures non payées annulées puis régénérées). */
export async function changeTerms(enrollmentId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await requirePermission("students.write");
    await requirePermission("payments.write"); // impact financier : responsable ou comptable avec droit d'encaissement
    const v = termsSchema.parse(formToObject(fd));
    const e = await db.enrollment.findUniqueOrThrow({ where: { id: enrollmentId } });
    const r = await changeEnrollmentTerms(enrollmentId, v, user.id);
    revalidatePath(`/students/${e.studentId}`);
    return `Conditions modifiées : ${r.voided} échéance(s) annulée(s), ${r.created} créée(s). L'historique est conservé.`;
  });
}

/** Archivage groupé : motif obligatoire ; chaque dossier est traité comme un archivage individuel (historique conservé). */
export async function archiveStudents(fd: FormData): Promise<ActionState> {
  const res = await runAction(async () => {
    const user = await requirePermission("students.write");
    const ids = String(fd.get("ids") ?? "").split(",").filter(Boolean).slice(0, 200);
    const reason = String(fd.get("reason") ?? "").trim();
    if (!ids.length) throw new BusinessError("Aucun élève sélectionné.");
    if (reason.length < 3) throw new BusinessError("Indiquez le motif de l'archivage.");
    const students = await db.student.findMany({ where: { id: { in: ids }, status: { not: "ARCHIVE" } }, select: { id: true } });
    const now = new Date();
    for (const s of students) {
      await db.$transaction(async (tx) => {
        const active = await tx.enrollment.findMany({ where: { studentId: s.id, status: "ACTIVE" }, select: { id: true } });
        for (const e of active) await closeEnrollment(tx, e.id, now, `Dossier archivé : ${reason}`);
        await tx.student.update({ where: { id: s.id }, data: { status: "ARCHIVE", archivedAt: now } });
        await audit(user.id, "student.archive", "Student", s.id, { reason, bulk: true, closedEnrollments: active.length }, tx);
      });
    }
    return `${students.length} dossier(s) archivé(s).`;
  });
  revalidatePath("/students");
  return res;
}
