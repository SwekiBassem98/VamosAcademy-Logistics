"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requirePermission } from "@/server/auth";
import { runAction, type ActionState } from "@/server/action";
import { recordPayment, cancelPayment as cancel } from "@/server/services/finance";
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
