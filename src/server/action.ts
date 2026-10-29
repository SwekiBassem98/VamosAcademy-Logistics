import "server-only";
import { ZodError } from "zod";
import { Prisma } from "@prisma/client";
import { isRedirectError } from "next/dist/client/components/redirect-error";
import { ForbiddenError } from "./auth";

import type { ActionState } from "@/components/form";
export type { ActionState };

export class BusinessError extends Error {}

/** Convertit les erreurs connues en état affichable par les formulaires. */
export async function runAction(fn: () => Promise<string | void>): Promise<ActionState> {
  try {
    const message = await fn();
    return { ok: true, message: message ?? "Enregistré." };
  } catch (e) {
    if (isRedirectError(e)) throw e;
    if (e instanceof ZodError) {
      const fieldErrors: Record<string, string> = {};
      for (const i of e.issues) fieldErrors[String(i.path[0] ?? "_")] ??= i.message;
      return { error: "Veuillez corriger les champs signalés.", fieldErrors };
    }
    if (e instanceof BusinessError || e instanceof ForbiddenError) return { error: e.message };
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return { error: "Cet enregistrement existe déjà (doublon)." };
    }
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2003") {
      return { error: "Suppression impossible : des données y sont rattachées." };
    }
    console.error(e);
    return { error: "Une erreur inattendue est survenue." };
  }
}
