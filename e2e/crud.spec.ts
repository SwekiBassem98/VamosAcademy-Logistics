import { expect, test, type Locator, type Page } from "@playwright/test";

/**
 * Chaque création, modification, suppression, annulation et action de gestion, exécutée depuis l'interface
 * (build de production) : le bouton doit agir, la page se mettre à jour et un refus métier s'afficher en français.
 */
const ADMIN = { email: "admin@vamos-academy.tn", password: "E2eAdmin2026xyz" };
const STAMP = Date.now().toString(36).slice(-4).toUpperCase();

test.describe.configure({ mode: "default" });
test.use({ viewport: { width: 1280, height: 900 } });

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("E-mail", { exact: true }).fill(ADMIN.email);
  await page.getByLabel("Mot de passe", { exact: true }).fill(ADMIN.password);
  await page.getByRole("button", { name: "Se connecter" }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"));
}

/** Ouvre la fenêtre de confirmation, remplit le motif éventuel et confirme. Renvoie le message d'erreur s'il y en a un. */
async function confirm(page: Page, trigger: Locator, reason?: string): Promise<string | null> {
  await trigger.click();
  const dialog = page.locator("dialog[open]");
  await expect(dialog).toBeVisible();
  if (reason) await dialog.locator('input[name="reason"]').fill(reason);
  await dialog.locator('button[type="submit"]').click();
  const alert = dialog.getByRole("alert");
  const outcome = await Promise.race([
    dialog.waitFor({ state: "detached" }).then(() => "closed").catch(() => null),
    page.locator("dialog[open]").waitFor({ state: "hidden" }).then(() => "closed").catch(() => null),
    alert.waitFor().then(() => "error").catch(() => null),
  ]);
  if (outcome === "error") {
    const text = (await alert.textContent()) ?? "";
    await dialog.getByRole("button", { name: "Annuler", exact: true }).click();
    return text;
  }
  return null;
}

/** Envoie le formulaire qui contient `submit` et attend son message de succès. */
async function submitOk(form: Locator, submit: string, message?: string | RegExp) {
  await form.getByRole("button", { name: submit, exact: true }).click();
  const status = form.locator('p[role="status"]');
  await expect(status, `formulaire « ${submit} »`).toBeVisible();
  if (message) await expect(status).toContainText(message);
}

const formWith = (page: Page, button: string) => page.locator("form").filter({ has: page.getByRole("button", { name: button, exact: true }) });

test.beforeEach(async ({ page }) => {
  await login(page);
});

test("référentiel : niveau, matière et salle — ajout, modification, suppression, refus si utilisé", async ({ page }) => {
  await page.goto("/academics");
  const level = `Niveau ${STAMP}`;
  const levelForm = page.locator("form").filter({ has: page.locator('input[name="name"][placeholder="ex. Bac Sport"]') });
  await levelForm.locator('input[name="name"]').fill(level);
  await submitOk(levelForm, "Ajouter");
  await expect(page.getByRole("button", { name: `Supprimer le niveau ${level}` })).toBeVisible();
  expect(await confirm(page, page.getByRole("button", { name: `Supprimer le niveau ${level}` }))).toBeNull();
  await expect(page.getByRole("button", { name: `Supprimer le niveau ${level}` })).toHaveCount(0);

  const subject = `Matière ${STAMP}`;
  const subjectForm = page.locator("form").filter({ has: page.locator('input[name="code"]') });
  await subjectForm.locator('input[name="code"]').fill(`T${STAMP}`);
  await subjectForm.locator('input[name="name"]').fill(subject);
  await submitOk(subjectForm, "Ajouter");
  const subjectRow = page.locator("li", { hasText: subject });
  await expect(subjectRow).toBeVisible();
  expect(await confirm(page, subjectRow.getByRole("button", { name: "Supprimer" }))).toBeNull();
  await expect(page.locator("li", { hasText: subject })).toHaveCount(0);

  const room = `Salle ${STAMP}`;
  const roomForm = page.locator("form").filter({ has: page.locator('input[name="capacity"]') }).last();
  await roomForm.locator('input[name="name"]').fill(room);
  await roomForm.locator('input[name="capacity"]').fill("10");
  await submitOk(roomForm, "Ajouter");
  const roomItem = page.locator("li").filter({ has: page.locator("summary", { hasText: room }) });
  await roomItem.locator("summary").click();
  const edit = roomItem.locator("form");
  await edit.locator('input[name="name"]').fill(`${room} bis`);
  await submitOk(edit, "Enregistrer");
  await page.reload();
  const renamed = page.locator("li").filter({ has: page.locator("summary", { hasText: `${room} bis` }) });
  await renamed.locator("summary").click();
  expect(await confirm(page, renamed.getByRole("button", { name: "Supprimer la salle" }))).toBeNull();
  await expect(page.locator("summary", { hasText: `${room} bis` })).toHaveCount(0);

  // Refus métier : salle utilisée
  const used = page.locator("li").filter({ has: page.locator("summary", { hasText: "Salle 1" }) }).first();
  await used.locator("summary").click();
  expect(await confirm(page, used.getByRole("button", { name: "Supprimer la salle" }))).toMatch(/Suppression impossible/);
});

