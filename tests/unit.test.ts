import { describe, expect, it } from "vitest";
import { formatMoney, parseMoney, normalizePhone, todayISO, formatPeriod, parseTime, moneyInput } from "@/lib/format";
import { allocateFIFO, billableMonths, defaultBillingMonths, dueDateFor, invoiceStatus, applyDiscount, isLate } from "@/lib/billing";
import { diff, isProbableDuplicate } from "@/lib/history";
import { weightedAverage, parseScore } from "@/lib/grades";
import { findConflicts } from "@/lib/schedule";
import { can, PERMISSIONS } from "@/lib/permissions";
import { studentSchema, slotSchema, formToObject } from "@/lib/validation";

describe("formats tunisiens", () => {
  it("formate les montants en DT avec 3 décimales", () => {
    expect(formatMoney(45500).replace(/\s/g, " ")).toBe("45,500 DT");
    expect(formatMoney(1234250).replace(/[\s  ]/g, " ")).toBe("1 234,250 DT");
  });
  it("parse les saisies de montants", () => {
    expect(parseMoney("45")).toBe(45000);
    expect(parseMoney("45,5")).toBe(45500);
    expect(parseMoney("1 234,250")).toBe(1234250);
    expect(parseMoney("12.345")).toBe(12345);
    expect(parseMoney("abc")).toBeNull();
    expect(parseMoney("1,2345")).toBeNull();
    expect(parseMoney(moneyInput(70000))).toBe(70000);
  });
  it("normalise les téléphones", () => {
    expect(normalizePhone("20807657")).toBe("20 807 657");
    expect(normalizePhone("+216 20 807 657")).toBe("20 807 657");
    expect(normalizePhone("1234")).toBeNull();
  });
  it("calcule la date du jour à Tunis", () => {
    expect(todayISO(new Date("2026-10-28T23:30:00Z"))).toBe("2026-10-29"); // 00:30 à Tunis
  });
  it("affiche les périodes en français", () => {
    expect(formatPeriod("2026-10")).toBe("octobre 2026");
    expect(formatPeriod("INSCRIPTION")).toBe("Frais d'inscription");
    expect(parseTime("08:30")).toBe(510);
    expect(parseTime("25:00")).toBeNull();
  });
});

describe("facturation", () => {
  it("mois septembre → juin", () => {
    const m = defaultBillingMonths(2026);
    expect(m).toHaveLength(10);
    expect(m[0]).toBe("2026-09");
    expect(m[9]).toBe("2027-06");
  });
  it("ne facture pas les mois avant l'entrée / après la sortie", () => {
    expect(billableMonths(defaultBillingMonths(2026), "2026-11", "2027-01")).toEqual(["2026-11", "2026-12", "2027-01"]);
  });
  it("borne le jour limite au dernier jour du mois", () => {
    expect(dueDateFor("2027-02", 31).getUTCDate()).toBe(28);
  });
  it("ne fixe pas d'échéance avant la date d'entrée", () => {
    const entry = new Date("2026-09-15T12:00:00Z");
    expect(dueDateFor("2026-09", 10, entry)).toEqual(entry);
    expect(dueDateFor("2026-10", 10, entry).toISOString().slice(0, 10)).toBe("2026-10-10");
  });
  const inv = [
    { id: "nov", amount: 50000, paid: 0, dueDate: new Date("2026-11-10") },
    { id: "oct", amount: 50000, paid: 20000, dueDate: new Date("2026-10-10") },
    { id: "dec", amount: 50000, paid: 0, dueDate: new Date("2026-12-10") },
  ];
  it("alloue en FIFO, la plus ancienne d'abord", () => {
    expect(allocateFIFO(inv, 60000)).toEqual([{ invoiceId: "oct", amount: 30000 }, { invoiceId: "nov", amount: 30000 }]);
  });
  it("respecte la sélection d'échéances", () => {
    expect(allocateFIFO(inv, 50000, ["dec"])).toEqual([{ invoiceId: "dec", amount: 50000 }]);
  });
  it("refuse le trop-perçu et les montants invalides", () => {
    expect(() => allocateFIFO(inv, 130001)).toThrow(/dépasse/);
    expect(() => allocateFIFO(inv, 0)).toThrow();
    expect(() => allocateFIFO(inv, 10.5)).toThrow();
  });
  it("calcule le statut des échéances", () => {
    const now = new Date("2026-11-01");
    expect(invoiceStatus(50000, 50000, new Date("2026-10-10"), now)).toBe("PAYEE");
    expect(invoiceStatus(50000, 0, new Date("2026-10-10"), now)).toBe("EN_RETARD");
    expect(invoiceStatus(50000, 10000, new Date("2026-11-10"), now)).toBe("PARTIELLE");
    expect(invoiceStatus(50000, 0, new Date("2026-11-10"), now)).toBe("IMPAYEE");
  });
  it("une échéance n'est en retard qu'après son jour (heure de Tunis)", () => {
    const due = new Date("2026-10-29T12:00:00Z");
    expect(isLate(due, new Date("2026-10-29T22:30:00Z"))).toBe(false); // 23:30 à Tunis
    expect(isLate(due, new Date("2026-10-29T23:30:00Z"))).toBe(true); // 00:30 le 30
  });
  it("applique les remises", () => {
    expect(applyDiscount(50000, { percent: 10 })).toBe(45000);
    expect(applyDiscount(50000, { amount: 60000 })).toBe(0);
  });
});

