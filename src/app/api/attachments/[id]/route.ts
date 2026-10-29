import { NextResponse } from "next/server";
import { apiUser } from "@/server/auth";
import { db } from "@/server/db";
import { readStored } from "@/server/storage";
import { can } from "@/lib/permissions";

/** Justificatifs de dépenses : servis uniquement aux utilisateurs autorisés (jamais via /public). */
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await apiUser();
  if (!user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  if (!can(user.role, "expenses.read")) return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
  const { id } = await params;
  const a = await db.expenseAttachment.findUnique({ where: { id } });
  if (!a) return NextResponse.json({ error: "Fichier introuvable" }, { status: 404 });
  try {
    const buf = await readStored("expenses", a.storedName);
    return new NextResponse(new Uint8Array(buf), {
      headers: {
        "Content-Type": a.mimeType,
        "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(a.fileName)}`,
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "private, no-store",
      },
    });
  } catch {
    return NextResponse.json({ error: "Fichier manquant sur le serveur" }, { status: 410 });
  }
}