test("groupe et créneaux : création, modification, ajout et suppression de créneau", async ({ page }) => {
  await page.goto("/academics");
  await page.getByRole("button", { name: "Nouveau groupe" }).click();
  const sheet = page.locator("dialog[open]");
  await sheet.locator('input[name="name"]').fill(`Groupe ${STAMP}`);
  await sheet.locator('select[name="levelId"]').selectOption({ label: "Collège — 9e année de base" });
  await sheet.locator('select[name="subjectId"]').selectOption({ label: "Mathématiques" });
  await sheet.locator('input[name="capacity"]').fill("8");
  await sheet.locator('input[name="monthlyFee"]').fill("40");
  await sheet.getByRole("button", { name: "Créer le groupe" }).click();
  await expect(page).toHaveURL(/\/academics\/groups\/c/);
  await expect(page.getByRole("heading", { level: 1, name: `Groupe ${STAMP}`, exact: true })).toBeVisible();

  const groupForm = formWith(page, "Enregistrer");
  await groupForm.locator('input[name="capacity"]').fill("9");
  await submitOk(groupForm, "Enregistrer");
  await page.reload();
  await expect(page.getByText("0/9 élèves")).toBeVisible();

  const slotForm = formWith(page, "Ajouter");
  await slotForm.locator('select[name="weekday"]').selectOption("7");
  await slotForm.locator('input[name="start"]').fill("18:00");
  await slotForm.locator('input[name="end"]').fill("19:00");
  await submitOk(slotForm, "Ajouter");
  await page.reload();
  const slot = page.locator("li", { hasText: "Dimanche 18:00–19:00" });
  await expect(slot).toBeVisible();
  expect(await confirm(page, slot.getByRole("button", { name: "Supprimer" }))).toBeNull();
  await expect(page.locator("li", { hasText: "Dimanche 18:00–19:00" })).toHaveCount(0);
});

test("enseignant : création, modification, disponibilités ajoutées puis retirées", async ({ page }) => {
  await page.goto("/teachers");
  await page.getByRole("button", { name: "Nouvel enseignant" }).click();
  const sheet = page.locator("dialog[open]");
  await sheet.locator('input[name="lastName"]').fill(`Prof${STAMP}`);
  await sheet.locator('input[name="firstName"]').fill("Sami");
  await sheet.locator('input[name="phone"]').fill("22333444");
  await sheet.locator('input[name="payRate"]').fill("12");
  await sheet.locator('button[type="submit"]').click();
  await expect(page).toHaveURL(/\/teachers\/c/);
  await expect(page.getByRole("heading", { name: `Prof${STAMP} Sami` })).toBeVisible();

  await page.getByRole("button", { name: "Modifier la fiche" }).click();
  const editSheet = page.locator("dialog[open]");
  await editSheet.locator('input[name="firstName"]').fill("Samir");
  await editSheet.locator('button[type="submit"]').click();
  await expect(editSheet.locator('p[role="status"]')).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: `Prof${STAMP} Samir` })).toBeVisible();

  const avail = formWith(page, "Ajouter");
  await avail.locator('select[name="weekday"]').selectOption("2");
  await avail.locator('input[name="start"]').fill("08:00");
  await avail.locator('input[name="end"]').fill("12:00");
  await submitOk(avail, "Ajouter");
  await page.reload();
  const row = page.locator("li", { hasText: "08:00" }).filter({ has: page.getByRole("button", { name: "Retirer" }) });
  await expect(row).toHaveCount(1);
  expect(await confirm(page, row.getByRole("button", { name: "Retirer" }))).toBeNull();
  await expect(page.locator("li", { hasText: "08:00" }).filter({ has: page.getByRole("button", { name: "Retirer" }) })).toHaveCount(0);
});

