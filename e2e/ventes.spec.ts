import { expect, test, type Page } from "@playwright/test";
import {
  bandeauEtat,
  contenu,
  creerClientDepuisLeFichier,
  emailUnique,
  prendreLaMainEtMettreEnCache,
  preparerTerrain,
  saisirMoto,
  seConnecter,
  seConnecterEtEntrer,
  selecteurPerimetre,
  type Terrain,
} from "./aide";

/**
 * Vente de moto (S8).
 *
 * C'est la spec qui porte la valeur centrale du produit, et ce que ces tests
 * protègent tient en trois phrases.
 *
 * D'abord la promesse : **une vente entière s'enregistre réseau coupé** — la
 * moto se trouve, le client se crée, le numéro s'attribue, le dossier s'ouvre.
 * Ensuite une frontière : le gérant ne voit jamais la marge. Enfin une
 * distinction métier qu'on ne peut pas se permettre de relâcher : le crédit
 * livre la moto, les tranches la retiennent.
 */

const NUMERO = /[A-Z]{3}-\d{4}-\d{4}/;

/**
 * Le double du budget ordinaire, et la raison tient au décor, pas au produit.
 *
 * Une vente exige tout ce que les specs précédentes ont construit : une
 * boutique, une marque, un modèle, une provenance, une moto en stock, un
 * client. Chacun passe par l'interface — c'est voulu, c'est le vrai chemin d'un
 * premier jour — et chacun attend sa confirmation. Le décor consomme ainsi
 * l'essentiel des 90 secondes par défaut, et les assertions qui suivent
 * tombaient sur l'arithmétique du harnais plutôt que sur un défaut.
 *
 * Ce plafond ne masque rien : chaque assertion garde son propre budget, et une
 * donnée qui n'arrive pas fait toujours échouer le test.
 */
test.beforeEach(({}, informations) => {
  informations.setTimeout(180_000);
});

/** Le châssis d'une moto propre à cette exécution. */
function chassisUnique(prefixe: string): string {
  return `${prefixe}${Date.now().toString(36).toUpperCase()}`;
}

/** Un décor complet : boutique, référentiels, une moto en stock, un client. */
async function preparerVente(
  page: Page,
  options: { conseille?: string; synchroniser?: boolean } = {},
): Promise<{ terrain: Terrain; chassis: string; client: string; telephone: string }> {
  const terrain = await preparerTerrain(page);
  const chassis = chassisUnique("VENTE");
  await saisirMoto(page, terrain, chassis, {
    prixAchat: "850000",
    conseille: options.conseille ?? "1200000",
  });

  const client = `Ouédraogo ${Date.now().toString(36)}`;
  const telephone = `70${String(Date.now()).slice(-6)}`;
  await creerClientDepuisLeFichier(page, client, telephone);

  if (options.synchroniser) await attendreSynchronisation(page);
  return { terrain, chassis, client, telephone };
}

/**
 * Attend que le décor soit réellement parti au serveur.
 *
 * **À n'appeler que quand un second navigateur doit voir ces données.** Un
 * navigateur qui vient d'écrire lit son propre cache et n'a rien à attendre —
 * c'est même exactement la promesse du produit. Mais le cache n'est pas
 * partagé : le gérant du test de la marge ouvre une autre session, et ne verra
 * la moto que lorsqu'elle sera parvenue au serveur.
 *
 * Le budget est large parce que la file met du temps à se vider : le SDK
 * Firestore reste dans son cycle de reconnexion à attente croissante (D50, S27
 * au backlog). L'imposer à chaque test rendait la suite plus lente **et** plus
 * fragile — l'attente elle-même finissait par expirer.
 */
async function attendreSynchronisation(page: Page) {
  await expect(bandeauEtat(page)).toContainText("À jour", { timeout: 120_000 });
}

async function choisirMotoEtClient(page: Page, chassis: string, client: string) {
  await page.getByLabel("Chercher dans le stock").fill(chassis);
  await page.getByRole("radio", { name: new RegExp(chassis) }).check();

  await page.getByLabel("Chercher un client").fill(client);
  await page.getByRole("radio", { name: new RegExp(client) }).check();
}

