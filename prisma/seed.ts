/**
 * Seed : données de référence (centre, année 2026-2027, cycles/niveaux tunisiens, matières, salles,
 * catégories de dépenses) + compte administrateur.
 *
 * Avec SEED_DEMO=true : données FICTIVES marquées isDemo = true (badge « DÉMO » dans l'interface,
 * suppression en un clic dans Paramètres), et un compte de test par rôle (@demo.vamos-academy.tn).
 */
import { PrismaClient, type AttendanceStatus, type Role } from "@prisma/client";
import bcrypt from "bcryptjs";
import { defaultBillingMonths, dueDateFor, billableMonths } from "../src/lib/billing";
import { DEFAULT_TEMPLATES } from "../src/lib/templates";

const db = new PrismaClient();
const isProduction = process.env.NODE_ENV === "production";
export const DEMO_EMAIL_DOMAIN = "demo.vamos-academy.tn";

const LEVELS: Record<string, { ar: string; order: number; levels: string[] }> = {
  Primaire: { ar: "ابتدائي", order: 1, levels: ["1re année", "2e année", "3e année", "4e année", "5e année", "6e année"] },
  Collège: { ar: "أساسي", order: 2, levels: ["7e année de base", "8e année de base", "9e année de base"] },
  Secondaire: {
    ar: "ثانوي", order: 3,
    levels: [
      "1re année secondaire", "2e Sciences", "2e Lettres", "2e Économie & Services", "2e Informatique",
      "3e Mathématiques", "3e Sciences expérimentales", "3e Techniques", "3e Lettres", "3e Économie & Gestion", "3e Informatique",
      "Bac Mathématiques", "Bac Sciences expérimentales", "Bac Techniques", "Bac Lettres", "Bac Économie & Gestion", "Bac Informatique",
    ],
  },
};

const SUBJECTS = [
  ["MATH", "Mathématiques", "#C1272D"], ["PHYS", "Sciences physiques", "#14213D"], ["SVT", "Sciences de la vie et de la terre", "#15803D"],
  ["FR", "Français", "#2563EB"], ["AR", "Arabe", "#B45309"], ["EN", "Anglais", "#7C3AED"], ["INFO", "Informatique", "#0E7490"],
  ["ECO", "Économie & Gestion", "#BE185D"], ["PHILO", "Philosophie", "#4B5563"], ["EVEIL", "Éveil scientifique", "#65A30D"],
] as const;

async function main() {
  await db.centerSettings.upsert({ where: { id: 1 }, update: {}, create: { id: 1 } });

  const year = await db.schoolYear.upsert({
    where: { label: "2026-2027" },
    update: {},
    create: {
      label: "2026-2027",
      startDate: new Date("2026-09-01T12:00:00Z"),
      endDate: new Date("2027-06-30T12:00:00Z"),
      billingMonths: defaultBillingMonths(2026),
      dueDay: 10,
      active: true,
    },
  });

  for (const [name, c] of Object.entries(LEVELS)) {
    const cycle = await db.cycle.upsert({ where: { name }, update: {}, create: { name, nameAr: c.ar, order: c.order } });
    for (const [i, lv] of c.levels.entries()) {
      await db.level.upsert({ where: { cycleId_name: { cycleId: cycle.id, name: lv } }, update: {}, create: { cycleId: cycle.id, name: lv, order: i + 1 } });
    }
  }
  for (const [code, name, color] of SUBJECTS) await db.subject.upsert({ where: { code }, update: {}, create: { code, name, color } });
  for (const [name, capacity] of [["Salle 1", 15], ["Salle 2", 15], ["Salle 3", 12], ["Salle 4", 10]] as const) {
    await db.room.upsert({ where: { name }, update: {}, create: { name, capacity } });
  }
  for (const name of ["Loyer", "Électricité & eau", "Internet & téléphone", "Salaires enseignants", "Fournitures", "Marketing", "Entretien", "Divers"]) {
    await db.expenseCategory.upsert({ where: { name }, update: {}, create: { name } });
  }

  // Moyens de paiement (créés aussi par la migration finance_communication) et modèles de messages
  for (const [i, [code, label, requiresReference]] of ([["ESPECES", "Espèces", false], ["CHEQUE", "Chèque", true], ["VIREMENT", "Virement bancaire", true], ["D17", "D17 / e-Dinar", true]] as const).entries()) {
    await db.paymentMode.upsert({ where: { code }, update: {}, create: { id: `mode_${code.toLowerCase()}`, code, label, requiresReference, order: i + 1 } });
  }
  for (const t of DEFAULT_TEMPLATES) await db.messageTemplate.upsert({ where: { code: t.code }, update: {}, create: t });

  console.log("✔ Référentiel prêt (centre, année 2026-2027, niveaux, matières, salles, catégories, moyens de paiement, modèles).");

  // Aucun compte administrateur avec mot de passe par défaut : en production, utiliser `npm run admin:create`.
  // En développement uniquement, DEV_ADMIN_PASSWORD permet de créer un compte local (changement forcé à la 1re connexion).
  const devPwd = process.env.DEV_ADMIN_PASSWORD;
  if (devPwd && !isProduction) {
    await db.user.upsert({
      where: { email: "admin@vamos-academy.tn" },
      update: {},
      create: { email: "admin@vamos-academy.tn", fullName: "Administrateur", role: "ADMIN", passwordHash: await bcrypt.hash(devPwd, 12) },
    });
    console.log("✔ Compte de développement admin@vamos-academy.tn créé (mot de passe : DEV_ADMIN_PASSWORD).");
  } else if (!(await db.user.count({ where: { role: "ADMIN", active: true } }))) {
    console.log('ℹ Aucun administrateur : créez-le avec  npm run admin:create -- --email … --name "…"');
  }

  if (process.env.SEED_DEMO === "true") {
    if (isProduction && process.env.ALLOW_DEMO_SEED !== "true") {
      console.error("✖ Données de démonstration refusées en production (NODE_ENV=production). Utilisez une base de test.");
      process.exitCode = 1;
      return;
    }
    await demo(year.id, year.billingMonths, year.dueDay);
  }
}

