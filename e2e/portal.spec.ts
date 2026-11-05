import { expect, test, type Page } from "@playwright/test";

/** Connexion sans écran vide, portail parent, reçu de rémunération, tarifs et suppressions (build de production). */
const ADMIN = { email: "admin@vamos-academy.tn", password: "E2eAdmin2026xyz" };
const PARENT = { email: "parent@demo.vamos-academy.tn", password: "Demo2026vamos" };

test.use({ viewport: { width: 1280, height: 900 } });
test.describe.configure({ mode: "serial" });

async function login(page: Page, { email, password }: { email: string; password: string }) {
  await page.goto("/login");
  await page.getByLabel("E-mail", { exact: true }).fill(email);
  await page.getByLabel("Mot de passe", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Se connecter" }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"));
}

test("après connexion, la page s'affiche sans rafraîchissement", async ({ page }) => {
  await login(page, ADMIN);
  await expect(page).toHaveURL(/\/dashboard/);
  await expect(page.getByRole("heading", { name: /Bonjour|Bonsoir/ })).toBeVisible({ timeout: 5000 });
  await expect(page.getByRole("navigation").first()).toBeVisible();
});

test("premier login d'un compte au mot de passe provisoire : le profil s'affiche sans rafraîchir", async ({ page }) => {
  await login(page, { email: "provisoire@e2e.tn", password: "Provisoire2026e2e" });
  await expect(page).toHaveURL(/\/profile/);
  await expect(page.getByLabel("Mot de passe actuel", { exact: true })).toBeVisible({ timeout: 5000 });
});

test("portail parent : ses enfants uniquement, aucune page du personnel", async ({ page }) => {
  await login(page, PARENT);
  await expect(page).toHaveURL(/\/parent$/);
  await expect(page.getByRole("heading", { name: "Mes enfants" })).toBeVisible();
  await expect(page.getByRole("link", { name: /Amine Démo-Trabelsi/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /Yasmine Démo-Trabelsi/ })).toBeVisible();
  await expect(page.getByText("Démo-Gharbi")).toHaveCount(0);
  await expect(page.getByRole("searchbox")).toHaveCount(0);

  await page.getByRole("link", { name: /Amine Démo-Trabelsi/ }).click();
  await expect(page.getByRole("heading", { name: "Emploi du temps" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Paiements et reçus" })).toBeVisible();
  const receipt = page.getByRole("link", { name: /Télécharger le reçu/ }).first();
  const response = await page.request.get((await receipt.getAttribute("href"))!);
  expect(response.status()).toBe(200);
  expect(response.headers()["content-type"]).toContain("application/pdf");

  for (const path of ["/dashboard", "/students", "/payments", "/search?q=Démo", "/classes", "/documents", "/notifications", "/users"]) {
    await page.goto(path);
    await expect(page, path).toHaveURL(/\/parent$/);
  }
  expect((await page.request.get("/api/export/payments")).status()).toBe(403);
  expect((await page.goto("/parent/inconnu"))?.status()).toBe(404);
});

test("reçu de rémunération : s'ouvre et s'imprime après le paiement", async ({ page }) => {
  await page.addInitScript(() => { (window as unknown as { __printed: number }).__printed = 0; window.print = () => { (window as unknown as { __printed: number }).__printed++; }; });
  await login(page, ADMIN);
  await page.goto("/payroll?period=2026-10");
  await page.getByRole("button", { name: /Calculer les paies/ }).click();
  const validate = page.getByRole("button", { name: "Valider", exact: true }).first();
  await expect(validate).toBeVisible();
  await validate.click();
  const payNow = page.getByRole("button", { name: "Payer", exact: true }).first();
  await expect(payNow).toBeVisible();
  await payNow.click();
  await page.waitForURL(/\/payroll\/[a-z0-9]+\?print=1/);
  await expect(page.getByText("Reçu de rémunération", { exact: true })).toBeVisible();
  await expect(page.getByText(/P-2026-\d{6}/).first()).toBeVisible();
  await expect.poll(() => page.evaluate(() => (window as unknown as { __printed: number }).__printed)).toBe(1);
  const pdf = await page.request.get(`${new URL(page.url()).pathname.replace("/payroll/", "/api/payroll/")}/pdf`);
  expect(pdf.headers()["content-type"]).toContain("application/pdf");
});

test("tarifs : page dédiée et aperçu du prix avec réduction à l'inscription", async ({ page }) => {
  await login(page, ADMIN);
  await page.goto("/tarifs");
  await expect(page.getByRole("heading", { name: "Tarifs & réductions" })).toBeVisible();
  await expect(page.getByText("2. Tarifs des groupes")).toBeVisible();
  await page.goto("/students?q=Malek");
  await page.getByRole("link", { name: /Malek/ }).first().click();
  const form = page.locator("form").filter({ hasText: "Nouvelle inscription" });
  const group = form.locator('select[name="groupId"]');
  await group.selectOption({ index: 1 });
  const preview = form.getByTestId("enroll-preview");
  await expect(preview).toContainText("Mensualité à payer");
  await form.locator('select[name="discountTypeId"]').selectOption({ index: 1 });
  await expect(preview).toContainText(/−\d+ %/);
  await expect(preview).toContainText("Total de l'année");
});

test("suppressions : fenêtre de confirmation, annulation possible, puis effacement", async ({ page }) => {
  await login(page, ADMIN);
  await page.goto("/students?q=Malek");
  await page.getByRole("link", { name: /Malek/ }).first().click();
  await page.getByRole("button", { name: "Supprimer", exact: true }).click();
  const dialog = page.locator("dialog[open]");
  await expect(dialog).toContainText("irréversible");
  await dialog.getByRole("button", { name: "Annuler" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole("heading", { name: /Malek/ })).toBeVisible(); // rien n'a été effacé

  await page.getByRole("button", { name: "Supprimer", exact: true }).click();
  await page.locator("dialog[open]").locator('input[name="reason"]').fill("test de suppression");
  await page.locator("dialog[open]").getByRole("button", { name: "Supprimer définitivement" }).click();
  await page.waitForURL(/\/students$/);
  await page.goto("/students?q=Malek");
  await expect(page.getByRole("link", { name: /Malek/ })).toHaveCount(0);

  await page.goto("/teachers");
  await page.getByRole("link", { name: /Anglais/ }).first().click();
  await page.waitForURL(/\/teachers\/.+/);
  await page.getByRole("button", { name: "Supprimer", exact: true }).click();
  await page.locator("dialog[open]").locator('input[name="reason"]').fill("test de suppression");
  await page.locator("dialog[open]").getByRole("button", { name: "Supprimer définitivement" }).click();
  await page.waitForURL(/\/teachers$/);

  await page.goto("/users");
  const created = page.locator("form").filter({ has: page.getByRole("button", { name: "Créer le compte", exact: true }) });
  await created.locator('input[name="fullName"]').fill("Compte Temporaire");
  await created.locator('input[name="email"]').fill("temporaire@e2e.tn");
  await created.locator('select[name="role"]').selectOption("COMPTABLE");
  await created.locator('input[name="password"]').fill("Provisoire2026abc");
  await created.getByRole("button", { name: "Créer le compte", exact: true }).click();
  const del = page.getByRole("button", { name: /Supprimer le compte de Compte Temporaire/ });
  await del.click();
  await page.locator("dialog[open]").getByRole("button", { name: "Supprimer le compte" }).click();
  await expect(del).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Supprimer le compte de Administrateur/ })).toHaveCount(0); // son propre compte
});
