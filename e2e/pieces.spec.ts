import { expect, test, type Page } from "@playwright/test";
import {
  attendreLaFileVide,
  bandeauEtat,
  codeUnique,
  contenu,
  creerBoutique,
  emailUnique,
  nomUnique,
  prendreLaMainEtMettreEnCache,
  seConnecter,
  seConnecterEtEntrer,
  selecteurPerimetre,
} from "./aide";

/**
 * Pièces détachées — catalogue, stock et mouvements (S20).
 *
 * Ce que ces tests protègent, et qui ne se relit pas dans le code :
 *
 * **La quantité est la somme des mouvements, et elle bouge sans réseau.** C'est
 * l'arbitrage n°2 du lot, celui qui décide de ce qu'on écrit en base. Un
 * `stockPieces.quantite` entretenu par déclencheur aurait affiché l'ancienne
 * quantité au comptoir précisément quand le réseau manque. Le test hors ligne
 * est donc le test central de cette spec, pas son accessoire.
 *
 * **« Pas de négatif » est une règle du geste**, et le refus s'accompagne de la
 * réparation. Une règle qui bloque sans offrir de suite se contourne.
 *
 * **Le catalogue appartient au responsable, le stock au comptoir.** Deux rôles
 * sur le même écran, et la frontière doit se voir.
 */

const MOT_DE_PASSE = "gerant-pieces-0001";

/** Une boutique de pièces, sa référence au catalogue, et son gérant. */
async function preparerComptoir(page: Page, options: { avecGerant?: boolean } = {}) {
  const code = codeUnique();
  await creerBoutique(page, code, ["Pièces détachées"]);
  await selecteurPerimetre(page).selectOption(code);

  /* En capitales des le depart : `normaliserReference` les impose, et le
     panneau porte donc la reference normalisee dans son etiquette. Une regexp
     de Playwright est sensible a la casse, la` ou `getByRole` avec une chaine
     ne l'est pas -- le test cherchait une etiquette qui n'existait pas. */
  const reference = nomUnique("PLQ").toUpperCase();
  await page.goto("/pieces/nouvelle", { waitUntil: "load" });
  await page.getByLabel("Référence").fill(reference);
  await page.getByLabel("Désignation").fill("Plaquette de frein avant");
  await page.getByLabel(/Catégorie/).fill("Freinage");
  await page.getByLabel(/Prix de vente/).fill("3500");
  await page.getByLabel("Seuil d’alerte").fill("5");
  await page.getByRole("button", { name: "Créer la référence" }).click();
  await expect(contenu(page).getByRole("status")).toContainText("Référence créée", {
    timeout: 20_000,
  });

  let email: string | null = null;
  if (options.avecGerant) {
    email = emailUnique("pieces");
    await page.goto("/parametres/utilisateurs", { waitUntil: "load" });
    await page.getByRole("button", { name: "Créer un compte" }).click();
    const creation = page.getByRole("dialog");
    await creation.getByLabel("Nom", { exact: true }).fill("Gérant des pièces");
    await creation.getByLabel("Adresse e-mail").fill(email);
    await creation.getByLabel("Mot de passe provisoire").fill(MOT_DE_PASSE);
    await creation.getByLabel("Boutique").selectOption(code);
    await creation.getByRole("button", { name: /Créer le compte/ }).click();
    await expect(contenu(page).getByRole("status")).toContainText("Compte créé", {
      timeout: 20_000,
    });
  }

  return { code, reference, email };
}

/** Ouvre le panneau d'une pièce depuis sa ligne de catalogue. */
async function ouvrirLaPiece(page: Page, reference: string) {
  await page.goto("/pieces", { waitUntil: "load" });
  await page.getByLabel("Chercher une pièce").fill(reference);
  await page.getByRole("button", { name: reference }).click();
  return page.getByRole("region", { name: new RegExp(reference) });
}

