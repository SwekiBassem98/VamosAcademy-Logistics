import "server-only";
import { randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { BusinessError } from "./action";
import { MAX_UPLOAD_TOTAL } from "@/lib/uploads";

/** Ancien dossier des fichiers privés : lu seulement pour les justificatifs enregistrés avant le stockage en base. */
const ROOT = process.env.STORAGE_DIR || path.join(process.cwd(), "storage");

const SIGNATURES: { mime: string; ext: string; test: (b: Buffer) => boolean }[] = [
  { mime: "application/pdf", ext: "pdf", test: (b) => b.subarray(0, 4).toString() === "%PDF" },
  { mime: "image/png", ext: "png", test: (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  { mime: "image/jpeg", ext: "jpg", test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
];

/**
 * Vérifie taille et contenu réel (signature binaire, pas seulement l'extension) et prépare l'enregistrement :
 * à étaler dans `expenseAttachment.create({ data })` — le fichier est stocké en base (AttachmentContent).
 */
export async function saveUpload(file: File) {
  if (file.size === 0) throw new BusinessError("Fichier vide.");
  if (file.size > MAX_UPLOAD_TOTAL) throw new BusinessError("Fichier trop volumineux (4 Mo maximum).");
  const buf = Buffer.from(await file.arrayBuffer());
  const kind = SIGNATURES.find((s) => s.test(buf));
  if (!kind) throw new BusinessError("Format non accepté : PDF, JPG ou PNG uniquement.");
  const storedName = `${randomBytes(16).toString("hex")}.${kind.ext}`;
  const fileName = file.name.replace(/[^\p{L}\p{N}._ -]/gu, "_").slice(0, 120) || `justificatif.${kind.ext}`;
  return { storedName, fileName, mimeType: kind.mime, size: file.size, content: { create: { data: new Uint8Array(buf) } } };
}

/** Justificatif antérieur au stockage en base, resté sur disque. */
export async function readLegacyFile(folder: string, storedName: string) {
  if (!/^[a-f0-9]{32}\.(pdf|png|jpg)$/.test(storedName)) throw new Error("Nom de fichier invalide");
  return readFile(path.join(/*turbopackIgnore: true*/ ROOT, folder, storedName));
}
