import { expect, test } from "@playwright/test";
import { bandeauEtat, contenu, encaisser, seConnecterEtEntrer, vendre } from "./aide";

/**
 * Versements et suivi des paiements (S9).
 *
 * Trois choses à protéger, et elles ne se ressemblent pas.
 *
 * D'abord la promesse du produit : **un versement s'encaisse réseau coupé**, et
 * le reste dû tombe immédiatement à l'écran — sans quoi le gérant ne saurait
 * pas quoi dire au client qui attend devant lui.
 *
 * Ensuite la frontière métier : la moto d'une vente en tranches ne part qu'au
 * dernier franc. Tant qu'il reste quelque chose à verser, l'écran n'offre même
 * pas le geste.
 *
 * Enfin la distinction que tout le produit refuse de relâcher : une **dette**
 * est de l'argent qui manque au magasin, une **tranche** est de l'argent qu'il
 * détient. Deux listes, deux totaux, jamais un cumul.
 */

/* Même raison qu'en S8 : le décor — boutique, référentiels, moto, client,
   vente — consomme l'essentiel du budget, et chaque étape passe par
   l'interface. Les assertions gardent leur propre budget. */
test.beforeEach(({}, informations) => {
  informations.setTimeout(180_000);
});

test.describe("encaisser un versement", () => {
  test("un versement s’ajoute à une vente à crédit, et le reste dû tombe", async ({ page }) => {
    await seConnecterEtEntrer(page);
    const { numero } = await vendre(page, {
      mode: "Crédit",
      prix: "1200000",
      encaisse: "400000",
    });

    await expect(contenu(page)).toContainText("800 000 FCFA");
    await encaisser(page, "300000");

    /* Le reçu du versement dérive du numéro de la vente (D57) : c'est le
       deuxième encaissement de cette vente, donc le rang 2. */
    const confirmation = contenu(page).getByRole("status");
    await expect(confirmation).toContainText("Versement enregistré", { timeout: 20_000 });
    await expect(confirmation.locator(".plaque-code")).toHaveText(`${numero}/V2`);

    // Le reste dû suit immédiatement, et les deux versements sont là.
    await expect(contenu(page)).toContainText("500 000 FCFA");
    await expect(contenu(page)).toContainText("300 000 FCFA");
    await expect(contenu(page)).toContainText("Partiellement payée");
  });

  test("un versement ne peut pas dépasser le reste dû, et l’écran dit le maximum", async ({
    page,
  }) => {
    await seConnecterEtEntrer(page);
    await vendre(page, { mode: "Crédit", prix: "1000000", encaisse: "600000" });

    await encaisser(page, "500000");

    const refus = contenu(page).getByRole("alert");
    await expect(refus).toContainText("ne peut pas dépasser le reste dû");
    await expect(refus).toContainText("400 000 FCFA");
    await expect(contenu(page).getByRole("status")).toHaveCount(0);
  });

  test("une vente soldée n’offre plus de quoi encaisser", async ({ page }) => {
    await seConnecterEtEntrer(page);
    await vendre(page, { mode: "Crédit", prix: "800000", encaisse: "500000" });

    await encaisser(page, "300000");
    await expect(contenu(page)).toContainText("Soldée", { timeout: 20_000 });
    await expect(page.getByRole("button", { name: "Enregistrer le versement" })).toHaveCount(0);
  });
});

test.describe("la moto des tranches ne part qu’au dernier franc", () => {
  test("la remise se confirme une fois les tranches soldées, et la moto passe vendue", async ({
    page,
  }) => {
    await seConnecterEtEntrer(page);
    const { chassis } = await vendre(page, {
      mode: "Tranches",
      prix: "900000",
      encaisse: "400000",
    });

    // Tant qu'il reste à verser, le geste n'existe pas.
    await expect(contenu(page)).toContainText("reste 500 000 FCFA à verser");
    await expect(page.getByRole("button", { name: "Confirmer la remise de la moto" })).toHaveCount(
      0,
    );

    await encaisser(page, "500000");
    await expect(contenu(page)).toContainText("Tranches soldées", { timeout: 20_000 });

    /* Confirmation en deux temps : ce geste transforme un engagement en
       recette et ne s'annule pas depuis l'application. */
    await page.getByRole("button", { name: "Confirmer la remise de la moto" }).click();
    await page.getByRole("button", { name: "Oui, la moto est remise" }).click();

    /* La fiche disait « Remise au client : Oui, le … » sur une ligne de faits ;
       depuis A6 elle l'écrit en toutes lettres, au même endroit que la phrase
       qui disait l'inverse tant que la moto restait au magasin. Le fait n'a pas
       changé, sa formulation si (`CAHIER-UI.md` §12). */
    await expect(contenu(page)).toContainText("La moto a été remise au client", {
      timeout: 20_000,
    });
    await expect(page.getByRole("button", { name: "Confirmer la remise de la moto" })).toHaveCount(
      0,
    );

    // Et le stock le sait : la moto n'est plus réservée, elle est vendue.
    await page.goto("/motos", { waitUntil: "load" });
    await page.getByLabel("Chercher un châssis").fill(chassis);
    /* `locator("tr")` et non `getByRole("row")` : sous 1024 px le tableau du
       stock se replie en cartes, ce qui lui retire ses rôles de tableau, et la
       suite tourne sur un Pixel 7. */
    await expect(page.locator("tbody tr").filter({ hasText: chassis })).toContainText("Vendue", {
      timeout: 20_000,
    });
  });
});

