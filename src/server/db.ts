import "server-only";
import type { PrismaClient } from "@prisma/client";
import { createPrismaClient } from "./prisma-client";

const g = globalThis as unknown as { prisma?: PrismaClient };

export const db = g.prisma ?? createPrismaClient();
if (process.env.NODE_ENV !== "production") g.prisma = db;

export type Tx = Parameters<Parameters<typeof db.$transaction>[0]>[0];