describe("emploi du temps", () => {
  const existing = [{ id: "a", groupId: "g1", weekday: 3, startMin: 840, endMin: 960, roomId: "r1", teacherId: "t1", label: "Maths" }];
  it("détecte un conflit de salle", () => {
    expect(findConflicts({ groupId: "g2", weekday: 3, startMin: 900, endMin: 1000, roomId: "r1", teacherId: "t2" }, existing)).toEqual(["Salle déjà occupée (Maths)"]);
  });
  it("détecte un conflit d'enseignant dans une autre salle", () => {
    expect(findConflicts({ groupId: "g2", weekday: 3, startMin: 900, endMin: 1000, roomId: "r2", teacherId: "t1" }, existing)[0]).toMatch(/Enseignant/);
  });
  it("détecte un conflit de groupe (deux cours simultanés)", () => {
    expect(findConflicts({ groupId: "g1", weekday: 3, startMin: 900, endMin: 1000, roomId: "r9", teacherId: null }, existing)[0]).toMatch(/groupe/);
  });
  it("ignore le créneau lui-même lors d'une modification", () => {
    expect(findConflicts({ id: "a", groupId: "g1", weekday: 3, startMin: 900, endMin: 1000, roomId: "r1", teacherId: "t1" }, existing)).toEqual([]);
  });
  it("accepte des créneaux contigus ou un autre jour", () => {
    expect(findConflicts({ groupId: "g2", weekday: 3, startMin: 960, endMin: 1080, roomId: "r1", teacherId: "t1" }, existing)).toEqual([]);
    expect(findConflicts({ groupId: "g2", weekday: 4, startMin: 840, endMin: 960, roomId: "r1", teacherId: "t1" }, existing)).toEqual([]);
  });
  it("refuse un créneau hors disponibilités déclarées", () => {
    const avail = [{ weekday: 3, startMin: 840, endMin: 1080 }];
    expect(findConflicts({ weekday: 3, startMin: 960, endMin: 1080, roomId: "r2", teacherId: "t9" }, [], avail)).toEqual([]);
    expect(findConflicts({ weekday: 3, startMin: 1020, endMin: 1140, roomId: "r2", teacherId: "t9" }, [], avail)[0]).toMatch(/disponibilités/);
    expect(findConflicts({ weekday: 3, startMin: 1020, endMin: 1140, roomId: "r2", teacherId: "t9" }, [], [])).toEqual([]);
  });
});

