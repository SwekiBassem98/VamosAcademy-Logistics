import { expect, test, type Page } from "@playwright/test";

const ADMIN = { email: "admin@vamos-academy.tn", password: "E2eAdmin2026xyz" };

async function login(page: Page, email: string, password: string, expectSuccess = true) {
  await page.goto("/login");
  await page.getByLabel("E-mail", { exact: true }).fill(email);
  await page.getByLabel("Mot de passe", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Se connecter" }).click();
  if (expectSuccess) await page.waitForURL((u) => !u.pathname.startsWith("/login"));
}

test.describe.configure({ mode: "serial" });

test("connexion : erreur claire puis accès au tableau de bord", async ({ page }) => {
  await login(page, ADMIN.email, "mauvais-mot-de-passe", false);
  await expect(page.locator('p[role="alert"]')).toContainText("E-mail ou mot de passe incorrect");
  await page.getByLabel("Mot de passe", { exact: true }).fill(ADMIN.password);
  await page.getByRole("button", { name: "Se connecter" }).click();
  await expect(page).toHaveURL(/\/dashboard/);
  await expect(page.getByRole("heading", { name: /Bonjour|Bonsoir/ })).toBeVisible();
  await expect(page.getByText("Données de démonstration présentes")).toBeVisible();
});

test("parcours complet : inscription, groupe, présence, paiement partiel, reçu, correction", async ({ page }) => {
  await login(page, ADMIN.email, ADMIN.password);
  await expect(page).toHaveURL(/\/dashboard/);

  // 1. Inscrire un élève
  await page.goto("/students/new");
  await page.getByLabel("Nom *", { exact: true }).fill("Testeur");
  await page.getByLabel("Prénom *", { exact: true }).fill("Yassine");
  await page.getByLabel("Date de naissance", { exact: true }).fill("2012-04-02");
  await page.locator('select[name="levelId"]').selectOption({ label: "Collège — 9e année de base" });
  await page.locator('input[name="parent_lastName"]').fill("Testeur");
  await page.locator('input[name="parent_firstName"]').fill("Hedi");
  await page.locator('input[name="parent_phone"]').fill("97123456");
  await page.getByRole("button", { name: "Créer le dossier" }).click();
  await expect(page.locator('p[role="status"]').first()).toContainText("Dossier créé avec le matricule VA-2026-");
  const studentUrl = page.url().split("?")[0];

  // 2. L'affecter à un groupe (et donc à son enseignant), échéancier mensuel
  const groupValue = await page.locator('select[name="groupId"] option', { hasText: "Maths 9e — G1" }).first().getAttribute("value");
  await page.locator('select[name="groupId"]').selectOption(groupValue!);
  await page.locator('input[name="startDate"]').fill("2026-10-01");
  await page.getByRole("button", { name: "Inscrire", exact: true }).click();
  await expect(page.getByText("Inscription enregistrée et échéancier généré.")).toBeVisible();
  await expect(page.getByRole("cell", { name: "Maths 9e — G1" }).first()).toBeVisible();

  // 3. Enregistrer sa présence (absence justifiée)
  await page.goto("/attendance");
  await page.locator('select[name="group"]').selectOption({ label: "Maths 9e — G1" });
  await page.locator('input[name="date"]').fill("2026-10-28");
  await page.getByRole("button", { name: "Ouvrir" }).click();
  const row = page.locator("li", { hasText: "Testeur Yassine" });
  await row.getByText("Excusé", { exact: true }).click();
  await row.getByLabel(/Motif pour Testeur Yassine/).fill("Rendez-vous médical");
  await page.getByRole("button", { name: /Enregistrer l'appel|Mettre à jour l'appel/ }).click();
  await expect(page.locator('p[role="status"]').first()).toContainText("excusé(s)");

  // 4. Paiement partiel
  await page.goto(`${studentUrl.replace(/\/students\//, "/payments/new?student=")}`);
  await page.getByLabel("Montant (DT) *", { exact: true }).fill("20");
  await page.evaluate(() => { window.print = () => undefined; });
  await page.getByRole("button", { name: "Valider et imprimer le reçu" }).click();
  await expect(page).toHaveURL(/\/payments\/[a-z0-9]+/);
  await expect(page.locator("article")).toContainText("REÇU DE PAIEMENT");
  await expect(page.locator("article tfoot")).toContainText("20,000 DT");
  const receiptNo = (await page.locator("article").getByText(/^R-2026-\d{6}$/).textContent())!;

  // 5. Reçu PDF téléchargeable et solde restant
  const pdf = await page.request.get(page.url().replace("/payments/", "/api/receipts/").split("?")[0] + "/pdf");
  expect(pdf.status()).toBe(200);
  expect(pdf.headers()["content-type"]).toBe("application/pdf");
  await page.goto(studentUrl);
  await expect(page.getByText("Déjà payé")).toBeVisible();
  await expect(page.locator("text=20,000 DT").first()).toBeVisible();

  // 7. Correction tracée du paiement
  await page.goto(page.url().replace(/\/students\/.*/, "/payments"));
  await page.getByRole("link", { name: receiptNo }).click();
  await page.getByLabel("Montant (DT) *", { exact: true }).fill("25");
  await page.getByLabel("Motif de la correction *", { exact: true }).fill("Montant réellement versé : 25 DT");
  await page.getByRole("button", { name: "Émettre le reçu corrigé" }).click();
  await expect(page.locator("article")).toContainText(`Ce reçu corrige et remplace le reçu ${receiptNo}.`);
  await expect(page.locator("article tfoot")).toContainText("25,000 DT");

  // 6. Statistiques financières du mois
  await page.goto("/reports?month=2026-10");
  await expect(page.getByRole("heading", { name: "Rapports financiers" })).toBeVisible();
  await expect(page.getByText("Encaissé").first()).toBeVisible();
});

test("8. un enseignant ne peut ni voir ni ouvrir les finances", async ({ page }) => {
  await login(page, "enseignant@demo.vamos-academy.tn", "Demo2026vamos");
  await expect(page).toHaveURL(/\/dashboard/);
  const nav = page.getByRole("navigation", { name: "Navigation principale" });
  await expect(nav.getByRole("link", { name: "Paiements" })).toHaveCount(0);
  for (const url of ["/payments", "/expenses", "/reports", "/payroll", "/settings"]) {
    await page.goto(url);
    await expect(page.getByText("Accès refusé")).toBeVisible();
  }
  const res = await page.request.get("/api/export/payments?format=xlsx");
  expect(res.status()).toBe(403);
});

test("premier login : changement de mot de passe obligatoire", async ({ page }) => {
  await login(page, "nouveau@e2e.tn", "Provisoire2026e2e");
  await expect(page).toHaveURL(/\/profile/);
  await page.goto("/students");
  await expect(page).toHaveURL(/\/profile/);
  await expect(page.locator('p[role="alert"]')).toContainText("vous devez choisir un nouveau mot de passe");
  await page.getByLabel("Mot de passe actuel", { exact: true }).fill("Provisoire2026e2e");
  await page.getByLabel("Nouveau mot de passe", { exact: true }).fill("Personnel2026abc");
  await page.getByLabel("Confirmer", { exact: true }).fill("Personnel2026abc");
  await page.getByRole("button", { name: "Mettre à jour" }).click();
  await expect(page.locator('p[role="status"]').first()).toContainText("Mot de passe modifié");
  await page.goto("/students");
  await expect(page).toHaveURL(/\/students/);
  await expect(page.getByRole("heading", { name: "Élèves" })).toBeVisible();
});

test("affichage mobile sans débordement horizontal", async ({ browser }) => {
  const page = await browser.newPage({ viewport: { width: 375, height: 812 } });
  await login(page, ADMIN.email, ADMIN.password);
  for (const url of ["/dashboard", "/students", "/payments", "/unpaid"]) {
    await page.goto(url);
    await expect(page).toHaveURL(new RegExp(url)); // bien connecté, pas renvoyé vers la connexion
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, url).toBeLessThanOrEqual(0);
  }
  await page.getByRole("button", { name: "Ouvrir le menu" }).click();
  await expect(page.getByRole("dialog", { name: "Menu" })).toBeVisible();
  await page.close();
});

