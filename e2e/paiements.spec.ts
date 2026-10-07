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
 * détient. Depuis S48 elles partagent une liste ; elles gardent leur colonne,
 * leur filtre et **deux totaux, jamais un cumul**.
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
    await page.getByLabel("Chercher dans le stock").fill(chassis);
    /* `locator("tr")` et non `getByRole("row")` : sous 1024 px le tableau du
       stock se replie en cartes, ce qui lui retire ses rôles de tableau, et la
       suite tourne sur un Pixel 7. */
    await expect(page.locator("tbody tr").filter({ hasText: chassis })).toContainText("Vendue", {
      timeout: 20_000,
    });
  });
});

/**
 * La liste des paiements (A8, S48).
 *
 * L’écran a porté deux tableaux séparés jusqu’à S48, chacun sous sa phrase. Le
 * commanditaire les a trouvés lourds et a demandé une liste unique. La
 * distinction a donc changé de place, pas de statut : elle vit dans une colonne
 * **Mode** et dans **deux totaux qui ne s’additionnent jamais**.
 *
 * C’est ce que ces tests protègent. Une dette est de l’argent qui manque au
 * magasin ; une tranche est de l’argent qu’il détient pour le compte du client.
 * Un seul chiffre qui les mêlerait serait la régression la plus coûteuse du
 * produit (`AGENTS.md`, §13) — et une liste unique est précisément ce qui la
 * rend possible.
 */
const ligneDe = (page: import("@playwright/test").Page, client: string) =>
  contenu(page).locator("tbody tr").filter({ hasText: client });

const filtre = (page: import("@playwright/test").Page, nom: string) =>
  contenu(page).getByRole("group", { name: "Filtrer les paiements" }).getByRole("button", { name: nom, exact: true });

test.describe("la liste des paiements", () => {
  test("une dette porte son mode, et ne compte pas dans ce que le magasin détient", async ({
    page,
  }) => {
    await seConnecterEtEntrer(page);
    const { client } = await vendre(page, {
      mode: "Crédit",
      prix: "1000000",
      encaisse: "250000",
    });

    await page.goto("/motos/paiements", { waitUntil: "load" });

    /* Le total des dettes est nommé pour ce qu'il est : de l'argent que les
       clients doivent. */
    await expect(contenu(page)).toContainText("750 000 FCFA dus par les clients", {
      timeout: 30_000,
    });
    /* Et rien n'est détenu : cette vente est un crédit, la moto est partie.
       Le second total ne doit même pas paraître. */
    await expect(contenu(page)).not.toContainText("détenus pour eux");

    const ligne = ligneDe(page, client);
    await expect(ligne).toContainText("Crédit");
    await expect(ligne).toContainText("750 000");
    await expect(ligne).not.toContainText("Tranches");
  });

  test("une tranche compte dans le détenu, jamais dans les dus", async ({ page }) => {
    await seConnecterEtEntrer(page);
    const { client } = await vendre(page, {
      mode: "Tranches",
      prix: "900000",
      encaisse: "300000",
    });

    await page.goto("/motos/paiements", { waitUntil: "load" });

    await expect(contenu(page)).toContainText("300 000 FCFA détenus pour eux", {
      timeout: 30_000,
    });
    await expect(contenu(page)).not.toContainText("dus par les clients");

    const ligne = ligneDe(page, client);
    await expect(ligne).toContainText("Tranches");
    await expect(ligne).toContainText("600 000");
  });

  /* Le cas que la fusion des deux tableaux rendait possible : si le filtre ne
     séparait plus, la liste unique aurait vraiment perdu la distinction au lieu
     de la déplacer. */
  test("le filtre sépare ce que la liste réunit", async ({ page }) => {
    await seConnecterEtEntrer(page);
    const { client } = await vendre(page, {
      mode: "Crédit",
      prix: "1000000",
      encaisse: "250000",
    });

    await page.goto("/motos/paiements", { waitUntil: "load" });
    await expect(ligneDe(page, client)).toBeVisible({ timeout: 30_000 });

    await filtre(page, "Crédit").click();
    await expect(ligneDe(page, client)).toBeVisible();

    /* Partiellement payée : 250 000 versés sur 1 000 000. Le second axe du
       filtre répond sur la même ligne. */
    await filtre(page, "Partiellement payées").click();
    await expect(ligneDe(page, client)).toBeVisible();

    /* Et elle ne doit pas se trouver sous Soldées : c'est la pastille qui
       remplace Impayées, et elle sépare sur le même axe — où en est l'argent. */
    await filtre(page, "Soldées").click();
    await expect(ligneDe(page, client)).toHaveCount(0);

    await filtre(page, "Tout").click();
    await expect(ligneDe(page, client)).toBeVisible();
  });

  /**
   * Ce que l'élargissement de la liste a rendu possible.
   *
   * L'écran ne gardait que les ventes en attente : une vente soldée en
   * disparaissait, et la pastille « Soldées » n'aurait jamais rien rendu. Ce
   * test est le témoin qu'elle rend désormais quelque chose — et qu'une vente
   * terminée ne s'évapore plus du registre le jour où elle se termine.
   */
  test("une vente soldée reste au registre, sous sa pastille", async ({ page }) => {
    await seConnecterEtEntrer(page);
    /* Soldée d'emblée : le crédit est encaissé en entier dès la saisie. */
    const { client } = await vendre(page, {
      mode: "Crédit",
      prix: "400000",
      encaisse: "400000",
    });

    await page.goto("/motos/paiements", { waitUntil: "load" });
    await expect(ligneDe(page, client)).toBeVisible({ timeout: 30_000 });

    await filtre(page, "Soldées").click();
    await expect(ligneDe(page, client)).toBeVisible();

    await filtre(page, "Partiellement payées").click();
    await expect(ligneDe(page, client)).toHaveCount(0);

    /* Rien n'est dû sur une vente soldée : le total de tête ne doit pas la
       compter, alors même que sa ligne est affichée. C'est le point exact que
       l'élargissement pouvait fausser. */
    await filtre(page, "Tout").click();
    await expect(contenu(page)).not.toContainText("dus par les clients");
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
    const ligne = ligneDe(page, client);
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
