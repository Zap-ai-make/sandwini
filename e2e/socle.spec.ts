import { expect, test } from "@playwright/test";
import {
  bandeauEtat,
  codeUnique,
  creerBoutique,
  prendreLaMainEtMettreEnCache,
  seConnecterEtEntrer,
} from "./aide";

/**
 * Vérification du socle sur un build réel.
 *
 * Le test qui compte est le dernier : une saisie faite réseau coupé doit être
 * acceptée tout de suite, comptée, puis partir seule au retour du réseau. Tant
 * qu’il ne passe pas, l’application ne répond pas à la contrainte n°1 du cahier
 * des charges (§3.4), quoi que montrent les autres écrans.
 *
 * Depuis S2, l’espace de travail exige une session : chaque test ouvre donc la
 * sienne. Firebase Auth garde sa session dans IndexedDB, que Playwright ne sait
 * pas préenregistrer — d’où une vraie connexion à chaque fois.
 */

test.describe("coquille applicative", () => {
  test.beforeEach(async ({ page }) => {
    await seConnecterEtEntrer(page);
  });

  test("la supervision s’affiche en français et mène aux boutiques", async ({ page }) => {
    await expect(page.locator("html")).toHaveAttribute("lang", "fr");

    const code = codeUnique();
    await creerBoutique(page, code, ["Motos"]);
    await page.goto("/supervision", { waitUntil: "load" });

    const boutiques = page.getByRole("navigation", { name: "Boutiques" });
    await expect(boutiques.getByRole("link", { name: new RegExp(code) })).toBeVisible();
  });

  test("la navigation principale tient sous le pouce sur un écran de 360 px", async ({ page }) => {
    /* Une boutique aux deux métiers : la barre est alors à son maximum, cinq
       entrées, et c’est cette densité-là qui doit tenir en 360 px. */
    await creerBoutique(page, codeUnique(), ["Motos", "Pièces détachées"]);

    await page.setViewportSize({ width: 360, height: 740 });
    await page.goto("/supervision", { waitUntil: "load" });

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
    expect((await nav.boundingBox())!.width).toBeLessThanOrEqual(360);
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
    await expect(bandeauEtat(page)).toContainText("À jour");
  });
});

test.describe("en-têtes de sécurité", () => {
  test("le build de production ne relâche rien", async ({ page }) => {
    const reponse = await page.goto("/login");
    const entetes = reponse!.headers();
    const csp = entetes["content-security-policy"] ?? "";

    /* React exige `unsafe-eval` en développement. Cette tolérance ne doit
       jamais atteindre la production — et une CSP relâchée par accident ne se
       voit pas à l’œil, d’où ce test. */
    expect(csp, "unsafe-eval ne doit jamais sortir du développement").not.toContain("unsafe-eval");

    /* Le miroir du test précédent, et il a manqué longtemps : une CSP **trop
       stricte** ne se voit pas davantage à l'œil. Faute de ce domaine, le
       navigateur coupait tous les appels aux fonctions appelables — créer un
       gérant, le rattacher, désactiver un compte — avant même qu'ils partent.
       L'application n'en voyait qu'un « le serveur n'a pas répondu », qui
       accusait le réseau. Invisible sur les émulateurs, qui répondent sur
       127.0.0.1 : la panne n'existait qu'en ligne. */
    expect(csp, "les fonctions appelables doivent rester joignables").toContain(
      "https://*.cloudfunctions.net",
    );

    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("base-uri 'self'");
    expect(entetes["x-content-type-options"]).toBe("nosniff");
    expect(entetes["referrer-policy"]).toBe("strict-origin-when-cross-origin");
    expect(entetes["x-frame-options"]).toBe("DENY");
    expect(entetes["strict-transport-security"]).toContain("max-age=");
  });
});

test.describe("hors ligne", () => {
  test.beforeEach(async ({ page }) => {
    await seConnecterEtEntrer(page);
  });

  test("la coquille se recharge sans réseau", async ({ page, context }) => {
    await prendreLaMainEtMettreEnCache(page, "/supervision");

    await context.setOffline(true);
    await page.reload();

    // Pas la page d’erreur du navigateur : notre écran, avec notre navigation.
    await expect(page.getByRole("heading", { name: "Supervision", level: 1 })).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Navigation principale" })).toBeVisible();

    /* Le bandeau n’est volontairement pas vérifié ici. Après un rechargement
       sous coupure émulée, Chromium continue de répondre `navigator.onLine
       === true` : c’est une limite de l’émulation, pas du produit. L’indicateur
       est vérifié dans le test suivant, où la mesure est fiable. */

    await context.setOffline(false);
  });

  test("le bandeau bascule quand le réseau tombe, puis revient", async ({ page, context }) => {
    await expect(bandeauEtat(page)).toContainText("À jour");

    await context.setOffline(true);
    await expect(bandeauEtat(page)).toContainText("Hors ligne");

    await context.setOffline(false);
    await expect(bandeauEtat(page)).toContainText("À jour");
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
    await expect(bandeauEtat(page)).toContainText("1 saisie en attente");

    // Réseau revenu : elle part seule, sans que personne ne la relance.
    await context.setOffline(false);
    await expect(page.getByText("Confirmé par le serveur").first()).toBeVisible({ timeout: 30_000 });
    /* Soixante secondes, et non trente. Après une coupure, le SDK Firestore
       rétablit sa connexion avec un délai croissant qui peut approcher la
       minute : le retour du réseau ne le réveille pas, il finit son attente.
       Ce que ce test vérifie, c'est que la saisie **part toute seule** — pas
       en combien de temps. La rapidité du réveil est une question de produit,
       ouverte au backlog (S27), pas une question de harnais. */
    await expect(bandeauEtat(page)).toContainText("À jour", { timeout: 60_000 });
  });
});
