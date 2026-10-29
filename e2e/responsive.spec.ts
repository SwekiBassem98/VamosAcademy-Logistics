import { expect, test, type Browser, type Page } from "@playwright/test";

/**
 * Refonte mobile-first : aucune page ne doit défiler horizontalement, de 320 px à 1440 px,
 * et les parcours essentiels doivent fonctionner au toucher sur téléphone.
 */
const ADMIN = { email: "admin@vamos-academy.tn", password: "E2eAdmin2026xyz" };
const DEMO_PWD = "Demo2026vamos";

test.describe.configure({ mode: "serial" });

async function login(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("E-mail", { exact: true }).fill(email);
  await page.getByLabel("Mot de passe", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Se connecter" }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"));
}

async function newPage(browser: Browser, width: number, height = 860) {
  const ctx = await browser.newContext({ viewport: { width, height }, locale: "fr-FR", timezoneId: "Africa/Tunis", hasTouch: width < 1024 });
  return ctx.newPage();
}

async function firstHref(page: Page, url: string, pattern: RegExp) {
  await page.goto(url);
  const hrefs = await page.locator("a[href]").evaluateAll((as) => as.map((a) => a.getAttribute("href") ?? ""));
  return hrefs.find((h) => pattern.test(h));
}

async function overflow(page: Page) {
  return page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
}

let routes: string[] = [];

test("toutes les pages : aucun défilement horizontal de 320 à 1440 px", async ({ browser }) => {
  test.setTimeout(600_000);
  const page = await newPage(browser, 390);
  await login(page, ADMIN.email, ADMIN.password);
  const student = await firstHref(page, "/students", /^\/students\/c[a-z0-9]{20,}$/);
  const teacher = await firstHref(page, "/teachers", /^\/teachers\/c[a-z0-9]{20,}$/);
  const group = await firstHref(page, "/academics", /^\/academics\/groups\/c[a-z0-9]{20,}$/);
  const receipt = await firstHref(page, "/payments", /^\/payments\/c[a-z0-9]{20,}$/);
  const expense = await firstHref(page, "/expenses", /^\/expenses\/c[a-z0-9]{20,}$/);
  const groupId = group?.split("/").pop();
  routes = [
    "/dashboard", "/students", "/students/new", "/guardians", "/teachers", "/academics", "/schedule", "/attendance", "/grades",
    "/payments", "/payments/new", "/unpaid", "/expenses", "/payroll", "/reports", "/notifications", "/messages", "/messages/new",
    "/documents", "/settings", "/settings/finance", "/settings/templates", "/users", "/audit", "/profile", "/search?q=Dém",
    ...(student ? [student, `${student}/fiche`, `${student}/bulletin`, `${student}/releve`, `/payments/new?student=${student.split("/").pop()}`] : []),
    ...(teacher ? [teacher] : []),
    ...(group ? [group, `/attendance?group=${groupId}`, `/grades?group=${groupId}`, `/documents/group-list?group=${groupId}`, `/documents/attendance-sheet?group=${groupId}`] : []),
    ...(receipt ? [receipt] : []),
    ...(expense ? [expense] : []),
  ];
  const cookies = await page.context().cookies();
  await page.context().close();

  const problems: string[] = [];
  const core = ["/dashboard", "/students", "/schedule", "/attendance", "/payments", "/unpaid", "/reports", ...(student ? [student] : [])];
  for (const width of [320, 360, 375, 390, 430, 768, 1024, 1280, 1440]) {
    const p = await newPage(browser, width);
    await p.context().addCookies(cookies);
    const list = width === 320 || width === 390 || width === 768 ? routes : core;
    for (const url of list) {
      await p.goto(url);
      await expect(p).not.toHaveURL(/\/login/);
      const o = await overflow(p);
      if (o > 0) problems.push(`${width}px ${url} : +${o}px`);
    }
    // Navigation adaptée : onglets en bas sous 1024 px, barre latérale au-delà
    if (width < 1024) await expect(p.getByRole("navigation", { name: "Navigation rapide" })).toBeVisible();
    else await expect(p.getByRole("navigation", { name: "Navigation principale" })).toBeVisible();
    await p.context().close();
  }
  expect(problems, problems.join("\n")).toEqual([]);
});

