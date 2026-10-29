import { MAX_UPLOAD_TOTAL, UPLOAD_LIMIT_LABEL } from "@/lib/uploads";

const SHRINK_ABOVE = 1_500_000;
const MAX_SIDE = 2000;

/** Photo de téléphone trop lourde → JPEG redimensionné (lisible, quelques centaines de Ko). Sinon fichier inchangé. */
async function shrinkImage(f: File): Promise<File> {
  if (!/^image\/(jpeg|png)$/.test(f.type) || f.size <= SHRINK_ABOVE) return f;
  try {
    const bmp = await createImageBitmap(f);
    const scale = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bmp.width * scale);
    canvas.height = Math.round(bmp.height * scale);
    canvas.getContext("2d")?.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    bmp.close();
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", 0.85));
    if (!blob || blob.size >= f.size) return f;
    return new File([blob], f.name.replace(/\.[^.]+$/, "") + ".jpg", { type: "image/jpeg" });
  } catch {
    return f;
  }
}

/** Allège les photos jointes puis vérifie la taille totale avant l'envoi. Renvoie un message d'erreur si trop lourd. */
export async function prepareUploads(fd: FormData): Promise<string | null> {
  let total = 0;
  for (const key of new Set(fd.keys())) {
    const values = fd.getAll(key);
    if (!values.some((v) => v instanceof File && v.size > 0)) continue;
    const next = await Promise.all(values.map((v) => (v instanceof File && v.size > 0 ? shrinkImage(v) : v)));
    fd.delete(key);
    for (const v of next) {
      if (v instanceof File) {
        total += v.size;
        fd.append(key, v, v.name);
      } else fd.append(key, v);
    }
  }
  return total > MAX_UPLOAD_TOTAL ? `Fichiers trop volumineux (${UPLOAD_LIMIT_LABEL} maximum par envoi). Joignez-les en plusieurs fois ou réduisez leur taille.` : null;
}
