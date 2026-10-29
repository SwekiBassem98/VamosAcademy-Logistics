import "server-only";
import { db } from "../db";
import { BusinessError } from "../action";

/** Compte les données de démonstration (isDemo = true). */
export async function demoCounts() {
  const [students, guardians, teachers, groups, expenses] = await Promise.all([
    db.student.count({ where: { isDemo: true } }),
    db.guardian.count({ where: { isDemo: true } }),
    db.teacher.count({ where: { isDemo: true } }),
    db.group.count({ where: { isDemo: true } }),
    db.expense.count({ where: { isDemo: true } }),
  ]);
  return { students, guardians, teachers, groups, expenses, total: students + guardians + teachers + groups + expenses };
}

/** Supprime toutes les données marquées démo, sans toucher aux données réelles. */
export async function purgeDemoData() {
  const realInDemoGroups = await db.enrollment.count({ where: { group: { isDemo: true }, student: { isDemo: false } } });
  if (realInDemoGroups) throw new BusinessError(`${realInDemoGroups} élève(s) réel(s) sont inscrits dans des groupes de démonstration : terminez ou déplacez ces inscriptions d'abord.`);
  const realPaymentsOnDemo = await db.paymentAllocation.count({ where: { invoice: { enrollment: { student: { isDemo: true } } }, payment: { student: { isDemo: false } } } });
  if (realPaymentsOnDemo) throw new BusinessError("Des paiements réels sont affectés à des élèves de démonstration.");

  return db.$transaction(async (tx) => {
    const students = { student: { isDemo: true } };
    await tx.payment.deleteMany({ where: students }); // allocations en cascade
    await tx.invoice.deleteMany({ where: { enrollment: students } });
    await tx.attendanceRecord.deleteMany({ where: students });
    await tx.grade.deleteMany({ where: students });
    await tx.enrollment.deleteMany({ where: { OR: [students, { group: { isDemo: true } }] } });
    const s = await tx.student.deleteMany({ where: { isDemo: true } }); // liens parents en cascade
    const g = await tx.guardian.deleteMany({ where: { isDemo: true, students: { none: {} } } });
    const gr = await tx.group.deleteMany({ where: { isDemo: true } }); // créneaux, séances, évaluations en cascade
    await tx.user.deleteMany({ where: { email: { endsWith: "@demo.vamos-academy.tn" } } }); // comptes de test
    await tx.user.updateMany({ where: { teacher: { isDemo: true } }, data: { teacherId: null, active: false } });
    const t = await tx.teacher.deleteMany({ where: { isDemo: true, groups: { none: {} } } });
    const e = await tx.expense.deleteMany({ where: { isDemo: true } });
    return { students: s.count, guardians: g.count, groups: gr.count, teachers: t.count, expenses: e.count };
  });
}
