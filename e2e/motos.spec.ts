import { expect, test } from "@playwright/test";
import {
  bandeauEtat,
  contenu,
  emailUnique,
  prendreLaMainEtMettreEnCache,
  preparerTerrain,
  saisirMoto,
  seConnecter,
  seConnecterEtEntrer,
  selecteurPerimetre,
} from "./aide";

/**
 * Stock motos (S5).
 *
 * Deux choses à protéger, et elles ne se ressemblent pas. La première est une
 * promesse : la saisie et la recherche marchent sans réseau — c'est la raison
 * d'être du produit. La seconde est une frontière : le gérant écrit le coût
 * d'une moto et ne peut jamais le relire.
 */

test.describe("entrée en stock", () => {
  test("une moto saisie apparaît dans le stock, coût total calculé à la frappe", async ({
    page,
  }) => {
    await seConnecterEtEntrer(page);
    const terrain = await preparerTerrain(page);

    await page.goto("/motos/nouvelle", { waitUntil: "load" });
    await page.getByLabel("Marque").selectOption({ label: terrain.marque });
    await page.getByLabel("Modèle").selectOption({ label: terrain.modele });
    await page.getByLabel("Numéro de châssis").fill("lc6p cj1a 0000001");
    await page.getByLabel("Provenance").selectOption({ label: terrain.provenance });
    await page.getByLabel("Prix d’achat").fill("850000");

    // Le total se met à jour pendant la saisie : c'est le seul moment où le
    // gérant le verra.
    await expect(page.getByText("850 000 FCFA")).toBeVisible();

    await page.getByRole("button", { name: "Faire entrer en stock" }).click();
    await expect(contenu(page).getByRole("status")).toContainText("LC6PCJ1A0000001", {
      timeout: 20_000,
    });

    await page.goto("/motos", { waitUntil: "load" });
    await expect(page.getByRole("listitem").filter({ hasText: "LC6PCJ1A0000001" })).toContainText(
      terrain.modele,
      { timeout: 20_000 },
    );
  });

  test("un châssis déjà en stock est refusé, avec la moto concernée nommée", async ({ page }) => {
    await seConnecterEtEntrer(page);
    const terrain = await preparerTerrain(page);
    const chassis = `DOUBLON${Date.now().toString(36).toUpperCase()}`;

    await saisirMoto(page, terrain, chassis);

    await saisirMoto(page, terrain, chassis, { refusAttendu: true });
    await expect(contenu(page).getByRole("alert")).toContainText("déjà en stock");
    await expect(contenu(page).getByRole("alert")).toContainText(terrain.modele);
  });

  test("une moto ne peut pas entrer sans savoir dans quelle boutique", async ({ page }) => {
    await seConnecterEtEntrer(page);
    await preparerTerrain(page);

    // Retour à « toutes les boutiques » : la question n'a plus de réponse.
    await selecteurPerimetre(page).selectOption("");
    await page.goto("/motos/nouvelle", { waitUntil: "load" });

    await expect(contenu(page)).toContainText("Choisissez-en une dans le bandeau");
    await expect(page.getByRole("button", { name: "Faire entrer en stock" })).toHaveCount(0);
  });
});

test.describe("recherche dans le stock", () => {
  test("la recherche trouve une moto sur un fragment de châssis", async ({ page }) => {
    await seConnecterEtEntrer(page);
    const terrain = await preparerTerrain(page);
    const marqueur = Date.now().toString(36).toUpperCase();

    await saisirMoto(page, terrain, `AAA${marqueur}`);
    await saisirMoto(page, terrain, `BBB${marqueur}`);

    await page.goto("/motos", { waitUntil: "load" });
    await page.getByLabel("Chercher un châssis").fill(`aaa${marqueur.toLowerCase()}`);

    await expect(page.getByRole("listitem").filter({ hasText: `AAA${marqueur}` })).toBeVisible();
    await expect(page.getByRole("listitem").filter({ hasText: `BBB${marqueur}` })).toHaveCount(0);

    await page.getByLabel("Chercher un châssis").fill("CHASSIS-INTROUVABLE");
    await expect(contenu(page)).toContainText("Aucune moto ne correspond");
  });
});