test.describe("enregistrer une vente", () => {
  test("une vente au comptant s’enregistre, sort la moto du stock, et se retrouve", async ({
    page,
  }) => {
    await seConnecterEtEntrer(page);
    const { chassis, client, telephone } = await preparerVente(page);

    await page.goto("/motos/ventes/nouvelle", { waitUntil: "load" });
    await choisirMotoEtClient(page, chassis, client);

    /* Le prix conseillé s'installe tout seul quand on choisit la moto : c'est
       un point de départ, pas un verrou. */
    /* `exact` n'est pas décoratif : l'aide du champ voisin dit « le prix
       convenu en entier », et une recherche par sous-chaîne résolvait les deux
       champs à la fois. */
    await expect(page.getByLabel("Prix convenu", { exact: true })).toHaveValue("1200000");
    await page.getByRole("radio", { name: /Comptant/ }).check();
    await page.getByLabel(/Montant reçu/).fill("1200000");

    // Le récapitulatif dit ce qui sera écrit, avant qu'on valide.
    const recap = page.getByRole("region", { name: "Récapitulatif de la vente" });
    await expect(recap).toContainText("1 200 000 FCFA");
    await expect(recap).toContainText("Le client repart avec la moto");
    await expect(recap.locator(".plaque-code")).toHaveText(NUMERO);

    await page.getByRole("button", { name: "Enregistrer la vente" }).click();

    const confirmation = contenu(page).getByRole("status");
    await expect(confirmation).toContainText("Vente enregistrée", { timeout: 20_000 });
    const numero = (await confirmation.locator(".plaque-code").textContent())!.trim();
    expect(numero).toMatch(NUMERO);

    /* La moto ne peut plus être vendue une seconde fois : c'était la seule du
       stock, et l'écran n'offre même plus de quoi chercher — il n'y a plus rien
       à vendre. Pas de champ de recherche, donc, et c'est le bon comportement. */
    await page.goto("/motos/ventes/nouvelle", { waitUntil: "load" });
    await expect(contenu(page)).toContainText("Aucune moto disponible dans", { timeout: 30_000 });
    await expect(page.getByLabel("Chercher dans le stock")).toHaveCount(0);

    // Et elle est bien passée « vendue » dans le stock.
    await page.goto("/motos", { waitUntil: "load" });
    await page.getByLabel("Chercher un châssis").fill(chassis);
    await expect(page.getByRole("listitem").filter({ hasText: chassis })).toContainText("Vendue", {
      timeout: 20_000,
    });

    // La recherche du §6.4 : on tape le numéro de téléphone du client.
    await page.goto("/motos/ventes", { waitUntil: "load" });
    await page.getByLabel("Chercher une vente").fill(telephone);
    const ligne = page.getByRole("listitem").filter({ hasText: numero });
    await expect(ligne).toContainText(client, { timeout: 20_000 });
    await expect(ligne).toContainText("Soldée");
    await expect(ligne).toContainText("4 à faire");
  });

  test("la fiche montre le dossier entier, ses quatre documents et le versement", async ({
    page,
  }) => {
    await seConnecterEtEntrer(page);
    const { chassis, client } = await preparerVente(page);

    await page.goto("/motos/ventes/nouvelle", { waitUntil: "load" });
    await choisirMotoEtClient(page, chassis, client);
    await page.getByRole("radio", { name: /Crédit/ }).check();
    await page.getByLabel(/Montant reçu/).fill("400000");
    await page.getByRole("button", { name: "Enregistrer la vente" }).click();

    await expect(contenu(page).getByRole("status")).toContainText("Vente enregistrée", {
      timeout: 20_000,
    });
    await page.getByRole("link", { name: "Voir la vente" }).click();

    await expect(contenu(page).getByRole("heading", { level: 1 })).toContainText(client);
    await expect(contenu(page)).toContainText("800 000 FCFA"); // reste dû
    await expect(contenu(page)).toContainText("Partiellement payée");

    // Les quatre documents du dossier, créés par le même lot que la vente.
    for (const document of ["Quittance", "CMC", "Carte grise", "Plaque"]) {
      await expect(contenu(page).getByText(document, { exact: true })).toBeVisible();
    }
    await expect(contenu(page).getByText("À faire").first()).toBeVisible();

    // Le versement du jour de la vente.
    await expect(contenu(page)).toContainText("400 000 FCFA");
    await expect(contenu(page)).toContainText("Espèces");
  });

  test("une vente au comptant partiellement payée est refusée, et on dit quoi faire", async ({
    page,
  }) => {
    await seConnecterEtEntrer(page);
    const { chassis, client } = await preparerVente(page);

    await page.goto("/motos/ventes/nouvelle", { waitUntil: "load" });
    await choisirMotoEtClient(page, chassis, client);
    await page.getByRole("radio", { name: /Comptant/ }).check();
    await page.getByLabel(/Montant reçu/).fill("600000");
    await page.getByRole("button", { name: "Enregistrer la vente" }).click();

    await expect(contenu(page).getByRole("alert")).toContainText("payée en entier");
    await expect(contenu(page).getByRole("alert")).toContainText("crédit ou tranches");
    await expect(contenu(page).getByRole("status")).toHaveCount(0);
  });

  test("un encaissement supérieur au prix convenu est refusé", async ({ page }) => {
    await seConnecterEtEntrer(page);
    const { chassis, client } = await preparerVente(page);

    await page.goto("/motos/ventes/nouvelle", { waitUntil: "load" });
    await choisirMotoEtClient(page, chassis, client);
    await page.getByRole("radio", { name: /Crédit/ }).check();
    await page.getByLabel(/Montant reçu/).fill("1500000");
    await page.getByRole("button", { name: "Enregistrer la vente" }).click();

    await expect(contenu(page).getByRole("alert")).toContainText("dépasser le prix convenu");
  });

  test("une vente demande une boutique précise : son numéro en porte le code", async ({
    page,
  }) => {
    await seConnecterEtEntrer(page);
    await preparerVente(page);

    await selecteurPerimetre(page).selectOption("");
    await page.goto("/motos/ventes/nouvelle", { waitUntil: "load" });

    await expect(contenu(page)).toContainText("Choisissez-en une dans le bandeau");
    await expect(page.getByRole("button", { name: "Enregistrer la vente" })).toHaveCount(0);
  });
});

