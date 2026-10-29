import "server-only";
import { db } from "../db";
import { audit } from "../audit";
import { BusinessError } from "../action";
import { saveUpload } from "../storage";
import { resolveByKey } from "./notifications";
import { getActiveYear } from "./finance";
import { parseDay, todayISO } from "@/lib/format";

export type ExpenseInput = { categoryId: string; label: string; amount: number; modeId: string; reference: string | null; spentAt: string };

async function checkMode(modeId: string, reference: string | null) {
  const mode = await db.paymentMode.findUnique({ where: { id: modeId } });
  if (!mode || !mode.active) throw new BusinessError("Moyen de paiement inconnu ou désactivé.");
  if (mode.requiresReference && !reference) throw new BusinessError(`Référence obligatoire pour ${mode.label.toLowerCase()}.`);
}

export async function createExpense(input: ExpenseInput, files: File[], userId: string, extra: { correctsId?: string; teacherPayId?: string } = {}) {
  if (input.amount <= 0) throw new BusinessError("Le montant doit être positif.");
  if (input.spentAt > todayISO()) throw new BusinessError("La date de la dépense ne peut pas être dans le futur.");
  await checkMode(input.modeId, input.reference);
  const year = await getActiveYear();
  const uploads = [];
  for (const f of files.filter((f) => f.size > 0)) uploads.push(await saveUpload(f));
  const e = await db.expense.create({
    data: {
      ...input, spentAt: parseDay(input.spentAt), schoolYearId: year.id, createdById: userId, ...extra,
      attachments: { create: uploads.map((u) => ({ ...u, uploadedById: userId })) },
    },
  });
  await audit(userId, "expense.create", "Expense", e.id, { ...input, attachments: uploads.length, ...extra });
  return e;
}

export async function addAttachments(expenseId: string, files: File[], userId: string) {
  const e = await db.expense.findUniqueOrThrow({ where: { id: expenseId } });
  if (e.cancelledAt) throw new BusinessError("Dépense annulée : ajout de justificatif impossible.");
  const valid = files.filter((f) => f.size > 0);
  if (!valid.length) throw new BusinessError("Choisissez au moins un fichier.");
  for (const f of valid) {
    const u = await saveUpload(f);
    await db.expenseAttachment.create({ data: { ...u, expenseId, uploadedById: userId } });
  }
  await audit(userId, "expense.attach", "Expense", expenseId, { files: valid.map((f) => f.name) });
  await resolveByKey(`expdoc:${expenseId}`, "Justificatif ajouté");
}

/** Annulation tracée : la dépense reste visible (barrée) avec son motif et n'est plus comptée. */
export async function cancelExpense(id: string, reason: string, userId: string) {
  if (reason.trim().length < 3) throw new BusinessError("Le motif d'annulation est obligatoire.");
  const e = await db.expense.findUniqueOrThrow({ where: { id } });
  if (e.cancelledAt) throw new BusinessError("Cette dépense est déjà annulée.");
  if (e.teacherPayId) throw new BusinessError("Dépense liée à une paie enseignant : annulez la paie depuis Rémunérations.");
  await db.expense.update({ where: { id }, data: { cancelledAt: new Date(), cancelReason: reason.trim() } });
  await audit(userId, "expense.cancel", "Expense", id, { label: e.label, amount: e.amount, reason });
  await resolveByKey(`expdoc:${id}`, "Dépense annulée");
}

/** Correction : l'originale est annulée (« Corrigée par … ») et une nouvelle dépense liée est créée ; les justificatifs restent rattachés à l'originale et sont affichés sur la correction. */
export async function correctExpense(id: string, input: ExpenseInput, reason: string, userId: string) {
  if (reason.trim().length < 3) throw new BusinessError("Le motif de la correction est obligatoire.");
  const orig = await db.expense.findUniqueOrThrow({ where: { id }, include: { attachments: true } });
  if (orig.cancelledAt) throw new BusinessError("Cette dépense est déjà annulée ou corrigée.");
  if (orig.teacherPayId) throw new BusinessError("Dépense liée à une paie enseignant : corrigez la paie.");
  await db.expense.update({ where: { id }, data: { cancelledAt: new Date(), cancelReason: `Correction : ${reason.trim()}` } });
  const e = await createExpense(input, [], userId, { correctsId: id });
  await db.expense.update({ where: { id }, data: { cancelReason: `Corrigée par la dépense du ${input.spentAt} : ${reason.trim()}` } });
  await audit(userId, "expense.correct", "Expense", e.id, { replaces: id, before: { amount: orig.amount, label: orig.label }, after: input, reason });
  await resolveByKey(`expdoc:${id}`, "Dépense corrigée");
  return e;
}
