"use server";

import { redirect } from "next/navigation";
import { login } from "@/server/auth";
import { runAction, BusinessError, type ActionState } from "@/server/action";
import { loginSchema } from "@/lib/validation";

export async function loginAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const res = await runAction(async () => {
    const { email, password } = loginSchema.parse(Object.fromEntries(fd));
    const r = await login(email, password);
    if (!r.ok) throw new BusinessError(r.error);
  });
  if (res?.ok) redirect("/dashboard");
  return res;
}