test.describe("crédit et tranches ne font pas la même chose", () => {
  test("en tranches, la moto reste réservée au magasin", async ({ page }) => {
    await seConnecterEtEntrer(page);
    const { chassis, client } = await preparerVente(page);

    await page.goto("/motos/ventes/nouvelle", { waitUntil: "load" });
    await choisirMotoEtClient(page, chassis, client);
    await page.getByRole("radio", { name: /Tranches/ }).check();
    await page.getByLabel(/Montant reçu/).fill("300000");

    const recap = page.getByRole("region", { name: "Récapitulatif de la vente" });
    await expect(recap).toContainText("La moto reste au magasin");
    await expect(recap).toContainText("engagement, pas une recette");

    await page.getByRole("button", { name: "Enregistrer la vente" }).click();
    await expect(contenu(page).getByRole("status")).toContainText("Vente enregistrée", {
      timeout: 20_000,
    });

    // Réservée, pas vendue : c'est toute la différence avec le crédit.
    await page.goto("/motos", { waitUntil: "load" });
    await page.getByLabel("Chercher un châssis").fill(chassis);
    await expect(page.getByRole("listitem").filter({ hasText: chassis })).toContainText(
      "Réservée",
      { timeout: 20_000 },
    );

    await page.goto("/motos/ventes", { waitUntil: "load" });
    await page.getByLabel("Chercher une vente").fill(chassis);
    await page.getByRole("listitem").filter({ hasText: chassis }).click();
    await expect(contenu(page)).toContainText("la moto reste au magasin");
  });
});