/**
 * Les deux sections de l’écran des paiements (A8).
 *
 * Depuis S29 elles sont visibles en même temps, nommées, chacune avec son
 * total et sa phrase : la moto est partie, ou la moto est retenue. C’est la
 * distinction que tout le produit refuse de relâcher, et la voir c’est
 * l’apprendre — trois boutons dont un seul était pressé empêché de se
 * tromper, mais cachait la différence.
 */
const sectionDettes = (page: import("@playwright/test").Page) =>
  contenu(page).getByRole("region", { name: /^Dettes/ });

const sectionTranches = (page: import("@playwright/test").Page) =>
  contenu(page).getByRole("region", { name: /^Tranches/ });

test.describe("les deux sections de paiement", () => {
  test("une dette et une tranche ne se mélangent jamais", async ({ page }) => {
    await seConnecterEtEntrer(page);
    const { client } = await vendre(page, {
      mode: "Crédit",
      prix: "1000000",
      encaisse: "250000",
    });

    await page.goto("/motos/paiements", { waitUntil: "load" });

    /* La dette : ce qui manque au magasin, et la phrase qui dit pourquoi. */
    await expect(sectionDettes(page)).toContainText("750 000 FCFA dus", { timeout: 30_000 });
    await expect(sectionDettes(page)).toContainText("Le client doit cet argent au magasin");
    await expect(sectionDettes(page).locator("tbody tr").filter({ hasText: client })).toContainText(
      "750 000",
    );

    /* Les tranches : de l’argent que le magasin détient. Cette vente-ci est un
       crédit — elle n’a donc rien à y faire, et c’est tout l’enjeu. */
    await expect(sectionTranches(page)).toContainText("Le magasin détient l’argent déjà versé");
    await expect(sectionTranches(page)).toContainText("Aucune moto retenue au magasin");
    await expect(sectionTranches(page)).not.toContainText(client);
  });

  test("une vente en tranches compte dans le total détenu, pas dans les dettes", async ({
    page,
  }) => {
    await seConnecterEtEntrer(page);
    const { client } = await vendre(page, {
      mode: "Tranches",
      prix: "900000",
      encaisse: "300000",
    });

    await page.goto("/motos/paiements", { waitUntil: "load" });

    await expect(sectionTranches(page)).toContainText("300 000 FCFA détenus", {
      timeout: 30_000,
    });
    await expect(sectionTranches(page)).toContainText("1 moto");
    await expect(
      sectionTranches(page).locator("tbody tr").filter({ hasText: client }),
    ).toContainText("600 000");

    await expect(sectionDettes(page)).toContainText("Aucune dette");
    await expect(sectionDettes(page)).not.toContainText(client);
  });

  test("une moto soldée s’annonce depuis la liste, avec le geste qui l’attend", async ({
    page,
  }) => {
    await seConnecterEtEntrer(page);
    const { client } = await vendre(page, {
      mode: "Tranches",
      prix: "500000",
      encaisse: "200000",
    });
    await encaisser(page, "300000");
    await expect(contenu(page)).toContainText("Tranches soldées", { timeout: 20_000 });

    /* Sans cette ligne, une moto payée jusqu’au dernier franc dort au magasin
       sans que personne le sache : c’est le seul endroit du produit où la
       liste, et non la fiche, dit qu’un geste attend. */
    await page.goto("/motos/paiements", { waitUntil: "load" });
    const ligne = sectionTranches(page).locator("tbody tr").filter({ hasText: client });
    await expect(ligne).toContainText("Soldée", { timeout: 30_000 });
    await expect(ligne.getByRole("link", { name: /^Remettre la moto de / })).toBeVisible();
  });
});

test.describe("hors ligne", () => {
  test("un versement s’encaisse réseau coupé, et le reste dû tombe aussitôt", async ({
    page,
    context,
  }) => {
    await seConnecterEtEntrer(page);
    const { client, numero } = await vendre(page, {
      mode: "Crédit",
      prix: "1000000",
      encaisse: "200000",
    });

    /* La fiche est ouverte et son cache est chaud : c'est le trajet réel d'un
       gérant qui reçoit un client, puis perd le réseau. On recharge d'abord,
       parce que la toute première visite passe à côté du service worker. */
    await page.waitForFunction(() => Boolean(navigator.serviceWorker?.controller), null, {
      timeout: 30_000,
    });
    await page.reload({ waitUntil: "load" });
    /* Depuis A6, la fiche est un panneau de l'écran des ventes et non plus une
     page : l'unique `h1` reste « Ventes », et c'est le repère `complementary`,
     nommé « Vente <numéro> », qui porte la vente ouverte. */
    await expect(contenu(page).getByRole("complementary")).toContainText(client, {
      timeout: 30_000,
    });

    await context.setOffline(true);
    await expect(bandeauEtat(page)).toContainText("Hors ligne", { timeout: 30_000 });

    await encaisser(page, "300000");

    // Le numéro du reçu est disponible sans réseau : il dérive de la vente.
    const confirmation = contenu(page).getByRole("status");
    await expect(confirmation).toContainText("Versement enregistré", { timeout: 20_000 });
    await expect(confirmation.locator(".plaque-code")).toHaveText(`${numero}/V2`);

    // Et les totaux se recalculent sur le cache local, sans rien demander.
    await expect(contenu(page)).toContainText("500 000 FCFA");

    await context.setOffline(false);
    /* Ce qu'on vérifie, c'est que le lot part tout seul — pas en combien de
       temps : après une coupure, le SDK Firestore reprend avec une attente
       croissante que le retour du réseau n'interrompt pas (D50, S27). */
    await expect(bandeauEtat(page)).toContainText("À jour", { timeout: 90_000 });
  });
});
