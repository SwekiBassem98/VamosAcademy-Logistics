import { NextResponse } from "next/server";
import { db } from "@/server/db";

export const dynamic = "force-dynamic";

/** Sonde de supervision (sans authentification, sans donnée) : application démarrée et base joignable. */
export async function GET() {
  try {
    await db.$queryRaw`SELECT 1`;
    return NextResponse.json({ status: "ok" }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ status: "database_unavailable" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
