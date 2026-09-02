import { expect, test, type Browser, type Page } from "@playwright/test";
import {
  codeUnique,
  contenu,
  creerBoutique,
  emailUnique,
  seConnecter,
  seConnecterEtEntrer,
  selecteurPerimetre,
} from "./aide";

/**
 * Les trois espaces (S3bis).
 *
 * Ce que ces tests protègent réellement : qu'une personne ne voie que l'espace
 * de son métier. Le reste — l'ordre des onglets, le libellé d'un titre — se
 * rattrape ; un gérant de boutique motos qui suit un onglet « Pièces » vers un
 * écran vide conclut que l'application est cassée, et un gérant qui atteindrait
 * la supervision lirait des chiffres qui ne le regardent pas.
 *
 * La garde vérifiée ici décide de ce qu'on **affiche**. Le cloisonnement réel
 * est prouvé par les tests de règles (`regles/boutiques.test.ts`), pas par ceux
 * du navigateur.
 */

const nav = (page: Page) => page.getByRole("navigation", { name: "Navigation principale" });

/** Crée un gérant rattaché à une boutique, et ouvre sa session. */
async function ouvrirSessionGerant(
  page: Page,
  browser: Browser,
  code: string,
  prefixe: string,
): Promise<Page> {
  await page.goto("/parametres/utilisateurs", { waitUntil: "load" });
  const email = emailUnique(prefixe);
  const motDePasse = `gerant-${prefixe}-0001`;
  const creation = page.locator("form").filter({
    has: page.getByRole("button", { name: /Créer le compte/ }),
  });
  await creation.getByLabel("Nom", { exact: true }).fill(`Gérant ${prefixe}`);
  await creation.getByLabel("Adresse e-mail").fill(email);
  await creation.getByLabel("Mot de passe provisoire").fill(motDePasse);
  await creation.getByLabel("Boutique").selectOption(code);
  await creation.getByRole("button", { name: /Créer le compte/ }).click();

  /* On attend la confirmation de la fonction, pas la ligne dans la liste des
     comptes. Quand la file d'écritures est encombrée, le SDK sert un cache où
     `users` n'a jamais été chargé, et une collection jamais vue revient vide
     plutôt qu'en attente : la liste ment, la confirmation non. C'est le remède
     retenu en S8 pour ce même piège (`DECISIONS.md` D55, et D50 pour la cause). */
  await expect(contenu(page).getByRole("status")).toContainText("Compte créé", {
    timeout: 20_000,
  });

  const contexte = await browser.newContext();
  const pageGerant = await contexte.newPage();
  await seConnecter(pageGerant, email, motDePasse);
  await pageGerant.waitForURL("**/dashboard");
  return pageGerant;
}

test.describe("le gérant ne voit que l'espace de sa boutique", () => {
  test("une boutique motos n'ouvre ni l'espace pièces ni la supervision", async ({
    page,
    browser,
  }) => {
    await seConnecterEtEntrer(page);
    const code = codeUnique();
    await creerBoutique(page, code, ["Motos"]);
    const pageGerant = await ouvrirSessionGerant(page, browser, code, "motos");

    await expect(nav(pageGerant).getByRole("link", { name: "Motos" })).toBeVisible();
    await expect(nav(pageGerant).getByRole("link", { name: "Pièces" })).toHaveCount(0);
    await expect(
      contenu(pageGerant).getByRole("link", { name: /Pièces détachées/ }),
    ).toHaveCount(0);

    // Le lien tapé à la main est refusé, et le refus s'explique.
    await pageGerant.goto("/pieces", { waitUntil: "load" });
    await expect(contenu(pageGerant)).toContainText("Pas dans cette boutique");
    await expect(contenu(pageGerant)).toContainText("ne vend pas de pièces détachées");

    /* La supervision se vérifie sur ce gérant-là plutôt que sur un troisième
       compte : elle ne dépend pas du métier de sa boutique, et créer un compte
       est la seule opération de l'application qui exige le réseau (D55). */
    await expect(nav(pageGerant).getByRole("link", { name: "Supervision" })).toHaveCount(0);
    await pageGerant.goto("/supervision", { waitUntil: "load" });
    await expect(contenu(pageGerant)).toContainText("Réservé au responsable");

    await pageGerant.context().close();
  });

  test("une boutique pièces n'ouvre pas l'espace motos", async ({ page, browser }) => {
    await seConnecterEtEntrer(page);
    const code = codeUnique();
    await creerBoutique(page, code, ["Pièces détachées"]);
    const pageGerant = await ouvrirSessionGerant(page, browser, code, "pieces");

    await expect(nav(pageGerant).getByRole("link", { name: "Pièces" })).toBeVisible();
    await expect(nav(pageGerant).getByRole("link", { name: "Motos" })).toHaveCount(0);

    await pageGerant.goto("/motos", { waitUntil: "load" });
    await expect(contenu(pageGerant)).toContainText("Pas dans cette boutique");
    await expect(contenu(pageGerant)).toContainText("ne vend pas de motos");

    await pageGerant.context().close();
  });

});

