import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { PDFDocument, StandardFonts, degrees, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { db } from "./db";
import { formatDate, formatDateTime, formatMoney, formatPeriod } from "@/lib/format";

const RED = rgb(0.757, 0.153, 0.176);
const NAVY = rgb(0.078, 0.129, 0.239);
const GRAY = rgb(0.42, 0.45, 0.5);

/** Les polices standard PDF (WinAnsi) ne gèrent pas les espaces fines ni l'arabe : on normalise. */
const pdfText = (s: string) => s.replace(/[  ]/g, " ").replace(/[^\u0000-ÿ€—–«»’…]/g, "");

function text(page: PDFPage, s: string, x: number, y: number, font: PDFFont, size = 10, color = rgb(0.1, 0.1, 0.1)) {
  page.drawText(pdfText(s), { x, y, size, font, color });
}
function right(page: PDFPage, s: string, xRight: number, y: number, font: PDFFont, size = 10, color = rgb(0.1, 0.1, 0.1)) {
  const t = pdfText(s);
  page.drawText(t, { x: xRight - font.widthOfTextAtSize(t, size), y, size, font, color });
}

/** Reçu de paiement A5 portrait au format PDF, avec l'identité officielle du centre. */
export async function receiptPdf(paymentId: string): Promise<Uint8Array> {
  const [p, c] = await Promise.all([
    db.payment.findUniqueOrThrow({
      where: { id: paymentId },
      include: {
        mode: true, schoolYear: true, student: { include: { level: true } }, corrects: { select: { receiptNo: true } }, correctedBy: { select: { receiptNo: true } },
        allocations: { include: { invoice: { include: { enrollment: { include: { group: true } } } } } },
      },
    }),
    db.centerSettings.findUnique({ where: { id: 1 } }),
  ]);
  const cashier = p.createdById ? await db.user.findUnique({ where: { id: p.createdById }, select: { fullName: true } }) : null;

  const doc = await PDFDocument.create();
  doc.setTitle(`Reçu ${p.receiptNo} — VAMOS ACADEMY`);
  doc.setAuthor(c?.name ?? "VAMOS ACADEMY");
  doc.setCreator("VAMOS ACADEMY — Gestion");
  const page = doc.addPage([420, 595]); // A5
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const W = 420, M = 30;
  let y = 595 - M;

  try {
    const png = await doc.embedPng(await readFile(path.join(process.cwd(), "public/brand/logo.png")));
    const h = 44, w = (png.width / png.height) * h;
    page.drawImage(png, { x: M, y: y - h, width: w, height: h });
  } catch { /* logo absent : en-tête texte seul */ }
  right(page, "REÇU DE PAIEMENT", W - M, y - 12, bold, 13, NAVY);
  right(page, p.receiptNo, W - M, y - 28, bold, 11, RED);
  right(page, `Date : ${formatDate(p.paidAt)}`, W - M, y - 42, regular, 9, GRAY);
  right(page, `Année scolaire ${p.schoolYear.label}`, W - M, y - 54, regular, 9, GRAY);
  y -= 62;
  text(page, c?.name ?? "VAMOS ACADEMY", M, y, bold, 9, NAVY);
  text(page, `${c?.addressFr ?? ""} — Tél. ${c?.phone ?? ""}`, M, y - 11, regular, 8, GRAY);
  y -= 20;
  page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 2, color: RED });

  y -= 22;
  const field = (label: string, value: string, x: number, yy: number) => { text(page, label, x, yy, regular, 8, GRAY); text(page, value, x, yy - 11, bold, 10); };
  field("Élève", `${p.student.lastName} ${p.student.firstName}`, M, y);
  field("Matricule", p.student.code, 250, y);
  y -= 30;
  field("Niveau", p.student.level?.name ?? "—", M, y);
  field("Moyen de paiement", `${p.mode.label}${p.reference ? ` (${p.reference})` : ""}`, 250, y);

  y -= 32;
  page.drawRectangle({ x: M, y: y - 4, width: W - 2 * M, height: 16, color: NAVY });
  text(page, "DÉSIGNATION", M + 6, y, bold, 8, rgb(1, 1, 1));
  right(page, "MONTANT", W - M - 6, y, bold, 8, rgb(1, 1, 1));
  y -= 18;
  for (const a of p.allocations) {
    const label = `${formatPeriod(a.invoice.period)}${a.invoice.months > 1 ? ` (${a.invoice.months} mois)` : ""} — ${a.invoice.enrollment.group.name}`;
    text(page, label.charAt(0).toUpperCase() + label.slice(1), M + 6, y, regular, 9);
    right(page, formatMoney(a.amount), W - M - 6, y, regular, 9);
    y -= 5;
    page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 0.5, color: rgb(0.85, 0.86, 0.88) });
    y -= 12;
  }
  y -= 4;
  right(page, "Total payé", W - M - 110, y, bold, 10);
  right(page, formatMoney(p.amount), W - M - 6, y, bold, 13, RED);

  if (p.corrects) { y -= 20; text(page, `Ce reçu corrige et remplace le reçu ${p.corrects.receiptNo}.`, M, y, regular, 8, GRAY); }
  if (p.note) { y -= 16; text(page, `Note : ${p.note}`.slice(0, 95), M, y, regular, 8, GRAY); }
  if (p.cancelledAt) {
    page.drawText(p.correctedBy ? "CORRIGÉ" : "ANNULÉ", { x: 90, y: 260, size: 60, font: bold, color: rgb(0.86, 0.15, 0.15), opacity: 0.18, rotate: degrees(20) });
    y -= 16; text(page, pdfText(`Annulé le ${formatDateTime(p.cancelledAt)} — ${p.cancelReason ?? ""}`).slice(0, 95), M, y, bold, 8, RED);
  }

  text(page, `Encaissé par : ${cashier?.fullName ?? "—"}`, M, 110, regular, 8, GRAY);
  text(page, `Émis le ${formatDateTime(p.createdAt)}`, M, 99, regular, 8, GRAY);
  page.drawLine({ start: { x: 250, y: 110 }, end: { x: W - M, y: 110 }, thickness: 0.5, color: GRAY, dashArray: [3, 2] });
  text(page, "Cachet & signature", 285, 99, regular, 8, GRAY);

  page.drawLine({ start: { x: M, y: 60 }, end: { x: W - M, y: 60 }, thickness: 0.5, color: rgb(0.85, 0.86, 0.88) });
  if (c?.receiptFooter) text(page, c.receiptFooter.slice(0, 90), M, 48, regular, 7, GRAY);
  text(page, `Document édité le ${formatDateTime(new Date())} (heure de Tunis)${p.student.isDemo ? " — DONNÉES DE DÉMONSTRATION" : ""}`, M, 37, regular, 7, GRAY);
  return doc.save();
}
