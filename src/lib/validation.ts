// Schémas Zod partagés client/serveur.
import { z } from "zod";
import { normalizePhone, parseMoney, parseTime } from "./format";

const req = (label: string) => z.string({ required_error: `${label} est obligatoire` }).trim().min(1, `${label} est obligatoire`);
const opt = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v ? v : null));

export const phone = (label = "Téléphone") =>
  req(label).transform((v, ctx) => {
    const p = normalizePhone(v);
    if (!p) ctx.addIssue({ code: "custom", message: `${label} : 8 chiffres attendus` });
    return p ?? v;
  });
const optPhone = opt.transform((v, ctx) => {
  if (!v) return null;
  const p = normalizePhone(v);
  if (!p) ctx.addIssue({ code: "custom", message: "Téléphone : 8 chiffres attendus" });
  return p;
});

export const money = (label = "Montant") =>
  req(label).transform((v, ctx) => {
    const m = parseMoney(v);
    if (m === null) ctx.addIssue({ code: "custom", message: `${label} invalide (ex. 45,500)` });
    return m ?? 0;
  });

/** Montant facultatif : vide → null. */
export const optMoney = (label = "Montant") =>
  z.string().trim().optional().transform((v, ctx) => {
    if (!v) return null;
    const m = parseMoney(v);
    if (m === null) ctx.addIssue({ code: "custom", message: `${label} invalide (ex. 45,500)` });
    return m;
  });

export const day = (label = "Date") => req(label).regex(/^\d{4}-\d{2}-\d{2}$/, `${label} invalide`);
const optDay = opt.refine((v) => !v || /^\d{4}-\d{2}-\d{2}$/.test(v), "Date invalide");
const int = (label: string, min = 0, max = 1_000_000) => z.coerce.number({ invalid_type_error: `${label} invalide` }).int().min(min).max(max);

export const loginSchema = z.object({
  email: req("E-mail").email("E-mail invalide").toLowerCase(),
  password: req("Mot de passe"),
});

export const studentSchema = z.object({
  firstName: req("Prénom"),
  lastName: req("Nom"),
  fullNameAr: opt,
  birthDate: optDay,
  gender: z.enum(["M", "F"]).optional().or(z.literal("").transform(() => undefined)),
  school: opt,
  className: opt,
  levelId: opt,
  phone: optPhone,
  address: opt,
  medicalNotes: opt,
  notes: opt,
  status: z.enum(["PREINSCRIT", "ACTIF", "SUSPENDU", "ARCHIVE"]).default("ACTIF"),
});

export const guardianSchema = z.object({
  firstName: req("Prénom"),
  lastName: req("Nom"),
  phone: phone(),
  phone2: optPhone,
  email: opt.refine((v) => !v || z.string().email().safeParse(v).success, "E-mail invalide"),
  profession: opt,
  cin: opt.refine((v) => !v || /^\d{8}$/.test(v), "CIN : 8 chiffres"),
  relation: req("Lien de parenté"),
  isPayer: z.coerce.boolean().default(false),
});

export const enrollmentSchema = z.object({
  groupId: req("Groupe"),
  startDate: day("Date d'entrée"),
  discountTypeId: opt, // uniquement une réduction autorisée (configurée dans Paramètres)
  discountNote: opt,
  plan: z.enum(["MENSUEL", "TRIMESTRIEL", "ANNUEL"]).default("MENSUEL"),
  chargeRegistration: z.coerce.boolean().default(false),
});

export const termsSchema = z.object({
  monthlyFee: money("Mensualité"),
  plan: z.enum(["MENSUEL", "TRIMESTRIEL", "ANNUEL"]),
  fromPeriod: req("Mois d'effet").regex(/^\d{4}-\d{2}$/, "Mois invalide"),
  reason: req("Motif").min(3, "Motif trop court"),
});

export const teacherSchema = z.object({
  firstName: req("Prénom"),
  lastName: req("Nom"),
  phone: phone(),
  email: opt.refine((v) => !v || z.string().email().safeParse(v).success, "E-mail invalide"),
  payMode: z.enum(["HORAIRE", "MENSUEL", "POURCENTAGE", "PAR_SEANCE"]),
  payRate: req("Taux"),
  subjectIds: z.array(z.string()).default([]),
  cycleIds: z.array(z.string()).default([]),
  notes: opt,
});

const time = (label: string) =>
  req(label).transform((v, ctx) => parseTime(v) ?? (ctx.addIssue({ code: "custom", message: `${label} invalide` }), 0));

export const availabilitySchema = z
  .object({ weekday: int("Jour", 1, 7), start: time("Début"), end: time("Fin") })
  .refine((v) => v.end > v.start, { message: "La fin doit être après le début", path: ["end"] });

