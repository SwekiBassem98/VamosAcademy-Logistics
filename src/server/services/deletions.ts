import "server-only";
import { db } from "../db";
import { audit } from "../audit";
import { BusinessError } from "../action";

function checkReason(reason: string) {
  if (reason.trim().length < 3) throw new BusinessError("Le motif de la suppression est obligatoire.");
}

/**
 * Suppression définitive d'un élève et de tout son dossier : paiements, échéances, présences, notes, messages et alertes.
 * Les parents qui n'ont plus aucun enfant sont supprimés avec leur accès au portail.
 * Le journal d'audit garde une trace (matricule, nom, numéros de reçus, total encaissé, motif).
 */
export async function deleteStudent(id: string, reason: string, userId: string) {
  checkReason(reason);
  return db.$transaction(async (tx) => {
    const s = await tx.student.findUnique({ where: { id }, include: { guardians: { select: { guardianId: true } } } });
    if (!s) throw new BusinessError("Cet élève a déjà été supprimé.");
    const payments = await tx.payment.findMany({ where: { studentId: id }, select: { id: true, receiptNo: true, amount: true, cancelledAt: true } });
    const collected = payments.filter((p) => !p.cancelledAt).reduce((t, p) => t + p.amount, 0);

    await tx.notification.deleteMany({ where: { OR: [{ href: { startsWith: `/students/${id}` } }, { href: { in: payments.map((p) => `/payments/${p.id}`) } }] } });
    await tx.message.deleteMany({ where: { studentId: id } });
    await tx.payment.deleteMany({ where: { studentId: id } }); // répartitions en cascade
    await tx.invoice.deleteMany({ where: { enrollment: { studentId: id } } });
    await tx.attendanceRecord.deleteMany({ where: { studentId: id } });
    await tx.grade.deleteMany({ where: { studentId: id } });
    await tx.enrollment.deleteMany({ where: { studentId: id } });
    await tx.student.delete({ where: { id } }); // liens parents en cascade

    const guardianIds = s.guardians.map((g) => g.guardianId);
    const orphans = await tx.guardian.findMany({ where: { id: { in: guardianIds }, students: { none: {} } }, select: { id: true, user: { select: { email: true } } } });
    const orphanIds = orphans.map((g) => g.id);
    await tx.user.deleteMany({ where: { guardianId: { in: orphanIds }, role: "PARENT" } });
    await tx.message.deleteMany({ where: { guardianId: { in: orphanIds } } });
    await tx.guardian.deleteMany({ where: { id: { in: orphanIds } } });

    await audit(userId, "student.delete", "Student", id, {
      code: s.code, name: `${s.lastName} ${s.firstName}`, reason: reason.trim(), payments: payments.length, collected,
      receiptNos: payments.map((p) => p.receiptNo), guardiansDeleted: orphanIds.length, parentAccountsDeleted: orphans.flatMap((g) => g.user?.email ?? []),
    }, tx);
    return { name: `${s.lastName} ${s.firstName}`, payments: payments.length };
  });
}

/**
 * Suppression définitive d'un enseignant, de ses rémunérations et de son compte d'accès.
 * Ses groupes restent, sans enseignant. Les dépenses déjà enregistrées pour ses rémunérations restent en comptabilité
 * (l'argent a bien été versé) : leur libellé conserve le nom de l'enseignant.
 */
