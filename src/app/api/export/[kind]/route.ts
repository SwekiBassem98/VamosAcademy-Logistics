import { NextResponse, type NextRequest } from "next/server";
import { apiUser } from "@/server/auth";
import { db } from "@/server/db";
import { audit } from "@/server/audit";
import { buildTable, toCsv, toXlsx } from "@/server/exports";
import { todayISO } from "@/lib/format";

/** Exports CSV (par défaut) ou Excel (?format=xlsx) ; permissions vérifiées par type d'export. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ kind: string }> }) {
  const { kind } = await params;
  const user = await apiUser();
  if (!user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  const sp = Object.fromEntries(req.nextUrl.searchParams);
  const table = await buildTable(kind, sp, user);
  if (table === "forbidden") return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
  if (!table) return NextResponse.json({ error: "Export inconnu ou données introuvables" }, { status: 404 });

  const xlsx = sp.format === "xlsx";
  await audit(user.id, "export", kind, null, { ...sp, rows: table.rows.length });
  const name = `vamos-${kind}-${todayISO()}.${xlsx ? "xlsx" : "csv"}`;
  const headers = { "Content-Disposition": `attachment; filename="${name}"`, "Cache-Control": "no-store" };
  if (xlsx) {
    const center = (await db.centerSettings.findUnique({ where: { id: 1 } }))?.name ?? "VAMOS ACADEMY";
    const buf = await toXlsx(table, center);
    return new NextResponse(new Uint8Array(buf), { headers: { ...headers, "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" } });
  }
  return new NextResponse(toCsv(table), { headers: { ...headers, "Content-Type": "text/csv; charset=utf-8" } });
}