test.describe("le catalogue", () => {
  test("le responsable crée une référence ; elle apparaît avec zéro en stock", async ({ page }) => {
    await seConnecterEtEntrer(page);
    const { reference } = await preparerComptoir(page);

    await page.goto("/pieces", { waitUntil: "load" });
    const ligne = page.locator("tbody tr").filter({ hasText: reference });
    await expect(ligne).toHaveCount(1, { timeout: 30_000 });
    /* Zéro, et « Épuisé » : une référence neuve n'a aucun mouvement, donc
       aucune quantité. Le produit ne prétend pas le contraire. */
    await expect(ligne).toContainText("Épuisé");
    await expect(ligne).toContainText("3 500");
  });

  test("une référence déjà prise ne se crée pas deux fois", async ({ page }) => {
    await seConnecterEtEntrer(page);
    const { reference } = await preparerComptoir(page);

    await page.goto("/pieces/nouvelle", { waitUntil: "load" });
    // À la casse près : c'est ce qui remplace un référentiel fermé.
    await page.getByLabel("Référence").fill(reference.toLowerCase());
    await page.getByLabel("Désignation").fill("Doublon");
    await page.getByRole("button", { name: "Créer la référence" }).click();
    await expect(contenu(page)).toContainText("existe déjà");
  });

  test("les filtres séparent le stock bas de l’épuisé", async ({ page }) => {
    await seConnecterEtEntrer(page);
    const { reference } = await preparerComptoir(page);

    // Rien en stock : la pièce est sous « Épuisé », pas sous « Stock bas ».
    await page.goto("/pieces", { waitUntil: "load" });
    await page.getByRole("button", { name: "Épuisé" }).click();
    await expect(page.locator("tbody tr").filter({ hasText: reference })).toHaveCount(1);
    await page.getByRole("button", { name: "Stock bas" }).click();
    await expect(page.locator("tbody tr").filter({ hasText: reference })).toHaveCount(0);

    // Trois unités, pour un seuil de cinq : elle bascule en « Stock bas ».
    const panneau = await ouvrirLaPiece(page, reference);
    await panneau.getByLabel("Quantité").fill("3");
    await panneau.getByRole("button", { name: "Enregistrer le mouvement" }).click();
    await expect(panneau.getByRole("status")).toContainText("Entrée de 3", { timeout: 20_000 });

    await page.getByRole("button", { name: "Stock bas" }).click();
    await expect(page.locator("tbody tr").filter({ hasText: reference })).toHaveCount(1, {
      timeout: 20_000,
    });
  });
});

test.describe("le stock bouge par mouvements", () => {
  test("une entrée puis une sortie, et la quantité suit", async ({ page }) => {
    await seConnecterEtEntrer(page);
    const { reference } = await preparerComptoir(page);

    const panneau = await ouvrirLaPiece(page, reference);
    await panneau.getByLabel("Quantité").fill("40");
    await panneau.getByRole("button", { name: "Enregistrer le mouvement" }).click();
    await expect(panneau.getByRole("status")).toContainText("Entrée de 40", { timeout: 20_000 });
    await expect(panneau).toContainText("En stock");

    await panneau.getByRole("radiogroup").getByText("Sortie", { exact: true }).click();
    await panneau.getByLabel("Quantité").fill("5");
    await panneau.getByLabel(/Note/).fill("Casse atelier");
    await panneau.getByRole("button", { name: "Enregistrer le mouvement" }).click();
    await expect(panneau.getByRole("status")).toContainText("Sortie de 5", { timeout: 20_000 });

    /* 40 − 5, compté depuis les mouvements et jamais lu dans un document. */
    await expect(page.locator("tbody tr").filter({ hasText: reference })).toContainText("35", {
      timeout: 20_000,
    });
    await expect(panneau).toContainText("Casse atelier");
  });

  /* « Pas de négatif » ne peut pas se tenir dans les règles Firestore : une
     règle ne sait pas additionner une collection, et une transaction ne marche
     pas hors ligne. Il se tient donc au geste — et le refus propose la suite,
     sans quoi le comptoir le contournerait. */
  test("une sortie plus grande que le stock est refusée, et l’écran dit quoi faire", async ({
    page,
  }) => {
    await seConnecterEtEntrer(page);
    const { reference } = await preparerComptoir(page);

    const panneau = await ouvrirLaPiece(page, reference);
    await panneau.getByRole("radiogroup").getByText("Sortie", { exact: true }).click();
    await panneau.getByLabel("Quantité").fill("1");
    await panneau.getByRole("button", { name: "Enregistrer le mouvement" }).click();
    await expect(panneau).toContainText("Faites d’abord entrer un lot");

    await panneau.getByRole("radiogroup").getByText("Entrée", { exact: true }).click();
    await panneau.getByLabel("Quantité").fill("4");
    await panneau.getByRole("button", { name: "Enregistrer le mouvement" }).click();
    await expect(panneau.getByRole("status")).toContainText("Entrée de 4", { timeout: 20_000 });

    await panneau.getByRole("radiogroup").getByText("Sortie", { exact: true }).click();
    await panneau.getByLabel("Quantité").fill("10");
    await panneau.getByRole("button", { name: "Enregistrer le mouvement" }).click();
    await expect(panneau).toContainText("que 4 en stock");
  });
});

