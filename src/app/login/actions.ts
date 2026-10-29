"use server";

import { redirect } from "next/navigation";
import { login } from "@/server/auth";
import { clientIp, hit, resetBucket } from "@/server/rate-limit";
import { runAction, BusinessError, type ActionState } from "@/server/action";
import { loginSchema } from "@/lib/validation";

// Par adresse IP : 20 tentatives / 15 min (complète le verrouillage par compte après 5 échecs)
const IP_LIMIT = 20;
const WINDOW = 15 * 60_000;

export async function loginAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const res = await runAction(async () => {
    const ip = await clientIp();
    const rl = await hit(`login:${ip}`, IP_LIMIT, WINDOW);
    if (!rl.allowed) throw new BusinessError(`Trop de tentatives de connexion depuis ce poste. Réessayez dans ${rl.retryInMin} minute(s).`);
    const { email, password } = loginSchema.parse(Object.fromEntries(fd));
    const r = await login(email, password);
    if (!r.ok) throw new BusinessError(r.error);
    await resetBucket(`login:${ip}`);
  });
  if (res?.ok) redirect("/dashboard");
  return res;
}
