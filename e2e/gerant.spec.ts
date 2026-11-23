import { expect, test, type Browser, type Page } from "@playwright/test";
import {
  attendreLaFileVide,
  codeUnique,
  contenu,
  creerBoutique,
  emailUnique,
  encaisser,
  messageErreur,
  messageSucces,
  seConnecter,
  seConnecterEtEntrer,
  vendre,
} from "./aide";

/**
 * Ce que le gérant trouve de lui-même (15 novembre 2026) : ses dépenses depuis
 * son accueil, et son propre mot de passe derrière « Paramètres ».
 *
 * Deux remarques du commanditaire. « Dépenses n'est présent que chez le
 * superviseur, ajoute au niveau des boutiques » : l'écran était ouvert au
 * gérant, mais rangé sous Caisse. Et « permets au superviseur de changer son
 * mot de passe », ouvert ensuite à chaque compte.
 */

type Gerant = { email: string; motDePasse: string };

/**
 * Le responsable crée le gérant d'une boutique, par l'écran des utilisateurs —
 * celle qu'on lui donne, ou une neuve.
 */
async function creerGerant(page: Page, boutique?: string): Promise<Gerant> {
  const code = boutique ?? codeUnique();
  if (!boutique) await creerBoutique(page, code, ["Motos"]);

  await page.goto("/parametres/utilisateurs", { waitUntil: "load" });
  const gerant = { email: emailUnique("compte"), motDePasse: "gerant-compte-001" };
  await page.getByRole("button", { name: "Créer un compte" }).click();
  const creation = page.getByRole("dialog");
  await creation.getByLabel("Nom", { exact: true }).fill("Gérant du compte");
  await creation.getByLabel("Adresse e-mail").fill(gerant.email);
  await creation.getByLabel("Mot de passe provisoire").fill(gerant.motDePasse);
  await creation.getByLabel("Boutique").selectOption(code);
  await creation.getByRole("button", { name: /Créer le compte/ }).click();
  await expect(contenu(page).getByRole("status")).toContainText("Compte créé", {
    timeout: 30_000,
  });
  await attendreLaFileVide(page);
  return gerant;
}

/** Un second navigateur : celui du gérant, sur son propre appareil. */
async function sessionDuGerant(browser: Browser, gerant: Gerant): Promise<Page> {
  const pageGerant = await (await browser.newContext()).newPage();
  await seConnecter(pageGerant, gerant.email, gerant.motDePasse);
  await pageGerant.waitForURL("**/dashboard");
  return pageGerant;
}

test("le gérant trouve ses dépenses sur son accueil", async ({ page, browser }) => {
  await seConnecterEtEntrer(page);
  const pageGerant = await sessionDuGerant(browser, await creerGerant(page));

  await contenu(pageGerant).getByRole("link", { name: "Enregistrer une dépense" }).click();
  await pageGerant.waitForURL("**/caisse/depenses");
  await expect(pageGerant.getByRole("heading", { name: "Dépenses", level: 1 })).toBeVisible();

  /* Et dans la barre des écrans de l'accueil, au doigt. */
  await pageGerant.goto("/dashboard", { waitUntil: "load" });
  await pageGerant.getByRole("button", { name: /^Écrans de l’espace Accueil/ }).click();
  await pageGerant
    .getByRole("dialog", { name: "Accueil" })
    .getByRole("link", { name: "Dépenses" })
    .click();
  await pageGerant.waitForURL("**/caisse/depenses");
});

test("le gérant change son mot de passe, et seul le nouveau ouvre la session", async ({
  page,
  browser,
}) => {
  await seConnecterEtEntrer(page);
  const gerant = await creerGerant(page);
  const pageGerant = await sessionDuGerant(browser, gerant);

  /* « Paramètres » menait le gérant à « Réservé au responsable » ; il mène
     désormais à son mot de passe, au doigt et sans adresse tapée. */
  await pageGerant
    .getByRole("navigation", { name: "Navigation principale" })
    .getByRole("link", { name: "Paramètres" })
    .click();
  await pageGerant.waitForURL("**/parametres/mot-de-passe");

  const nouveau = "nouveau-gerant-2026";
  const remplir = async (actuel: string) => {
    await pageGerant.getByLabel("Mot de passe actuel", { exact: true }).fill(actuel);
    await pageGerant.getByLabel("Nouveau mot de passe", { exact: true }).fill(nouveau);
    await pageGerant.getByLabel("Confirmer le nouveau mot de passe", { exact: true }).fill(nouveau);
    await pageGerant.getByRole("button", { name: "Changer le mot de passe" }).click();
  };

  await remplir("pas-le-bon-du-tout");
  await expect(messageErreur(pageGerant)).toContainText("actuel est incorrect");

  await remplir(gerant.motDePasse);
  await expect(messageSucces(pageGerant)).toContainText("Mot de passe changé");

  /* Sur un autre appareil : l'ancien ne rouvre plus rien, le nouveau si. */
  const ailleurs = await (await browser.newContext()).newPage();
  await seConnecter(ailleurs, gerant.email, gerant.motDePasse);
  await expect(ailleurs.getByText("Adresse e-mail ou mot de passe incorrect")).toBeVisible();
  await seConnecter(ailleurs, gerant.email, nouveau);
  await ailleurs.waitForURL("**/dashboard");
});

/* « Vérifie si les encaissements passent pour les boutiques : il essaye de le
   faire mais ça passe pas » (23 novembre 2026). Les tests des versements
   tournaient tous sous le responsable, dont la règle ne regarde pas le
   document : chez le gérant, la fiche de la vente ne lisait pas ses
   versements, et le formulaire d'encaissement ne s'ouvrait jamais. */
test("le gérant encaisse un versement sur une vente à crédit de sa boutique", async ({
  page,
  browser,
}) => {
  await seConnecterEtEntrer(page);
  const { terrain, numero } = await vendre(page, {
    mode: "Crédit",
    prix: "1200000",
    encaisse: "400000",
  });
  const ficheDeLaVente = page.url();
  await attendreLaFileVide(page);

  const pageGerant = await sessionDuGerant(browser, await creerGerant(page, terrain.code));
  await pageGerant.goto(ficheDeLaVente, { waitUntil: "load" });
  await expect(contenu(pageGerant)).toContainText("800 000 FCFA", { timeout: 20_000 });

  await encaisser(pageGerant, "300000");
  const confirmation = contenu(pageGerant).getByRole("status");
  await expect(confirmation).toContainText("Versement enregistré", { timeout: 20_000 });
  /* `vendre` rend le numéro tel que l'écran le montre (« n° 0001 ») ; le reçu
     porte le numéro entier. Le rang 2 suit le versement du jour de la vente. */
  await expect(confirmation.locator(".plaque-code")).toHaveText(
    new RegExp(`${numero.replace(/\D/g, "")}/V2$`),
  );
  await expect(contenu(pageGerant)).toContainText("500 000 FCFA");

  /* Parvenu au serveur, et sans refus : c'est là que le lot tombait. */
  await attendreLaFileVide(pageGerant);
  /* La zone d'erreur existe toujours, vide : c'est un texte qu'on guette. */
  await expect(contenu(pageGerant).getByRole("alert").filter({ hasText: /\S/ })).toHaveCount(0);
});