test.describe("le coût est réservé au responsable", () => {
  test("le gérant saisit un coût qu’il ne peut pas relire ; le responsable le voit", async ({
    page,
    browser,
  }) => {
    await seConnecterEtEntrer(page);
    const terrain = await preparerTerrain(page);

    // Un gérant rattaché à cette boutique.
    await page.goto("/parametres/utilisateurs", { waitUntil: "load" });
    const email = emailUnique("stock");
    const motDePasse = "gerant-stock-0001";
    const creation = page.locator("form").filter({
      has: page.getByRole("button", { name: /Créer le compte/ }),
    });
    await creation.getByLabel("Nom", { exact: true }).fill("Gérant du stock");
    await creation.getByLabel("Adresse e-mail").fill(email);
    await creation.getByLabel("Mot de passe provisoire").fill(motDePasse);
    await creation.getByLabel("Boutique").selectOption(terrain.code);
    await creation.getByRole("button", { name: /Créer le compte/ }).click();

    /* On attend la confirmation de la fonction, pas la ligne dans la liste des
       comptes : sous charge, le SDK sert un cache où `users` n'a jamais été
       chargé, et une collection jamais vue revient vide plutôt qu'en attente
       (`DECISIONS.md` D55). Le rattachement, lui, est prouvé par la suite du
       test : un gérant sans boutique ne verrait aucun stock où saisir. */
    await expect(contenu(page).getByRole("status")).toContainText("Compte créé", {
      timeout: 20_000,
    });

    // Le gérant saisit la moto, coût compris.
    const contexteGerant = await browser.newContext();
    const pageGerant = await contexteGerant.newPage();
    await seConnecter(pageGerant, email, motDePasse);
    await pageGerant.waitForURL("**/dashboard");

    const chassis = `COUT${Date.now().toString(36).toUpperCase()}`;
    await saisirMoto(pageGerant, terrain, chassis, { prixAchat: "775000" });
    await expect(contenu(pageGerant).getByRole("status")).toContainText(chassis);

    // Il ouvre la fiche : le coût lui est refusé, et on le lui dit.
    await pageGerant.goto("/motos", { waitUntil: "load" });
    await pageGerant.getByRole("listitem").filter({ hasText: chassis }).click();
    await expect(contenu(pageGerant)).toContainText("réservés au responsable");
    await expect(contenu(pageGerant)).not.toContainText("775 000");

    await contexteGerant.close();

    // Le responsable, lui, voit le montant.
    await page.goto("/motos", { waitUntil: "load" });
    await page.getByLabel("Chercher un châssis").fill(chassis);
    await page.getByRole("listitem").filter({ hasText: chassis }).click();
    await expect(contenu(page)).toContainText("775 000 FCFA");
  });
});

test.describe("hors ligne", () => {
  test("une moto se saisit et se consulte sans réseau", async ({ page, context }) => {
    await seConnecterEtEntrer(page);
    const terrain = await preparerTerrain(page);

    await page.goto("/motos", { waitUntil: "load" });
    await prendreLaMainEtMettreEnCache(page, "/motos");

    await context.setOffline(true);
    await expect(bandeauEtat(page)).toContainText("Hors ligne", { timeout: 30_000 });

    const chassis = `OFFLINE${Date.now().toString(36).toUpperCase()}`;
    /* Deux liens portent ce nom quand le stock est vide : celui de l en-tete
       et celui de l etat vide. Les deux menent au meme endroit. */
    await page.getByRole("link", { name: /Faire entrer une moto/ }).first().click();
    await page.waitForURL("**/motos/nouvelle");

    await page.getByLabel("Marque").selectOption({ label: terrain.marque });
    await page.getByLabel("Modèle").selectOption({ label: terrain.modele });
    await page.getByLabel("Numéro de châssis").fill(chassis);
    await page.getByLabel("Provenance").selectOption({ label: terrain.provenance });
    await page.getByLabel("Prix d’achat").fill("500000");
    await page.getByRole("button", { name: "Faire entrer en stock" }).click();

    // Acceptée tout de suite, et comptée comme non partie.
    await expect(contenu(page).getByRole("status")).toContainText(chassis);
    await expect(bandeauEtat(page)).toContainText("en attente");

    // Elle est déjà dans le stock local, et sa fiche s’ouvre.
    await page.getByRole("link", { name: "Voir la fiche" }).click();
    await expect(contenu(page).getByRole("heading", { level: 1 })).toContainText(terrain.modele);
    await expect(contenu(page)).toContainText(chassis);

    await context.setOffline(false);
    /* Soixante secondes, et non trente. Après une coupure, le SDK Firestore
       rétablit sa connexion avec un délai croissant qui peut approcher la
       minute : le retour du réseau ne le réveille pas, il finit son attente.
       Ce que ce test vérifie, c'est que la saisie **part toute seule** — pas
       en combien de temps. La rapidité du réveil est une question de produit,
       ouverte au backlog (S27), pas une question de harnais. */
    await expect(bandeauEtat(page)).toContainText("À jour", { timeout: 60_000 });
  });
});