test("mobile : menu, recherche, dossier élève modifié dans une feuille", async ({ browser }) => {
  const page = await newPage(browser, 375, 812);
  await login(page, ADMIN.email, ADMIN.password);

  // Tous les modules accessibles au toucher via le menu
  await page.getByRole("button", { name: "Ouvrir le menu" }).click();
  const menu = page.getByRole("dialog", { name: "Menu" });
  await expect(menu).toBeVisible();
  for (const label of ["Élèves", "Parents", "Enseignants", "Paiements", "Dépenses", "Rapports", "Paramètres", "Utilisateurs", "Journal d'audit"]) {
    await expect(menu.getByRole("link", { name: label, exact: true })).toBeVisible();
  }
  await menu.getByRole("link", { name: "Élèves", exact: true }).click();
  await expect(page).toHaveURL(/\/students$/);
  await expect(menu).toBeHidden();

  // Recherche + filtres repliés
  await page.getByRole("searchbox", { name: "Rechercher un élève" }).fill("Testeur");
  await page.getByRole("button", { name: "Rechercher", exact: true }).click();
  await expect(page).toHaveURL(/q=Testeur/);
  await page.getByRole("button", { name: /Filtres/ }).click();
  await expect(page.getByLabel("Niveau")).toBeVisible();
  await page.getByRole("link", { name: "Testeur Yassine" }).click();
  await expect(page.getByRole("heading", { name: "Testeur Yassine" })).toBeVisible();
  expect(await overflow(page)).toBeLessThanOrEqual(0);

  // Modification du dossier : feuille plein écran, saisie conservée, confirmation
  await page.getByRole("button", { name: "Modifier", exact: true }).click();
  const sheet = page.getByRole("dialog", { name: "Modifier le dossier" });
  await expect(sheet).toBeVisible();
  const box = await sheet.boundingBox();
  expect(box!.width).toBeLessThanOrEqual(375);
  await sheet.getByLabel("Classe à l'école").fill("9e B");
  await sheet.getByRole("button", { name: "Enregistrer", exact: true }).click();
  await expect(sheet.locator('p[role="status"]')).toContainText("Fiche mise à jour");
  await page.keyboard.press("Escape");
  await expect(sheet).toBeHidden();
  await page.reload();
  await expect(page.getByText("9e B").first()).toBeVisible();

  // Dialogue de confirmation en feuille basse, fermé par Échap
  await page.getByRole("button", { name: "Archiver", exact: true }).click();
  const confirm = page.getByRole("dialog", { name: "Archiver ce dossier ?" });
  await expect(confirm).toBeVisible();
  const c = await confirm.boundingBox();
  expect(Math.round(c!.y + c!.height)).toBeGreaterThanOrEqual(811);
  await page.keyboard.press("Escape");
  await expect(confirm).toBeHidden();
  await page.context().close();
});

test("mobile : appel puis encaissement et solde restant", async ({ browser }) => {
  const page = await newPage(browser, 360, 780);
  await login(page, ADMIN.email, ADMIN.password);
  const group = await firstHref(page, "/academics?q=Maths 9e", /^\/academics\/groups\/c[a-z0-9]{20,}$/);
  await page.goto(`/attendance?group=${group!.split("/").pop()}&date=2026-10-27`);
  const row = page.locator("li", { hasText: "Testeur Yassine" });
  await row.getByText("Absent", { exact: true }).click();
  await row.getByLabel(/Motif pour Testeur Yassine/).fill("Malade");
  const save = page.getByRole("button", { name: /Enregistrer l'appel|Mettre à jour l'appel/ });
  await expect(save).toBeInViewport();
  await save.click();
  await expect(page.locator('p[role="status"]').first()).toBeVisible();

  await page.goto("/payments/new?q=Testeur");
  await page.getByRole("link", { name: "Sélectionner Testeur Yassine" }).click();
  await page.getByLabel("Montant (DT) *", { exact: true }).fill("5");
  await page.evaluate(() => { window.print = () => undefined; });
  await page.getByRole("button", { name: "Valider et imprimer le reçu" }).click();
  await expect(page.locator("article")).toContainText("REÇU DE PAIEMENT");
  await expect(page.locator("article tfoot")).toContainText("5,000 DT");
  expect(await overflow(page)).toBeLessThanOrEqual(0);
  await page.context().close();
});

test("chaque rôle : onglets mobiles adaptés et pages interdites refusées", async ({ browser }) => {
  const cases: [string, string, string[], string[], string][] = [
    // e-mail, mot de passe, onglets attendus, onglets absents, page interdite
    [ADMIN.email, ADMIN.password, ["Accueil", "Élèves", "Appels", "Caisse"], [], "/nope-404"],
    [`responsable@demo.vamos-academy.tn`, DEMO_PWD, ["Accueil", "Élèves", "Appels", "Caisse"], [], "/settings"],
    [`comptable@demo.vamos-academy.tn`, DEMO_PWD, ["Accueil", "Caisse", "Impayés", "Dépenses"], ["Appels"], "/attendance"],
    [`enseignant@demo.vamos-academy.tn`, DEMO_PWD, ["Accueil", "Appels", "Notes", "Agenda"], ["Caisse"], "/payments"],
    [`lecture@demo.vamos-academy.tn`, DEMO_PWD, ["Accueil", "Élèves", "Agenda", "Appels"], ["Caisse"], "/students/new"],
  ];
  for (const [email, pwd, tabs, absent, forbidden] of cases) {
    const page = await newPage(browser, 390);
    await login(page, email, pwd);
    const nav = page.getByRole("navigation", { name: "Navigation rapide" });
    for (const t of tabs) await expect(nav.getByRole("link", { name: t, exact: true }), `${email} : ${t}`).toBeVisible();
    for (const t of absent) await expect(nav.getByRole("link", { name: t, exact: true }), `${email} : ${t}`).toHaveCount(0);
    if (forbidden !== "/nope-404") {
      await page.goto(forbidden);
      await expect(page.getByText("Accès refusé")).toBeVisible();
    }
    await page.context().close();
  }
});