test("dossier élève : contacts, inscription, tarif, fin d'inscription, archivage et réactivation", async ({ page }) => {
  await page.goto("/students/new");
  await page.getByLabel("Nom *", { exact: true }).fill(`Crud${STAMP}`);
  await page.getByLabel("Prénom *", { exact: true }).fill("Lina");
  await page.locator('select[name="levelId"]').selectOption({ label: "Collège — 9e année de base" });
  await page.locator('input[name="parent_lastName"]').fill(`Crud${STAMP}`);
  await page.locator('input[name="parent_firstName"]').fill("Mourad");
  await page.locator('input[name="parent_phone"]').fill("97000111");
  await page.getByRole("button", { name: "Créer le dossier" }).click();
  await expect(page.locator('p[role="status"]').first()).toContainText("Dossier créé");

  // Ajouter un second contact, le modifier, le retirer
  await page.getByText("+ Ajouter un parent / contact").click();
  const add = formWith(page, "Ajouter");
  await add.locator('select[name="relation"]').selectOption("Mère");
  await add.locator('input[name="lastName"]').fill(`Crud${STAMP}`);
  await add.locator('input[name="firstName"]').fill("Salma");
  await add.locator('input[name="phone"]').fill("97000222");
  await submitOk(add, "Ajouter");
  await page.reload();
  const salma = page.locator("li").filter({ hasText: "Salma" }).filter({ has: page.getByText("Modifier ce contact") });
  await salma.getByText("Modifier ce contact").click();
  await salma.locator('input[name="profession"]').fill("Infirmière");
  await submitOk(salma.locator("form"), "Enregistrer");
  expect(await confirm(page, salma.getByRole("button", { name: "Retirer ce contact" }))).toBeNull();
  await expect(page.locator("li").filter({ hasText: "Salma" }).filter({ has: page.getByText("Modifier ce contact") })).toHaveCount(0);

  // Inscription, changement de tarif, fin d'inscription
  const enroll = formWith(page, "Inscrire");
  const value = await enroll.locator('select[name="groupId"] option', { hasText: "Maths 9e — G1" }).first().getAttribute("value");
  await enroll.locator('select[name="groupId"]').selectOption(value!);
  await submitOk(enroll, "Inscrire");
  await page.reload();
  await page.getByText("Modifier le tarif ou l'échéancier d'une inscription").click();
  const terms = formWith(page, "Appliquer");
  await terms.locator('input[name="monthlyFee"]').fill("45");
  await terms.locator('input[name="reason"]').fill("Accord de la direction");
  await submitOk(terms, "Appliquer");
  await page.reload();
  expect(await confirm(page, page.getByRole("button", { name: /Terminer l'inscription au groupe Maths 9e — G1/ }))).toBeNull();
  await expect(page.getByRole("cell", { name: "terminée", exact: true })).toBeVisible();

  // Archivage puis réactivation
  expect(await confirm(page, page.getByRole("button", { name: "Archiver" }), "Départ de la famille")).toBeNull();
  await expect(page.getByText(/Archivé le/)).toBeVisible();
  expect(await confirm(page, page.getByRole("button", { name: "Réactiver" }))).toBeNull();
  await expect(page.getByRole("button", { name: "Archiver" })).toBeVisible();
});

test("notes : évaluation créée, notée, modifiée puis supprimée", async ({ page }) => {
  await page.goto("/grades");
  await page.locator('select[name="group"]').selectOption({ label: "Maths 9e — G1" });
  await page.getByRole("button", { name: "Afficher" }).click();
  const create = formWith(page, "Créer l'évaluation");
  await create.locator('input[name="title"]').fill(`Contrôle ${STAMP}`);
  await create.locator('input[name="date"]').fill("2026-10-20");
  await create.getByRole("button", { name: "Créer l'évaluation" }).click();
  await expect(page).toHaveURL(/a=c/);
  const grades = formWith(page, "Enregistrer les notes");
  const inputs = grades.locator('input[name^="g_"]');
  await inputs.first().fill("15,5");
  await submitOk(grades, "Enregistrer les notes");
  const edit = formWith(page, "Enregistrer");
  await edit.locator('input[name="title"]').fill(`Contrôle ${STAMP} (modifié)`);
  await edit.getByRole("button", { name: "Enregistrer", exact: true }).click();
  await expect(page.getByText(`Contrôle ${STAMP} (modifié)`).first()).toBeVisible();
  expect(await confirm(page, page.getByRole("button", { name: "Supprimer" }))).toBeNull();
  await expect(page).toHaveURL(/\/grades\?group=/);
  await expect(page.getByText(`Contrôle ${STAMP} (modifié)`)).toHaveCount(0);
});

test("finances : paiement annulé, dépense jointe, corrigée puis annulée, catégorie créée", async ({ page }) => {
  // Paiement puis annulation
  await page.goto("/students?q=Amine");
  await page.getByRole("link", { name: /Trabelsi Amine/ }).first().click();
  await page.waitForURL(/\/students\/c[a-z0-9]+$/);
  await page.goto(page.url().replace("/students/", "/payments/new?student="));
  await page.getByLabel("Montant (DT) *", { exact: true }).fill("10");
  await page.evaluate(() => { window.print = () => undefined; });
  await page.getByRole("button", { name: "Valider et imprimer le reçu" }).click();
  await expect(page).toHaveURL(/\/payments\/c/);
  expect(await confirm(page, page.getByRole("button", { name: "Annuler le reçu" }), "Erreur de saisie")).toBeNull();
  await expect(page.getByText(/annulé/i).first()).toBeVisible();

  // Catégorie, dépense, justificatif, correction, annulation
  await page.goto("/expenses");
  await page.getByRole("button", { name: "Nouvelle dépense" }).click();
  const sheet = page.locator("dialog[open]");
  const cat = sheet.locator("form").filter({ has: page.getByRole("button", { name: "Ajouter", exact: true }) });
  await cat.locator('input[name="name"]').fill(`Catégorie ${STAMP}`);
  await submitOk(cat, "Ajouter");
  const exp = sheet.locator("form").filter({ has: page.getByRole("button", { name: "Enregistrer la dépense" }) });
  await page.reload();
  await page.getByRole("button", { name: "Nouvelle dépense" }).click();
  const sheet2 = page.locator("dialog[open]");
  await sheet2.locator('select[name="categoryId"]').selectOption({ label: `Catégorie ${STAMP}` });
  await sheet2.locator('input[name="label"]').fill(`Dépense ${STAMP}`);
  await sheet2.locator('input[name="amount"]').fill("12,500");
  await sheet2.getByRole("button", { name: "Enregistrer la dépense" }).click();
  await expect(sheet2.locator('p[role="status"]')).toBeVisible();
  expect(exp).toBeTruthy();
  await page.goto("/expenses");
  await page.getByRole("link", { name: `Dépense ${STAMP}` }).first().click();
  const attach = formWith(page, "Joindre");
  await attach.locator('input[type="file"]').setInputFiles({ name: "facture.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4 facture e2e") });
  await submitOk(attach, "Joindre", "Justificatif ajouté");
  await page.reload();
  await expect(page.getByRole("link", { name: "facture.pdf" })).toBeVisible();
  const correct = formWith(page, "Enregistrer la correction");
  await correct.locator('input[name="amount"]').fill("13");
  await correct.locator('input[name="reason"]').fill("Montant de la facture");
  await correct.getByRole("button", { name: "Enregistrer la correction" }).click();
  await expect(page.getByText(/corrige/i).first()).toBeVisible();
  expect(await confirm(page, page.getByRole("button", { name: "Annuler la dépense" }), "Doublon")).toBeNull();
  await expect(page.getByText(/annulée/i).first()).toBeVisible();
});

test("rémunérations : calcul, validation, paiement puis annulation", async ({ page }) => {
  await page.goto("/payroll?period=2026-10");
  await page.getByRole("button", { name: /Calculer les paies/ }).click();
  await expect(page.locator('p[role="status"]').first()).toBeVisible();
  await page.reload();
  // Après validation / paiement, la ligne change d'état (le formulaire laisse place à l'étape suivante)
  const payable = await formWith(page, "Payer").count();
  await formWith(page, "Valider").first().getByRole("button", { name: "Valider", exact: true }).click();
  await expect(formWith(page, "Payer")).toHaveCount(payable + 1);
  await formWith(page, "Payer").first().getByRole("button", { name: "Payer", exact: true }).click();
  await expect(formWith(page, "Payer")).toHaveCount(payable);
  await expect(page.getByText("Payée").first()).toBeVisible();
  expect(await confirm(page, page.getByRole("button", { name: "Annuler" }).first(), "Erreur de calcul")).toBeNull();
});

test("messages et notifications : préparation, envoi marqué, annulation, notifications traitées", async ({ page }) => {
  await page.goto("/messages");
  await page.goto((await page.getByRole("link", { name: "Préparer →" }).last().getAttribute("href"))!);
  await page.getByRole("button", { name: "Aperçu" }).click();
  await page.getByRole("button", { name: /Préparer|Enregistrer/ }).last().click();
  await expect(page).toHaveURL(/batch=/);
  const rows = page.locator('input[name="sel"]');
  const n = await rows.count();
  expect(n).toBeGreaterThan(0);
  await rows.first().check();
  expect(await confirm(page, page.getByRole("button", { name: "Marquer envoyés" }))).toBeNull();
  if (n > 1) {
    await page.locator('input[name="sel"]').first().check();
    expect(await confirm(page, page.getByRole("button", { name: "Annuler", exact: true }), "Plus d'actualité")).toBeNull();
  }

  await page.goto("/notifications");
  const sel = page.locator('input[name="sel"]');
  if (await sel.count()) {
    await sel.first().check();
    expect(await confirm(page, page.getByRole("button", { name: "Marquer traitées" }), "Vu avec la famille")).toBeNull();
  }
});

test("paramètres : centre, réduction, grille tarifaire, moyen de paiement, modèle, année, compte", async ({ page }) => {
  await page.goto("/settings");
  const center = formWith(page, "Enregistrer").first();
  await center.locator('input[name="email"]').fill("contact@vamos-academy.tn");
  await submitOk(center, "Enregistrer");
  await submitOk(formWith(page, "Générer les échéances").first(), "Générer les échéances");

  await page.goto("/settings/finance");
  const discount = page.locator("form").filter({ has: page.locator('input[name="percent"]') }).last();
  await discount.locator('input[name="name"]').fill(`Promo ${STAMP}`);
  await discount.locator('input[name="percent"]').fill("15");
  await submitOk(discount, "Ajouter");
  const fee = formWith(page, "Ajouter / remplacer");
  await fee.locator('select[name="subjectId"]').selectOption({ label: "Philosophie" });
  await fee.locator('input[name="monthlyFee"]').fill("33");
  await submitOk(fee, "Ajouter / remplacer");
  await page.reload();
  const feeRow = page.locator("tr", { hasText: "33,000 DT" }).filter({ has: page.getByRole("button", { name: "Retirer" }) });
  await expect(feeRow).toHaveCount(1);
  expect(await confirm(page, feeRow.getByRole("button", { name: "Retirer" }))).toBeNull();
  await expect(page.locator("tr", { hasText: "33,000 DT" })).toHaveCount(0);
  const mode = page.locator("form").filter({ has: page.locator('input[name="code"]') }).last();
  await mode.locator('input[name="code"]').fill(`M${STAMP}`);
  await mode.locator('input[name="label"]').fill(`Mode ${STAMP}`);
  await submitOk(mode, "Ajouter");

  await page.goto("/settings/templates");
  await submitOk(formWith(page, "Enregistrer").first(), "Enregistrer");

  await page.goto("/users");
  const user = formWith(page, "Créer le compte");
  await user.locator('input[name="fullName"]').fill(`Agent ${STAMP}`);
  await user.locator('input[name="email"]').fill(`agent${STAMP.toLowerCase()}@e2e.tn`);
  await user.locator('select[name="role"]').selectOption("LECTURE");
  await user.locator('input[name="password"]').fill("Provisoire2026abc");
  await submitOk(user, "Créer le compte");
  await page.reload();
  await page.getByRole("link", { name: `Modifier le compte de Agent ${STAMP}` }).click();
  const editUser = formWith(page, "Enregistrer");
  await editUser.locator('select[name="role"]').selectOption("COMPTABLE");
  await submitOk(editUser, "Enregistrer");
});