test.describe("la marge est réservée au responsable", () => {
  test("le gérant enregistre la vente et ne voit pas la marge ; le responsable la voit", async ({
    page,
    browser,
  }) => {
    await seConnecterEtEntrer(page);
    /* Le seul test à deux navigateurs : le gérant ouvre sa propre session, et
       ne verra le décor que lorsqu'il sera parvenu au serveur. */
    const { terrain, chassis, client } = await preparerVente(page, { synchroniser: true });

    // Un gérant rattaché à cette boutique.
    await page.goto("/parametres/utilisateurs", { waitUntil: "load" });
    const email = emailUnique("vente");
    const motDePasse = "gerant-vente-0001";
    const creation = page.locator("form").filter({
      has: page.getByRole("button", { name: /Créer le compte/ }),
    });
    await creation.getByLabel("Nom", { exact: true }).fill("Gérant des ventes");
    await creation.getByLabel("Adresse e-mail").fill(email);
    await creation.getByLabel("Mot de passe provisoire").fill(motDePasse);
    await creation.getByLabel("Boutique").selectOption(terrain.code);
    await creation.getByRole("button", { name: /Créer le compte/ }).click();
    /* On lit la confirmation de la fonction, pas la liste des comptes.
       La liste vient d'un écouteur sur `users`, une collection que ce
       navigateur n'a jamais mise en cache : quand la connexion Firestore est
       encore encombrée par les écritures du décor, elle répond vide et le test
       accusait la création d'un échec qui n'avait pas eu lieu. La confirmation,
       elle, prouve exactement ce dont ce test a besoin — le compte existe. */
    await expect(contenu(page).getByRole("status")).toContainText("Compte créé", {
      timeout: 30_000,
    });

    // Le gérant vend.
    const contexteGerant = await browser.newContext();
    const pageGerant = await contexteGerant.newPage();
    await seConnecter(pageGerant, email, motDePasse);
    await pageGerant.waitForURL("**/dashboard");

    await pageGerant.goto("/motos/ventes/nouvelle", { waitUntil: "load" });
    await expect(contenu(pageGerant)).toContainText("calculée pour le responsable seul", {
      timeout: 30_000,
    });
    await choisirMotoEtClient(pageGerant, chassis, client);
    await pageGerant.getByRole("radio", { name: /Comptant/ }).check();
    await pageGerant.getByLabel(/Montant reçu/).fill("1200000");
    await pageGerant.getByRole("button", { name: "Enregistrer la vente" }).click();
    await expect(contenu(pageGerant).getByRole("status")).toContainText("Vente enregistrée", {
      timeout: 20_000,
    });

    // Sur la fiche, la marge lui est refusée — et on lui dit pourquoi.
    await pageGerant.getByRole("link", { name: "Voir la vente" }).click();
    await expect(contenu(pageGerant)).toContainText("réservés au responsable");
    await expect(contenu(pageGerant)).not.toContainText("335 000");
    await contexteGerant.close();

    /* Le responsable, lui, voit le coût figé et la marge. Elle est écrite par
       un déclencheur : elle arrive après la vente, jamais avec elle. */
    await page.goto("/motos/ventes", { waitUntil: "load" });
    await page.getByLabel("Chercher une vente").fill(chassis);
    await page.getByRole("listitem").filter({ hasText: chassis }).click();
    await expect(contenu(page)).toContainText("850 000 FCFA", { timeout: 60_000 });
    await expect(contenu(page)).toContainText("350 000 FCFA");
  });
});

