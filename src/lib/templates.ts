// Modèles de messages en français — variables entre accolades, ex. {eleve}. Testé dans tests/unit.test.ts.

export const TEMPLATE_VARIABLES: Record<string, string> = {
  parent: "Nom du parent", eleve: "Prénom et nom de l'élève", montant: "Montant dû", echeance: "Plus ancienne échéance",
  groupe: "Groupe(s)", date: "Date (absence, séance…)", enseignant: "Nom de l'enseignant", centre: "VAMOS ACADEMY", telephone: "Téléphone du centre",
};

/** Remplace {variable} ; une variable inconnue ou vide reste visible entre crochets pour être corrigée avant envoi. */
export function renderTemplate(body: string, vars: Record<string, string | null | undefined>): string {
  return body.replace(/\{(\w+)\}/g, (_, k: string) => {
    const v = vars[k];
    return v == null || v === "" ? `[${k}]` : v;
  });
}

export function missingVariables(rendered: string): string[] {
  return [...rendered.matchAll(/\[(\w+)\]/g)].map((m) => m[1]).filter((k) => k in TEMPLATE_VARIABLES);
}

export const DEFAULT_TEMPLATES = [
  {
    code: "RAPPEL_PAIEMENT", name: "Rappel de paiement", audience: "PARENT" as const,
    body: "Bonjour {parent}, VAMOS ACADEMY vous rappelle qu'un montant de {montant} reste dû pour {eleve} (échéance du {echeance}, {groupe}). Merci de régulariser au centre. Pour toute question : {telephone}.",
  },
  {
    code: "ECHEANCE_PROCHE", name: "Échéance à venir", audience: "PARENT" as const,
    body: "Bonjour {parent}, la prochaine mensualité de {eleve} ({montant}) est à régler avant le {echeance}. Merci. VAMOS ACADEMY — {telephone}.",
  },
  {
    code: "ABSENCE", name: "Absence d'un élève", audience: "PARENT" as const,
    body: "Bonjour {parent}, nous vous informons que {eleve} était absent(e) à la séance du {date} ({groupe}). Merci de nous transmettre un justificatif. VAMOS ACADEMY — {telephone}.",
  },
  {
    code: "BIENVENUE", name: "Bienvenue / inscription", audience: "PARENT" as const,
    body: "Bonjour {parent}, l'inscription de {eleve} à VAMOS ACADEMY ({groupe}) est confirmée. Bienvenue ! Pour toute question : {telephone}.",
  },
  {
    code: "INFO_ENSEIGNANT", name: "Information enseignant", audience: "ENSEIGNANT" as const,
    body: "Bonjour {enseignant}, ceci est une information de VAMOS ACADEMY concernant le groupe {groupe} : ",
  },
];