// ───────────────────────── Démonstration (fictif) ─────────────────────────

const day = (s: string) => new Date(`${s}T12:00:00Z`);

async function demo(yearId: string, months: string[], dueDay: number) {
  if (await db.student.count({ where: { isDemo: true } })) return console.log("Données de démo déjà présentes, ignoré.");
  const lv = async (name: string) => (await db.level.findFirstOrThrow({ where: { name } })).id;
  const sub = async (code: string) => (await db.subject.findUniqueOrThrow({ where: { code } })).id;
  const cyc = async (name: string) => (await db.cycle.findUniqueOrThrow({ where: { name } })).id;
  const rooms = await db.room.findMany({ orderBy: { name: "asc" } });

  // Grille tarifaire d'exemple (à remplacer par les tarifs réels dans Paramètres → Tarifs & paiements)
  if (!(await db.feeRule.count({ where: { schoolYearId: yearId } }))) {
    await db.feeRule.createMany({
      data: [
        { schoolYearId: yearId, cycleId: await cyc("Primaire"), monthlyFee: 40000, registrationFee: 0 },
        { schoolYearId: yearId, cycleId: await cyc("Collège"), monthlyFee: 45000, registrationFee: 10000 },
        { schoolYearId: yearId, cycleId: await cyc("Secondaire"), monthlyFee: 60000, registrationFee: 10000 },
        { schoolYearId: yearId, levelId: await lv("Bac Sciences expérimentales"), subjectId: await sub("PHYS"), monthlyFee: 70000, registrationFee: 10000 },
      ],
    });
  }

  const fratrie = await db.discountType.upsert({ where: { name: "Fratrie (exemple)" }, update: {}, create: { name: "Fratrie (exemple)", percent: 10 } });
  await db.discountType.upsert({ where: { name: "Bourse (exemple)" }, update: {}, create: { name: "Bourse (exemple)", percent: 30 } });

  let tn = 0;
  const teacher = async (lastName: string, code: string, cycle: string, payMode: "HORAIRE" | "MENSUEL" | "POURCENTAGE", payRate: number, avail: [number, number, number][]) =>
    db.teacher.create({
      data: {
        firstName: "Démo", lastName, phone: `22 000 00${++tn}`, payMode, payRate, isDemo: true,
        subjects: { create: [{ subjectId: await sub(code) }] }, cycles: { create: [{ cycleId: await cyc(cycle) }] },
        availability: { create: avail.map(([weekday, s, e]) => ({ weekday, startMin: s * 60, endMin: e * 60 })) },
      },
    });
  const tMath = await teacher("Prof. Maths", "MATH", "Collège", "HORAIRE", 15000, [[3, 14, 19], [6, 8, 13]]);
  const tPhys = await teacher("Prof. Physique", "PHYS", "Secondaire", "POURCENTAGE", 50, [[6, 13, 18], [7, 9, 12]]);
  const tFr = await teacher("Prof. Français", "FR", "Primaire", "MENSUEL", 600000, []);
  const tEn = await teacher("Prof. Anglais", "EN", "Collège", "HORAIRE", 12000, []);

  const group = async (name: string, level: string, code: string, t: { id: string }, room: number, fee: number, reg: number, slots: [number, number, number][]) =>
    db.group.create({
      data: {
        name, schoolYearId: yearId, levelId: await lv(level), subjectId: await sub(code), teacherId: t.id, roomId: rooms[room].id,
        capacity: Math.min(12, rooms[room].capacity), monthlyFee: fee, registrationFee: reg, isDemo: true,
        slots: { create: slots.map(([weekday, s, e]) => ({ weekday, startMin: s, endMin: e, roomId: rooms[room].id })) },
      },
    });
  const groups = [
    await group("Maths 9e — G1", "9e année de base", "MATH", tMath, 0, 50000, 10000, [[3, 840, 960], [6, 540, 660]]),
    await group("Physique Bac Sc — G1", "Bac Sciences expérimentales", "PHYS", tPhys, 1, 70000, 10000, [[6, 840, 960]]),
    await group("Français 6e — G1", "6e année", "FR", tFr, 2, 40000, 0, [[3, 900, 990], [5, 1020, 1110]]),
    await group("Anglais 8e — G1", "8e année de base", "EN", tEn, 3, 35000, 0, [[2, 1020, 1110]]),
  ];

  // Comptes de test (un par rôle)
  const demoPwd = await bcrypt.hash("Demo2026vamos", 12);
  const accounts: [Role, string, string | null][] = [
    ["RESPONSABLE", "Responsable (démo)", null], ["COMPTABLE", "Comptable (démo)", null],
    ["ENSEIGNANT", "Prof. Maths (démo)", tMath.id], ["LECTURE", "Lecture seule (démo)", null],
  ];
  for (const [role, fullName, teacherId] of accounts) {
    await db.user.upsert({
      where: { email: `${role.toLowerCase()}@${DEMO_EMAIL_DOMAIN}` }, update: {},
      create: { email: `${role.toLowerCase()}@${DEMO_EMAIL_DOMAIN}`, fullName, role, teacherId, passwordHash: demoPwd },
    });
  }

  const people: [string, string, number, string, string][] = [
    // prénom, nom, groupe, niveau, téléphone parent
    ["Amine", "Démo-Trabelsi", 0, "9e année de base", "98 100 001"], ["Yasmine", "Démo-Trabelsi", 0, "9e année de base", "98 100 001"],
    ["Omar", "Démo-Gharbi", 0, "9e année de base", "98 100 002"], ["Sarra", "Démo-Ben Ali", 0, "9e année de base", "98 100 003"],
    ["Mehdi", "Démo-Jaziri", 1, "Bac Sciences expérimentales", "98 100 004"], ["Ines", "Démo-Mansour", 1, "Bac Sciences expérimentales", "98 100 005"],
    ["Rayen", "Démo-Haddad", 1, "Bac Sciences expérimentales", "98 100 006"], ["Lina", "Démo-Karray", 2, "6e année", "98 100 007"],
    ["Youssef", "Démo-Saidi", 2, "6e année", "98 100 008"], ["Nour", "Démo-Chaabane", 2, "6e année", "98 100 009"],
    ["Adam", "Démo-Ferchichi", 3, "8e année de base", "98 100 010"], ["Malek", "Démo-Zouari", 3, "8e année de base", "98 100 011"],
  ];
  const statuses: AttendanceStatus[] = ["PRESENT", "PRESENT", "PRESENT", "PRESENT", "RETARD", "PRESENT", "ABSENT", "PRESENT", "EXCUSE"];
  let receipt = 0;
  for (const [i, [firstName, lastName, gi, level, phone]] of people.entries()) {
    const g = groups[gi];
    const guardian = (await db.guardian.findFirst({ where: { phone } })) ??
      (await db.guardian.create({ data: { firstName: "Parent", lastName, phone, isDemo: true } }));
    const student = await db.student.create({
      data: {
        code: `VA-2026-${String(i + 1).padStart(4, "0")}`, firstName, lastName, levelId: await lv(level), school: "École (démo)", isDemo: true,
        birthDate: day(`${[2012, 2008, 2015, 2013][gi]}-0${(i % 9) + 1}-1${i % 9}`), gender: i % 2 ? "F" : "M",
        guardians: { create: { guardianId: guardian.id, relation: "Père", isPayer: true } },
      },
    });
    const sibling = i === 1; // Yasmine : réduction fratrie
    const startDate = day(i % 4 === 3 ? "2026-10-01" : "2026-09-15");
    const fee = sibling ? Math.round(g.monthlyFee * 0.9) : g.monthlyFee;
    const e = await db.enrollment.create({
      data: { studentId: student.id, groupId: g.id, startDate, baseFee: g.monthlyFee, monthlyFee: fee, ...(sibling ? { discountTypeId: fratrie.id, discountPercent: 10, discountNote: "Sœur d'Amine VA-2026-0001" } : {}) },
    });
    const inv = billableMonths(months, startDate.toISOString().slice(0, 7));
    await db.invoice.createMany({ data: inv.map((p) => ({ enrollmentId: e.id, period: p, amount: fee, dueDate: dueDateFor(p, dueDay, startDate) })) });
    // Paiements : la plupart ont réglé septembre/octobre, certains sont en retard
    const paidMonths = i % 5 === 4 ? 0 : i % 3 === 2 ? 1 : 2;
    if (paidMonths) {
      const toPay = await db.invoice.findMany({ where: { enrollmentId: e.id }, orderBy: { dueDate: "asc" }, take: paidMonths });
      receipt++;
      await db.payment.create({
        data: {
          receiptNo: `R-2026-${String(receipt).padStart(6, "0")}`, studentId: student.id, schoolYearId: yearId,
          amount: toPay.reduce((s, x) => s + x.amount, 0), modeId: i % 4 === 0 ? "mode_d17" : "mode_especes", reference: i % 4 === 0 ? `D17-DEMO-${i}` : null,
          paidAt: day(i % 2 ? "2026-09-20" : "2026-10-05"), note: "Paiement de démonstration",
          allocations: { create: toPay.map((x) => ({ invoiceId: x.id, amount: x.amount })) },
        },
      });
    }
  }

  // Présences des dernières semaines + une évaluation notée par groupe
  for (const g of groups) {
    const enrolled = await db.enrollment.findMany({ where: { groupId: g.id }, select: { studentId: true, startDate: true } });
    const slots = await db.scheduleSlot.findMany({ where: { groupId: g.id } });
    for (let d = new Date(day("2026-10-01")); d < day("2026-10-29"); d = new Date(d.getTime() + 86400_000)) {
      const wd = ((d.getUTCDay() + 6) % 7) + 1;
      if (!slots.some((s) => s.weekday === wd)) continue;
      const present = enrolled.filter((x) => x.startDate <= d);
      await db.attendanceSession.create({
        data: {
          groupId: g.id, date: d, topic: "Séance (démo)",
          records: { create: present.map((x, k) => ({ studentId: x.studentId, status: statuses[(k + d.getUTCDate()) % statuses.length], note: null })) },
        },
      });
    }
    await db.assessment.create({
      data: {
        groupId: g.id, title: "Devoir de contrôle 1 (démo)", kind: "DEVOIR", term: 1, date: day("2026-10-21"), coefficient: 1, maxScore: 20,
        grades: { create: enrolled.map((x, k) => ({ studentId: x.studentId, score: [14.5, 11, 16.25, 8.5, 12.75, 17][k % 6], comment: k % 3 === 0 ? "Bon travail, continuer ainsi." : null })) },
      },
    });
  }

  const cat = async (name: string) => (await db.expenseCategory.findUniqueOrThrow({ where: { name } })).id;
  await db.expense.createMany({
    data: [
      { schoolYearId: yearId, categoryId: await cat("Loyer"), label: "Loyer septembre (démo)", amount: 800000, modeId: "mode_virement", reference: "VIR-DEMO-09", spentAt: day("2026-09-01"), isDemo: true },
      { schoolYearId: yearId, categoryId: await cat("Loyer"), label: "Loyer octobre (démo)", amount: 800000, modeId: "mode_virement", reference: "VIR-DEMO-10", spentAt: day("2026-10-01"), isDemo: true },
      { schoolYearId: yearId, categoryId: await cat("Électricité & eau"), label: "STEG septembre (démo)", amount: 145300, modeId: "mode_especes", spentAt: day("2026-09-28"), isDemo: true },
      { schoolYearId: yearId, categoryId: await cat("Fournitures"), label: "Feutres et papier (démo)", amount: 62500, modeId: "mode_especes", spentAt: day("2026-10-12"), isDemo: true },
      { schoolYearId: yearId, categoryId: await cat("Marketing"), label: "Affiches inscriptions (démo)", amount: 90000, modeId: "mode_especes", spentAt: day("2026-09-05"), isDemo: true },
    ],
  });
  console.log(`✔ Données de démonstration (fictives, marquées DÉMO) créées. Comptes de test : <role>@${DEMO_EMAIL_DOMAIN} / Demo2026vamos`);
}

main().finally(() => db.$disconnect());