describe("permissions (5 rôles)", () => {
  it("l'administrateur a tout", () => {
    for (const p of PERMISSIONS) expect(can("ADMIN", p)).toBe(true);
  });
  it("le responsable administratif gère les inscriptions mais pas les utilisateurs ni les annulations", () => {
    expect(can("RESPONSABLE", "students.write")).toBe(true);
    expect(can("RESPONSABLE", "academics.write")).toBe(true);
    expect(can("RESPONSABLE", "users.manage")).toBe(false);
    expect(can("RESPONSABLE", "payments.cancel")).toBe(false);
    expect(can("RESPONSABLE", "expenses.read")).toBe(false);
  });
  it("le comptable gère paiements, dépenses et rapports, pas les dossiers", () => {
    for (const p of ["payments.write", "payments.cancel", "expenses.write", "reports.read"] as const) expect(can("COMPTABLE", p)).toBe(true);
    expect(can("COMPTABLE", "students.write")).toBe(false);
    expect(can("COMPTABLE", "grades.read")).toBe(false);
  });
  it("l'enseignant n'a aucun accès financier ni administratif", () => {
    for (const p of PERMISSIONS.filter((p) => /payments|expenses|reports|dashboard\.finance|users|settings|audit|write$/.test(p) && !/attendance|grades/.test(p))) expect(can("ENSEIGNANT", p)).toBe(false);
    expect(can("ENSEIGNANT", "attendance.write")).toBe(true);
    expect(can("ENSEIGNANT", "grades.write")).toBe(true);
  });
  it("la lecture seule n'a aucune permission d'écriture ni financière", () => {
    for (const p of PERMISSIONS) {
      if (/write|cancel|manage|finance|payments|expenses|reports|audit/.test(p)) expect(can("LECTURE", p)).toBe(false);
    }
    expect(can("LECTURE", "students.read")).toBe(true);
  });
});

describe("historique & doublons", () => {
  it("liste uniquement les champs modifiés", () => {
    const before = { firstName: "Amine", lastName: "Ben Ali", phone: null, birthDate: new Date("2012-03-04T12:00:00Z") };
    expect(diff(before, { firstName: "Amine", lastName: "Ben Salah", phone: "", birthDate: new Date("2012-03-04T12:00:00Z") }))
      .toEqual([{ field: "lastName", from: "Ben Ali", to: "Ben Salah" }]);
  });
  it("détecte un doublon probable malgré accents et casse", () => {
    expect(isProbableDuplicate({ firstName: "Élyes", lastName: "Ben  Ali" }, { firstName: "elyes", lastName: "ben ali" })).toBe(true);
    const d = new Date("2012-01-01");
    expect(isProbableDuplicate({ firstName: "A", lastName: "B", birthDate: d }, { firstName: "a", lastName: "b", birthDate: new Date("2013-01-01") })).toBe(false);
  });
});

describe("notes", () => {
  it("calcule une moyenne pondérée sur 20 en ignorant les absents", () => {
    expect(weightedAverage([{ score: 15, maxScore: 20, coefficient: 1 }, { score: 8, maxScore: 10, coefficient: 2 }, { score: null, maxScore: 20, coefficient: 3 }])).toBe(15.67);
    expect(weightedAverage([])).toBeNull();
  });
  it("valide la saisie des notes", () => {
    expect(parseScore("14,25", 20)).toBe(14.25);
    expect(parseScore("", 20)).toBeNull();
    expect(() => parseScore("21", 20)).toThrow(/barème/);
    expect(() => parseScore("abc", 20)).toThrow(/invalide/);
  });
});

describe("validation", () => {
  it("valide une fiche élève et normalise le téléphone", () => {
    const fd = new FormData();
    fd.set("firstName", " Amine "); fd.set("lastName", "Ben Salah"); fd.set("phone", "20807657"); fd.set("gender", "");
    const v = studentSchema.parse(formToObject(fd));
    expect(v.firstName).toBe("Amine");
    expect(v.phone).toBe("20 807 657");
    expect(v.gender).toBeUndefined();
  });
  it("rejette un nom manquant", () => {
    expect(studentSchema.safeParse({ firstName: "A", lastName: "" }).success).toBe(false);
  });
  it("rejette un créneau qui finit avant de commencer", () => {
    expect(slotSchema.safeParse({ groupId: "g", roomId: "r", weekday: 1, start: "16:00", end: "14:00" }).success).toBe(false);
  });
});
