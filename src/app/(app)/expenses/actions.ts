"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requirePermission } from "@/server/auth";
import { db } from "@/server/db";
import { audit } from "@/server/audit";
import { runAction, type ActionState } from "@/server/action";
import { createExpense as create, cancelExpense as cancel, correctExpense as correct, addAttachments } from "@/server/services/expenses";
import { expenseSchema, formToObject } from "@/lib/validation";

const files = (fd: FormData) => fd.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);

export async function createExpense(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await requirePermission("expenses.write");
    const v = expenseSchema.parse(formToObject(fd));
    const f = files(fd);
    await create(v, f, user.id);
    revalidatePath("/expenses");
    return f.length ? "Dépense enregistrée avec justificatif." : "Dépense enregistrée. Pensez à joindre le justificatif.";
  });
}

export async function attachToExpense(id: string, _: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await requirePermission("expenses.write");
    await addAttachments(id, files(fd), user.id);
    revalidatePath(`/expenses/${id}`);
    return "Justificatif ajouté.";
  });
}

export async function cancelExpense(id: string, fd: FormData): Promise<ActionState> {
  const res = await runAction(async () => {
    const user = await requirePermission("expenses.write");
    await cancel(id, String(fd.get("reason") ?? ""), user.id);
  });
  revalidatePath(`/expenses/${id}`);
  return res;
}

export async function correctExpense(id: string, _: ActionState, fd: FormData): Promise<ActionState> {
  let newId = "";
  const res = await runAction(async () => {
    const user = await requirePermission("expenses.write");
    const v = expenseSchema.parse(formToObject(fd));
    newId = (await correct(id, v, String(fd.get("reason") ?? ""), user.id)).id;
  });
  if (res?.ok) redirect(`/expenses/${newId}`);
  return res;
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
