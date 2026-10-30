// Formats français / tunisiens. Montants stockés en millimes (1 DT = 1000 millimes).

export const TZ = "Africa/Tunis";
export const LOCALE = "fr-TN";

const moneyFmt = new Intl.NumberFormat(LOCALE, {
  minimumFractionDigits: 3,
  maximumFractionDigits: 3,
});

/** 45500 → "45,500 DT" */
export function formatMoney(millimes: number): string {
  return `${moneyFmt.format(millimes / 1000)} DT`;
}

/** "45", "45,5", "45.500", "1 234,250" → millimes. Retourne null si invalide. */
export function parseMoney(input: string | null | undefined): number | null {
  if (input == null) return null;
  const s = String(input).replace(/[\s  ]/g, "").replace(/DT|TND/gi, "").replace(",", ".");
  if (!/^\d+(\.\d{0,3})?$/.test(s)) return null;
  const [int, dec = ""] = s.split(".");
  return Number(int) * 1000 + Number(dec.padEnd(3, "0"));
}

/** Millimes → valeur d'un champ de saisie ("45,500"). */
export function moneyInput(millimes: number): string {
  return (millimes / 1000).toFixed(3).replace(".", ",");
}

const dateFmt = new Intl.DateTimeFormat("fr-FR", { timeZone: TZ, day: "2-digit", month: "2-digit", year: "numeric" });
const dateTimeFmt = new Intl.DateTimeFormat("fr-FR", {
  timeZone: TZ, day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
});
const monthFmt = new Intl.DateTimeFormat("fr-FR", { timeZone: "UTC", month: "long", year: "numeric" });

export function formatDate(d: Date | null | undefined): string {
  return d ? dateFmt.format(d) : "—";
}
export function formatDateTime(d: Date | null | undefined): string {
  return d ? dateTimeFmt.format(d) : "—";
}

/** "2026-10" → "octobre 2026" */
export function formatPeriod(period: string): string {
  if (!/^\d{4}-\d{2}$/.test(period)) return period === "INSCRIPTION" ? "Frais d'inscription" : period;
  const [y, m] = period.split("-").map(Number);
  return monthFmt.format(new Date(Date.UTC(y, m - 1, 1)));
}

/** Date du jour à Tunis au format AAAA-MM-JJ. */
export function todayISO(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(now);
}

/** "AAAA-MM-JJ" → Date à midi UTC (même jour calendaire à Tunis, sans décalage). */
export function parseDay(s: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) throw new Error("Date invalide");
  return new Date(`${s}T12:00:00Z`);
}

/** Date → "AAAA-MM-JJ" (jour à Tunis), pour les champs <input type=date>. */
export function dayInput(d: Date | null | undefined): string {
  return d ? todayISO(d) : "";
}

export function periodOf(d: Date): string {
  return todayISO(d).slice(0, 7);
}

/** 510 → "08:30" */
export function formatMinutes(min: number): string {
  return `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
}
/** 510 → "08:30" pour un champ <input type=time> */
export const minutesInput = formatMinutes;

export function parseTime(s: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(s);
  if (!m) return null;
  const h = Number(m[1]), mm = Number(m[2]);
  if (h > 23 || mm > 59) return null;
  return h * 60 + mm;
}

export const WEEKDAYS = ["", "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"];

/** Téléphone tunisien : 8 chiffres, affiché "20 807 657". */
export function normalizePhone(s: string): string | null {
  const digits = s.replace(/\D/g, "").replace(/^216/, "");
  return /^\d{8}$/.test(digits) ? `${digits.slice(0, 2)} ${digits.slice(2, 5)} ${digits.slice(5)}` : null;
}

/** Heure actuelle à Tunis, en minutes depuis minuit. */
export function minutesNowTunis(now: Date = new Date()): number {
  const [h, m] = new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(now).split(":").map(Number);
  return h * 60 + m;
}

/** 135 → "2 h 15", 45 → "45 min" */
export function formatDuration(min: number): string {
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60), m = min % 60;
  return m ? `${h} h ${String(m).padStart(2, "0")}` : `${h} h`;
}