export async function deleteTeacher(id: string, reason: string, userId: string) {
  checkReason(reason);
  return db.$transaction(async (tx) => {
    const t = await tx.teacher.findUnique({ where: { id }, include: { user: { select: { id: true, role: true, email: true } }, _count: { select: { groups: true } } } });
    if (!t) throw new BusinessError("Cet enseignant a déjà été supprimé.");
    if (t.user?.id === userId) throw new BusinessError("Cette fiche est liée à votre propre compte : retirez d'abord le lien depuis Utilisateurs.");
    const pays = await tx.teacherPay.findMany({ where: { teacherId: id }, select: { id: true, receiptNo: true, status: true, amount: true } });
    const paid = pays.filter((p) => p.status === "PAYE").reduce((s, p) => s + p.amount, 0);

    await tx.expense.updateMany({ where: { teacherPayId: { in: pays.map((p) => p.id) } }, data: { teacherPayId: null } });
    await tx.teacherPay.deleteMany({ where: { teacherId: id } });
    // Seul un compte enseignant disparaît avec sa fiche ; un autre rôle lié perd simplement le lien
    if (t.user?.role === "ENSEIGNANT") await tx.user.delete({ where: { id: t.user.id } });
    await tx.message.deleteMany({ where: { teacherId: id } });
    await tx.notification.deleteMany({ where: { teacherId: id } });
    await tx.group.updateMany({ where: { teacherId: id }, data: { teacherId: null } });
    await tx.teacher.delete({ where: { id } }); // disponibilités, matières et cycles en cascade

    await audit(userId, "teacher.delete", "Teacher", id, {
      name: `${t.lastName} ${t.firstName}`, phone: t.phone, reason: reason.trim(), groups: t._count.groups, pays: pays.length, paid,
      receiptNos: pays.flatMap((p) => p.receiptNo ?? []), accountDeleted: t.user?.role === "ENSEIGNANT" ? t.user.email : null,
    }, tx);
    return { name: `${t.lastName} ${t.firstName}`, groups: t._count.groups };
  });
}

/** Ce que la suppression d'un groupe effacerait (affiché dans la confirmation, revérifié à la suppression). */
export async function groupDeletionImpact(id: string, tx: Pick<typeof db, "enrollment" | "attendanceSession" | "assessment" | "paymentAllocation"> = db) {
  // L'une après l'autre : une transaction n'exécute qu'une requête à la fois
  const enrollments = await tx.enrollment.count({ where: { groupId: id } });
  const sessions = await tx.attendanceSession.count({ where: { groupId: id } });
  const assessments = await tx.assessment.count({ where: { groupId: id } });
  const allocations = await tx.paymentAllocation.count({ where: { invoice: { enrollment: { groupId: id } } } });
  return { enrollments, sessions, assessments, allocations, empty: enrollments + sessions + assessments === 0 };
}

/**
 * Suppression définitive d'un groupe, de ses créneaux, inscriptions, échéances non réglées, appels et notes.
 * Refusée dès qu'un paiement (même annulé) porte sur ses échéances : un reçu peut couvrir plusieurs groupes
 * et l'historique financier ne doit pas être réécrit. Un groupe contenant des données est réservé à l'administrateur.
 */
export async function deleteGroup(id: string, reason: string, userId: string, isAdmin: boolean) {
  return db.$transaction(async (tx) => {
    const g = await tx.group.findUnique({ where: { id }, include: { subject: true, level: true, schoolYear: true, teacher: true } });
    if (!g) throw new BusinessError("Ce groupe a déjà été supprimé.");
    const impact = await groupDeletionImpact(id, tx);
    if (impact.allocations) throw new BusinessError("Suppression impossible : des paiements sont enregistrés sur ce groupe. Archivez-le pour conserver l'historique financier.");
    if (!impact.empty) {
      if (!isAdmin) throw new BusinessError("Ce groupe contient des inscriptions, appels ou notes : seul un administrateur peut le supprimer.");
      checkReason(reason);
    }
    const students = await tx.enrollment.findMany({ where: { groupId: id }, select: { student: { select: { code: true } } } });

    await tx.notification.deleteMany({ where: { OR: [
      { href: `/academics/groups/${id}` }, { href: { startsWith: `/attendance?group=${id}` } }, { dedupeKey: { endsWith: `:${id}` } },
    ] } });
    await tx.invoice.deleteMany({ where: { enrollment: { groupId: id } } });
    await tx.enrollment.deleteMany({ where: { groupId: id } });
    await tx.group.delete({ where: { id } }); // créneaux, appels et évaluations en cascade (présences et notes avec eux)

    await audit(userId, "group.delete", "Group", id, {
      name: g.name, year: g.schoolYear.label, subject: g.subject.name, level: g.level.name, teacher: g.teacher ? `${g.teacher.lastName} ${g.teacher.firstName}` : null,
      monthlyFee: g.monthlyFee, reason: reason.trim() || null, enrollments: impact.enrollments, sessions: impact.sessions, assessments: impact.assessments,
      studentCodes: students.map((e) => e.student.code),
    }, tx);
    return g.name;
  });
}
