import { NextResponse } from "next/server";
import { apiUser } from "@/server/auth";
import { db } from "@/server/db";
import { audit } from "@/server/audit";
import { teacherPayPdf } from "@/server/pdf";
import { can } from "@/lib/permissions";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await apiUser();
  if (!user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  if (!can(user.role, "expenses.read")) return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
  const { id } = await params;
  const p = await db.teacherPay.findUnique({ where: { id }, select: { receiptNo: true } });
  if (!p?.receiptNo) return NextResponse.json({ error: "Reçu introuvable" }, { status: 404 });
  const bytes = await teacherPayPdf(id);
  await audit(user.id, "pay.receipt.pdf", "TeacherPay", id, { receiptNo: p.receiptNo });
  return new NextResponse(Buffer.from(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="recu-${p.receiptNo}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