test.describe("hors ligne", () => {
  test("une vente complète s’enregistre réseau coupé, client créé à la volée", async ({
    page,
    context,
  }) => {
    await seConnecterEtEntrer(page);
    const terrain = await preparerTerrain(page);
    const chassis = chassisUnique("HORSLIGNE");
    await saisirMoto(page, terrain, chassis, { prixAchat: "700000", conseille: "1000000" });

    /* On s'arrête sur la liste des ventes : c'est elle qui charge le stock, le
       fichier clients et les ventes dans le cache Firestore. L'écran de saisie,
       lui, n'aura jamais été visité — c'est exactement le trajet d'un gérant qui
       perd le réseau, et ce que D40 demande de vérifier au moins une fois. */
    await page.goto("/motos/ventes", { waitUntil: "load" });
    await prendreLaMainEtMettreEnCache(page, "/motos/ventes");
    await expect(contenu(page).getByRole("heading", { level: 1 })).toContainText("Ventes");
    /* Pas d'attente de synchronisation avant de couper : tout se joue dans un
       seul navigateur, qui lit son propre cache. L'exiger allongeait le test de
       deux minutes et le faisait tomber en fin de suite chargée — sur la file
       d'attente du décor, jamais sur la vente. */
    await context.setOffline(true);
    await expect(bandeauEtat(page)).toContainText("Hors ligne", { timeout: 30_000 });

    // Un écran jamais visité, atteint sans réseau.
    await page.getByRole("link", { name: "Nouvelle vente" }).first().click();
    await page.waitForURL("**/motos/ventes/nouvelle");
    await expect(contenu(page).getByRole("heading", { level: 1 })).toContainText("Nouvelle vente");

    // La moto se trouve dans le stock local.
    await page.getByLabel("Chercher dans le stock").fill(chassis);
    await page.getByRole("radio", { name: new RegExp(chassis) }).check();

    // Le client se crée à la volée, sans réseau, et se rattache immédiatement.
    const client = `Kaboré ${Date.now().toString(36)}`;
    await page.getByRole("button", { name: "Nouveau client" }).click();
    const formulaireClient = page.locator("form").filter({
      has: page.getByRole("button", { name: "Créer le client" }),
    });
    await formulaireClient.getByLabel("Nom", { exact: true }).fill(client);
    await formulaireClient
      .getByLabel("Téléphone", { exact: true })
      .fill(`76${String(Date.now()).slice(-6)}`);
    await formulaireClient.getByRole("button", { name: "Créer le client" }).click();
    await expect(page.getByRole("radio", { name: new RegExp(client) })).toBeChecked();

    // Le numéro est disponible sans réseau : c'est tout l'objet de S7.
    const recap = page.getByRole("region", { name: "Récapitulatif de la vente" });
    await expect(recap.locator(".plaque-code")).toHaveText(
      new RegExp(`^${terrain.code}-\\d{4}-\\d{4}$`),
    );

    await page.getByRole("radio", { name: /Tranches/ }).check();
    await page.getByLabel(/Montant reçu/).fill("250000");
    await page.getByRole("button", { name: "Enregistrer la vente" }).click();

    // Acceptée tout de suite, et comptée comme non partie.
    const confirmation = contenu(page).getByRole("status");
    await expect(confirmation).toContainText("Vente enregistrée");
    const numero = (await confirmation.locator(".plaque-code").textContent())!.trim();
    expect(numero).toMatch(new RegExp(`^${terrain.code}-`));
    await expect(bandeauEtat(page)).toContainText("en attente");

    // La fiche s'ouvre : la vente est déjà dans le cache local.
    await page.getByRole("link", { name: "Voir la vente" }).click();
    await expect(contenu(page).getByRole("heading", { level: 1 })).toContainText(client);
    await expect(contenu(page)).toContainText("750 000 FCFA"); // reste dû
    await expect(contenu(page)).toContainText("la moto reste au magasin");

    await context.setOffline(false);
    /* Soixante secondes : après une coupure, le SDK Firestore rétablit sa
       connexion avec une attente croissante que le retour du réseau
       n'interrompt pas (D50, S27 au backlog). Ce qu'on vérifie ici, c'est que
       le lot part **tout seul** — pas en combien de temps. */
    await expect(bandeauEtat(page)).toContainText("À jour", { timeout: 90_000 });
  });
});