test.describe("ce que le gérant tient dans l'espace pièces", () => {
  /* **Le renversement de S21** (`3c8b2fe`) : « pour les pièces c'est complètement
     différent, le responsable ne fera que superviser… tout est fait par le
     gérant ». Le gérant tient donc son catalogue — prix d'achat compris — et le
     responsable regarde. Ce test disait l'inverse (le modèle de S20 réponse 4,
     où une référence appartenait à la supervision) ; il a été retourné quand la
     garde du bouton est passée de `gerer_referentiels` à `gerer_pieces` (S63). */
  test("le gérant tient le stock et le catalogue", async ({ page, browser }) => {
    await seConnecterEtEntrer(page);
    const { reference, email } = await preparerComptoir(page, { avecGerant: true });

    /* Le second navigateur lit le **serveur**, pas le cache du premier : tant
       que la file d'écritures n'est pas vide, il ne verra rien de ce que le
       décor vient de fabriquer, et l'échec accusera les droits (D97). */
    await attendreLaFileVide(page);

    const contexte = await browser.newContext();
    const pageGerant = await contexte.newPage();
    await seConnecter(pageGerant, email!, MOT_DE_PASSE);
    await pageGerant.waitForURL("**/dashboard");

    // Son espace existe, et il y voit le catalogue de sa boutique.
    await pageGerant.goto("/pieces", { waitUntil: "load" });
    await expect(pageGerant.locator("tbody tr").filter({ hasText: reference })).toHaveCount(1, {
      timeout: 30_000,
    });

    /* Et le bouton de création lui est ouvert : le catalogue des pièces est
       celui de sa boutique, et c'est lui qui le tient (S21/S63). Ciblé dans le
       contenu — sur mobile (Pixel 7), le rail est masqué, et seul le bouton de
       l'en-tête porte ce libellé. */
    await expect(
      contenu(pageGerant).getByRole("link", { name: "Nouvelle référence" }),
    ).toBeVisible();
    await pageGerant.goto("/pieces/nouvelle", { waitUntil: "load" });
    await expect(contenu(pageGerant)).toContainText("Créer la référence");

    // Le stock, lui aussi, est le sien.
    await pageGerant.goto("/pieces", { waitUntil: "load" });
    const panneau = await ouvrirLaPiece(pageGerant, reference);
    await panneau.getByLabel("Quantité").fill("7");
    await panneau.getByRole("button", { name: "Enregistrer le mouvement" }).click();
    await expect(panneau.getByRole("status")).toContainText("Entrée de 7", { timeout: 20_000 });

    await contexte.close();
  });
});

test.describe("hors ligne", () => {
  /* **Le test central de S20.** L'arbitrage n°2 dit que la quantité se compte à
     la lecture depuis les mouvements, contre le cahier des charges qui la
     voulait entretenue par déclencheur. Tout l'argument tient en une phrase :
     un déclencheur ne tourne pas sans réseau. Ce test le vérifie plutôt que de
     le supposer. */
  test("un mouvement écrit réseau coupé change la quantité tout de suite", async ({
    page,
    context,
  }) => {
    await seConnecterEtEntrer(page);
    const { reference } = await preparerComptoir(page);

    // Une entrée en ligne, pour avoir de quoi sortir ensuite.
    const panneau = await ouvrirLaPiece(page, reference);
    await panneau.getByLabel("Quantité").fill("20");
    await panneau.getByRole("button", { name: "Enregistrer le mouvement" }).click();
    await expect(panneau.getByRole("status")).toContainText("Entrée de 20", { timeout: 20_000 });

    await prendreLaMainEtMettreEnCache(page, "/pieces");
    await context.setOffline(true);
    await expect(bandeauEtat(page)).toContainText("Hors ligne", { timeout: 30_000 });

    const horsLigne = await ouvrirLaPiece(page, reference);
    await horsLigne.getByRole("radiogroup").getByText("Sortie", { exact: true }).click();
    await horsLigne.getByLabel("Quantité").fill("6");
    await horsLigne.getByRole("button", { name: "Enregistrer le mouvement" }).click();

    /* 20 − 6, sans réseau et sans attendre personne. C'est ce qu'un agrégat
       entretenu n'aurait pas su faire. */
    await expect(page.locator("tbody tr").filter({ hasText: reference })).toContainText("14", {
      timeout: 20_000,
    });

    // Et la garde du geste tient aussi hors ligne : elle lit le cache local.
    await horsLigne.getByLabel("Quantité").fill("99");
    await horsLigne.getByRole("button", { name: "Enregistrer le mouvement" }).click();
    await expect(horsLigne).toContainText("que 14 en stock");

    await context.setOffline(false);
    await attendreLaFileVide(page, 60_000);
    await expect(page.locator("tbody tr").filter({ hasText: reference })).toContainText("14");
  });
});
