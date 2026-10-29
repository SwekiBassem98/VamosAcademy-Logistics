"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requirePermission } from "@/server/auth";
import { runAction, type ActionState } from "@/server/action";
import { recordPayment, cancelPayment as cancel, correctPayment as correct } from "@/server/services/finance";
import { paymentSchema, formToObject } from "@/lib/validation";

export async function createPayment(_: ActionState, fd: FormData): Promise<ActionState> {
  let id = "";
  const res = await runAction(async () => {
    const user = await requirePermission("payments.write");
    const v = paymentSchema.parse(formToObject(fd, ["invoiceIds"]));
    id = (await recordPayment(v, user.id)).id;
  });
  if (res?.ok) redirect(`/payments/${id}?print=1`);
  return res;
}

/** Appelée depuis la fenêtre de confirmation (motif obligatoire). */
export async function cancelPayment(id: string, fd: FormData): Promise<ActionState> {
  const res = await runAction(async () => {
    const user = await requirePermission("payments.cancel");
    await cancel(id, String(fd.get("reason") ?? ""), user.id);
  });
  revalidatePath(`/payments/${id}`);
  return res;
}

/** Correction : annule le reçu et émet un nouveau reçu lié (même élève), en conservant l'historique. */
export async function correctPayment(id: string, _: ActionState, fd: FormData): Promise<ActionState> {
  let newId = "";
  const res = await runAction(async () => {
    const user = await requirePermission("payments.cancel");
    // l'élève est celui du reçu d'origine (jamais repris du formulaire)
    const v = paymentSchema.omit({ studentId: true }).parse(formToObject(fd, ["invoiceIds"]));
    newId = (await correct(id, v, String(fd.get("reason") ?? ""), user.id)).id;
  });
  if (res?.ok) redirect(`/payments/${newId}`);
  return res;
}