export const assessmentSchema = z.object({
  groupId: req("Groupe"),
  title: req("Intitulé"),
  kind: z.enum(["DEVOIR", "TEST", "EXAMEN_BLANC", "ORAL"]),
  term: int("Trimestre", 1, 3),
  date: day(),
  coefficient: int("Coefficient", 1, 10),
  maxScore: int("Barème", 1, 100),
});

export const passwordChangeSchema = z
  .object({
    current: req("Mot de passe actuel"),
    next: req("Nouveau mot de passe").refine(strongPassword, "10 caractères min., avec lettres et chiffres"),
    confirm: req("Confirmation"),
  })
  .refine((v) => v.next === v.confirm, { message: "Les mots de passe ne correspondent pas", path: ["confirm"] });

export const discountTypeSchema = z.object({
  name: req("Nom"),
  percent: int("Pourcentage", 1, 100),
});

export const groupSchema = z.object({
  name: req("Nom du groupe"),
  levelId: req("Niveau"),
  subjectId: req("Matière"),
  teacherId: opt,
  roomId: opt,
  capacity: int("Capacité", 1, 200),
  // vides → tarif de la grille tarifaire de l'année
  monthlyFee: optMoney("Mensualité"),
  registrationFee: optMoney("Frais d'inscription"),
});

export const slotSchema = z
  .object({
    groupId: req("Groupe"),
    roomId: req("Salle"),
    weekday: int("Jour", 1, 7),
    start: req("Début").transform((v, ctx) => parseTime(v) ?? (ctx.addIssue({ code: "custom", message: "Heure de début invalide" }), 0)),
    end: req("Fin").transform((v, ctx) => parseTime(v) ?? (ctx.addIssue({ code: "custom", message: "Heure de fin invalide" }), 0)),
    slotId: opt,
  })
  .refine((v) => v.end > v.start, { message: "La fin doit être après le début", path: ["end"] });

export const paymentSchema = z.object({
  studentId: req("Élève"),
  amount: money(),
  modeId: req("Moyen de paiement"),
  reference: opt,
  paidAt: day("Date"),
  note: opt,
  invoiceIds: z.array(z.string()).default([]),
});

export const expenseSchema = z.object({
  categoryId: req("Catégorie"),
  label: req("Libellé"),
  amount: money(),
  modeId: req("Moyen de paiement"),
  reference: opt,
  spentAt: day("Date"),
});

export const feeRuleSchema = z.object({
  cycleId: opt,
  levelId: opt,
  subjectId: opt,
  monthlyFee: money("Mensualité"),
  registrationFee: optMoney("Frais d'inscription"),
});

export const paymentModeSchema = z.object({
  code: z.string().trim().toUpperCase().regex(/^[A-Z0-9_]{2,20}$/, "Code : 2 à 20 lettres majuscules/chiffres"),
  label: req("Libellé"),
  requiresReference: z.coerce.boolean().default(false),
});

export const templateSchema = z.object({
  name: req("Nom"),
  body: req("Texte").max(1000, "1000 caractères maximum"),
});

export const schoolYearSchema = z.object({
  label: req("Libellé").regex(/^\d{4}-\d{4}$/, "Format attendu : 2026-2027"),
  startDate: day("Début"),
  endDate: day("Fin"),
  dueDay: int("Jour limite", 1, 28),
});

export const userSchema = z.object({
  fullName: req("Nom complet"),
  email: req("E-mail").email("E-mail invalide").toLowerCase(),
  role: z.enum(["ADMIN", "RESPONSABLE", "COMPTABLE", "ENSEIGNANT", "LECTURE"]),
  teacherId: opt,
  password: opt.refine((v) => !v || strongPassword(v), "Mot de passe : 10 caractères min., avec lettres et chiffres"),
});

export function strongPassword(p: string): boolean {
  return p.length >= 10 && /[a-zA-Z]/.test(p) && /\d/.test(p);
}

export const settingsSchema = z.object({
  name: req("Nom"),
  addressFr: req("Adresse"),
  addressAr: opt,
  phone: phone(),
  email: opt,
  receiptFooter: opt,
});

/** Convertit un FormData en objet (les clés répétées deviennent des tableaux, les cases à cocher cochées → "on"). */
export function formToObject(fd: FormData, arrays: string[] = []): Record<string, unknown> {
  const o: Record<string, unknown> = {};
  for (const [k, v] of fd.entries()) {
    if (k.startsWith("$ACTION")) continue;
    const val = typeof v === "string" ? v : "";
    if (arrays.includes(k)) ((o[k] as string[]) ??= []).push(val);
    else o[k] = val === "on" ? true : val;
  }
  for (const k of arrays) o[k] ??= [];
  return o;
}
