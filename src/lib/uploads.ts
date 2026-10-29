// Limites des justificatifs, partagées navigateur / serveur.
// Vercel refuse les requêtes de plus de 4,5 Mo : on reste en dessous, formulaire compris.
export const MAX_UPLOAD_TOTAL = 4 * 1024 * 1024;
export const UPLOAD_LIMIT_LABEL = "4 Mo au total";