test("dépense : photo de justificatif allégée avant l'envoi, stockée en base et consultable", async ({ page }) => {
  await login(page, ADMIN.email, ADMIN.password);
  await page.goto("/expenses");
  // Photo « de téléphone » trop lourde pour un envoi (PNG de bruit 2400 × 2400, > 4 Mo)
  const photo = await page.evaluate(() => {
    const c = document.createElement("canvas");
    c.width = c.height = 2400;
    const ctx = c.getContext("2d")!;
    const img = ctx.createImageData(2400, 2400);
    for (let i = 0; i < img.data.length; i++) img.data[i] = i % 4 === 3 ? 255 : Math.random() * 255;
    ctx.putImageData(img, 0, 0);
    return c.toDataURL("image/png").split(",")[1];
  });
  const big = Buffer.from(photo, "base64");
  expect(big.length).toBeGreaterThan(4 * 1024 * 1024);

  await page.getByRole("button", { name: "Nouvelle dépense" }).click();
  const sheet = page.getByRole("dialog", { name: "Nouvelle dépense" });
  await sheet.getByLabel("Catégorie *").selectOption({ index: 1 });
  await sheet.getByLabel("Libellé *").fill("Ramettes de papier E2E");
  await sheet.getByLabel("Montant (DT) *").fill("23,500");

  // Un PDF trop lourd est refusé avant l'envoi, sans perdre la saisie
  await sheet.getByLabel(/Justificatifs/).setInputFiles({ name: "gros.pdf", mimeType: "application/pdf", buffer: Buffer.concat([Buffer.from("%PDF-1.4\n"), Buffer.alloc(5 * 1024 * 1024)]) });
  await sheet.getByRole("button", { name: "Enregistrer la dépense" }).click();
  await expect(sheet.locator('p[role="alert"]')).toContainText("4 Mo au total");
  await expect(sheet.getByLabel("Libellé *")).toHaveValue("Ramettes de papier E2E");

  await sheet.getByLabel(/Justificatifs/).setInputFiles({ name: "ticket.png", mimeType: "image/png", buffer: big });
  await sheet.getByRole("button", { name: "Enregistrer la dépense" }).click();
  await expect(sheet.getByRole("status")).toContainText("Dépense enregistrée avec justificatif");

  await page.goto("/expenses");
  await page.getByRole("link", { name: "Ramettes de papier E2E" }).first().click();
  const link = page.getByRole("link", { name: "ticket.jpg" });
  await expect(link).toBeVisible();
  const res = await page.request.get((await link.getAttribute("href"))!);
  expect(res.status()).toBe(200);
  expect(res.headers()["content-type"]).toBe("image/jpeg");
  const body = await res.body();
  expect(body.length).toBeLessThan(4 * 1024 * 1024);
  expect(body.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))).toBe(true);
});
