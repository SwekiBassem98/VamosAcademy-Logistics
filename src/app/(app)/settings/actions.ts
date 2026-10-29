"use server";

import { revalidatePath } from "next/cache";
import { requirePermission } from "@/server/auth";
import { db } from "@/server/db";
import { audit } from "@/server/audit";
import { runAction, BusinessError, type ActionState } from "@/server/action";
import { syncAllInvoices } from "@/server/services/finance";
import { schoolYearSchema, settingsSchema, discountTypeSchema, formToObject } from "@/lib/validation";
import { purgeDemoData } from "@/server/services/demo";
import { defaultBillingMonths } from "@/lib/billing";
import { parseDay } from "@/lib/format";

export async function saveSettings(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await requirePermission("settings.manage");
    const v = settingsSchema.parse(formToObject(fd));
    const data = { ...v, addressAr: v.addressAr ?? "", receiptFooter: v.receiptFooter ?? "" };
    await db.centerSettings.upsert({ where: { id: 1 }, update: data, create: { id: 1, ...data } });
    await audit(user.id, "settings.update", "CenterSettings", "1", data);
    revalidatePath("/", "layout");
    return "Paramètres enregistrés.";
  });
}

export async function createSchoolYear(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await requirePermission("settings.manage");
    const v = schoolYearSchema.parse(formToObject(fd));
    const startYear = Number(v.label.slice(0, 4));
    if (Number(v.label.slice(5)) !== startYear + 1) throw new BusinessError("Libellé incohérent (ex. 2027-2028).");
    const y = await db.schoolYear.create({
      data: { label: v.label, startDate: parseDay(v.startDate), endDate: parseDay(v.endDate), dueDay: v.dueDay, billingMonths: defaultBillingMonths(startYear) },
    });
    await audit(user.id, "schoolYear.create", "SchoolYear", y.id, v);
    revalidatePath("/settings");
    return "Année scolaire créée (mois facturés : septembre → juin).";
  });
}

export async function updateYearBilling(id: string, _: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await requirePermission("settings.manage");
    const months = fd.getAll("months").map(String).filter((m) => /^\d{4}-\d{2}$/.test(m)).sort();
    const dueDay = Number(fd.get("dueDay"));
    if (!months.length) throw new BusinessError("Sélectionnez au moins un mois facturé.");
    if (!(dueDay >= 1 && dueDay <= 28)) throw new BusinessError("Jour limite entre 1 et 28.");
    await db.schoolYear.update({ where: { id }, data: { billingMonths: months, dueDay } });
    await audit(user.id, "schoolYear.update", "SchoolYear", id, { months, dueDay });
    revalidatePath("/settings");
    return "Facturation mise à jour (s'applique aux nouvelles échéances).";
  });
}

export async function activateYear(id: string) {
  const user = await requirePermission("settings.manage");
  await db.$transaction([
    db.schoolYear.updateMany({ data: { active: false } }),
    db.schoolYear.update({ where: { id }, data: { active: true } }),
  ]);
  await audit(user.id, "schoolYear.activate", "SchoolYear", id);
  revalidatePath("/", "layout");
}

export async function generateInvoices(id: string): Promise<ActionState> {
  return runAction(async () => {
    const user = await requirePermission("settings.manage");
    const n = await syncAllInvoices(id, user.id);
    return `${n} échéance(s) créée(s).`;
  });
}

export async function saveDiscountType(id: string | null, _: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await requirePermission("settings.manage");
    const v = discountTypeSchema.parse(formToObject(fd));
    const active = id ? fd.get("active") === "on" : true;
    const d = id
      ? await db.discountType.update({ where: { id }, data: { ...v, active } })
      : await db.discountType.create({ data: v });
    await audit(user.id, id ? "discount.update" : "discount.create", "DiscountType", d.id, { ...v, active });
    revalidatePath("/settings");
    return "Réduction enregistrée. (Les inscriptions existantes conservent leur tarif.)";
  });
}

export async function purgeDemo(fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await requirePermission("users.manage"); // administrateur uniquement
    if (String(fd.get("reason") ?? "").trim().toUpperCase() !== "SUPPRIMER") throw new BusinessError("Tapez SUPPRIMER pour confirmer.");
    const res = await purgeDemoData();
    await audit(user.id, "demo.purge", "System", null, res);
    revalidatePath("/", "layout");
    return `Données de démonstration supprimées : ${res.students} élève(s), ${res.groups} groupe(s), ${res.teachers} enseignant(s).`;
  });
}
