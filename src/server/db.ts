import "server-only";
import type { PrismaClient } from "@prisma/client";
import { createPrismaClient } from "./prisma-client";

const g = globalThis as unknown as { prisma?: PrismaClient };

/** Client créé à la première requête : le build (collecte des routes) n'exige pas DATABASE_URL. */
function lazyClient(): PrismaClient {
  let client: PrismaClient | undefined;
  return new Proxy({} as PrismaClient, {
    get(_, prop) {
      client ??= createPrismaClient();
      const v = Reflect.get(client, prop);
      return typeof v === "function" ? v.bind(client) : v;
    },
  });
}

export const db = g.prisma ?? lazyClient();
if (process.env.NODE_ENV !== "production") g.prisma = db;

export type Tx = Parameters<Parameters<typeof db.$transaction>[0]>[0];
