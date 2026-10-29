"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePermission } from "@/server/auth";
import { db } from "@/server/db";
import { audit } from "@/server/audit";
import { runAction, type ActionState } from "@/server/action";
import { getActiveYear } from "@/server/services/finance";
import { expenseSchema, formToObject } from "@/lib/validation";
import { parseDay } from "@/lib/format";

export async function createExpense(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await requirePermission("expenses.write");
    const v = expenseSchema.parse(formToObject(fd));
    const year = await getActiveYear();
    const e = await db.expense.create({ data: { ...v, spentAt: parseDay(v.spentAt), schoolYearId: year.id, createdById: user.id } });
    await audit(user.id, "expense.create", "Expense", e.id, { ...v });
    revalidatePath("/expenses");
    return "Dépense enregistrée.";
  });
}

export async function deleteExpense(id: string) {
  const user = await requirePermission("expenses.write");
  const cur = await db.expense.findUnique({ where: { id } });
  if (!cur) return { error: "Dépense introuvable." };
  const e = await db.expense.delete({ where: { id } });
  await audit(user.id, "expense.delete", "Expense", id, { label: e.label, amount: e.amount, spentAt: e.spentAt.toISOString() });
  revalidatePath("/expenses");
}

export async function createCategory(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await requirePermission("expenses.write");
    const { name } = z.object({ name: z.string().trim().min(1, "Nom obligatoire") }).parse(formToObject(fd));
    const c = await db.expenseCategory.create({ data: { name } });
    await audit(user.id, "expenseCategory.create", "ExpenseCategory", c.id, { name });
    revalidatePath("/expenses");
    return "Catégorie ajoutée.";
  });
}