test.describe("le responsable passe d'un espace à l'autre", () => {
  test("changer de boutique change les espaces disponibles", async ({ page }) => {
    await seConnecterEtEntrer(page);
    const codeMotos = codeUnique();
    const codePieces = codeUnique();
    await creerBoutique(page, codeMotos, ["Motos"]);
    await creerBoutique(page, codePieces, ["Pièces détachées"]);

    /* Toutes boutiques : les deux espaces sont sous la main, puisqu'il en existe
       de chaque métier. */
    await selecteurPerimetre(page).selectOption("");
    await expect(nav(page).getByRole("link", { name: "Motos" })).toBeVisible();
    await expect(nav(page).getByRole("link", { name: "Pièces" })).toBeVisible();

    /* On attend d'abord le bandeau : il prouve que le périmètre a basculé. Sans
       cette ancre, l'absence de l'onglet passerait aussi pendant le chargement,
       c'est-à-dire pour la mauvaise raison. */
    await selecteurPerimetre(page).selectOption(codeMotos);
    await expect(page.getByRole("banner")).toContainText(`Boutique ${codeMotos}`);
    await expect(nav(page).getByRole("link", { name: "Motos" })).toBeVisible();
    await expect(nav(page).getByRole("link", { name: "Pièces" })).toHaveCount(0);

    await selecteurPerimetre(page).selectOption(codePieces);
    await expect(page.getByRole("banner")).toContainText(`Boutique ${codePieces}`);
    await expect(nav(page).getByRole("link", { name: "Pièces" })).toBeVisible();
    await expect(nav(page).getByRole("link", { name: "Motos" })).toHaveCount(0);
  });

  test("la supervision ouvre une boutique sur son propre espace", async ({ page }) => {
    await seConnecterEtEntrer(page);
    const code = codeUnique();
    await creerBoutique(page, code, ["Pièces détachées"]);

    await page.goto("/supervision", { waitUntil: "load" });
    const boutiques = page.getByRole("navigation", { name: "Boutiques" });
    await boutiques.getByRole("link", { name: new RegExp(code) }).click();

    await page.waitForURL("**/pieces");
    // Le périmètre a suivi : la saisie ira dans cette boutique-là.
    await expect(selecteurPerimetre(page)).toHaveValue(code);
  });

  test("la supervision ramène à l’entreprise entière, sans passer par le bandeau", async ({
    page,
  }) => {
    await seConnecterEtEntrer(page);
    const code = codeUnique();
    await creerBoutique(page, code, ["Motos"]);

    // On se met d’abord dans une boutique : c’est l’état d’où l’on veut ressortir.
    await selecteurPerimetre(page).selectOption(code);
    await expect(page.getByRole("banner")).toContainText(`Boutique ${code}`);

    await page.goto("/supervision", { waitUntil: "load" });
    await page
      .getByRole("navigation", { name: "Boutiques" })
      .getByRole("link", { name: /Toutes les boutiques/ })
      .click();

    await page.waitForURL("**/motos");
    await expect(selecteurPerimetre(page)).toHaveValue("");
    await expect(page.getByRole("banner")).toContainText("Toutes les boutiques");
  });
});
