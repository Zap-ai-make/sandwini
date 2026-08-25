import { expect, test } from "@playwright/test";

/**
 * Vérification du socle sur un build réel.
 *
 * Le test qui compte est le dernier : une saisie faite réseau coupé doit être
 * acceptée tout de suite, comptée, puis partir seule au retour du réseau. Tant
 * qu’il ne passe pas, l’application ne répond pas à la contrainte n°1 du cahier
 * des charges (§3.4), quoi que montrent les autres écrans.
 */

/**
 * Attend que le service worker **contrôle** la page — actif ne suffit pas.
 *
 * Puis recharge une fois en ligne : la toute première visite passe à côté du
 * service worker, qui n’existait pas encore quand le document a été demandé.
 * Ce second passage est celui qui met la page en cache. C’est aussi le trajet
 * réel d’un gérant : il ouvre l’application au magasin, puis perd le réseau.
 */
async function prendreLaMainEtMettreEnCache(
  page: import("@playwright/test").Page,
  chemin: string,
) {
  await page.waitForFunction(() => Boolean(navigator.serviceWorker?.controller), null, {
    timeout: 30_000,
  });
  await page.reload({ waitUntil: "load" });
  await page.waitForURL(`**${chemin}`);
}

test.describe("coquille applicative", () => {
  test("l’accueil s’affiche en français et mène aux quatre espaces", async ({ page }) => {
    await page.goto("/dashboard");

    await expect(page.locator("html")).toHaveAttribute("lang", "fr");
    await expect(page.getByRole("heading", { name: "Accueil", level: 1 })).toBeVisible();

    const espaces = page.getByRole("navigation", { name: "Espaces de travail" });
    for (const libelle of ["Motos", "Pièces détachées", "Caisse", "Réglages"]) {
      await expect(espaces.getByRole("link", { name: new RegExp(libelle) })).toBeVisible();
    }
  });

  test("la navigation principale tient sous le pouce sur un écran de 360 px", async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 740 });
    await page.goto("/dashboard");

    const nav = page.getByRole("navigation", { name: "Navigation principale" });
    await expect(nav).toBeVisible();

    const liens = nav.getByRole("link");
    await expect(liens).toHaveCount(5);

    // Cibles tactiles : au moins 44 px de haut, et rien qui déborde en largeur.
    for (const lien of await liens.all()) {
      const boite = await lien.boundingBox();
      expect(boite, "chaque entrée de navigation doit être visible").not.toBeNull();
      expect(boite!.height).toBeGreaterThanOrEqual(44);
    }
    const largeurNav = (await nav.boundingBox())!.width;
    expect(largeurNav).toBeLessThanOrEqual(360);
  });

  test("aucun défilement horizontal sur un petit écran", async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 740 });
    await page.goto("/motos");
    const debordement = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(debordement).toBeLessThanOrEqual(0);
  });

  test("le bandeau annonce « À jour » quand tout est parti", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page.getByRole("status")).toContainText("À jour");
  });
});

test.describe("hors ligne", () => {
  test("la coquille se recharge sans réseau", async ({ page, context }) => {
    await page.goto("/dashboard");
    await prendreLaMainEtMettreEnCache(page, "/dashboard");

    await context.setOffline(true);
    await page.reload();

    // Pas la page d’erreur du navigateur : notre écran, avec notre navigation.
    await expect(page.getByRole("heading", { name: "Accueil", level: 1 })).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Navigation principale" })).toBeVisible();

    /* Le bandeau n’est volontairement pas vérifié ici. Après un rechargement
       sous coupure émulée, Chromium continue de répondre `navigator.onLine
       === true` : c’est une limite de l’émulation, pas du produit — un
       téléphone réellement sans réseau répond `false`. L’indicateur est donc
       vérifié dans le test suivant, où la mesure est fiable. */

    await context.setOffline(false);
  });

  test("le bandeau bascule quand le réseau tombe, puis revient", async ({ page, context }) => {
    await page.goto("/dashboard");
    await expect(page.getByRole("status")).toContainText("À jour");

    await context.setOffline(true);
    await expect(page.getByRole("status")).toContainText("Hors ligne");

    await context.setOffline(false);
    await expect(page.getByRole("status")).toContainText("À jour");
  });

  test("une saisie faite hors ligne est acceptée, comptée, puis part au retour du réseau", async ({
    page,
    context,
  }) => {
    await page.goto("/diagnostic");
    await prendreLaMainEtMettreEnCache(page, "/diagnostic");

    const bouton = page.getByRole("button", { name: "Écrire un test de synchronisation" });

    // Ligne de base : en ligne, l’écriture est confirmée par le serveur.
    await bouton.click();
    await expect(page.getByText("Confirmé par le serveur")).toBeVisible({ timeout: 20_000 });

    // Réseau coupé : la saisie est acceptée localement, tout de suite.
    await context.setOffline(true);
    await bouton.click();
    await expect(page.getByText("Enregistré ici, en attente d’envoi")).toBeVisible();
    await expect(page.getByRole("status")).toContainText("1 saisie en attente");

    // Réseau revenu : elle part seule, sans que personne ne la relance.
    await context.setOffline(false);
    await expect(page.getByText("Confirmé par le serveur").first()).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole("status")).toContainText("À jour", { timeout: 30_000 });
  });
});
