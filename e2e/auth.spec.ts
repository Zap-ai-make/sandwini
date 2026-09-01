import { expect, test } from "@playwright/test";
import {
  RESPONSABLE,
  contenu,
  emailUnique,
  messageErreur,
  messageSucces,
  prendreLaMainEtMettreEnCache,
  seConnecter,
  seConnecterEtEntrer,
} from "./aide";

/**
 * Authentification, rôles et gestion des comptes (S2).
 *
 * Ce que ces tests protègent réellement : qu’un gérant ne puisse pas atteindre
 * l’administration, et qu’une session ouverte survive à la perte du réseau. Le
 * reste — messages d’erreur, formulaires — est du confort, important mais
 * rattrapable ; ces deux-là ne le sont pas.
 */

const MOT_DE_PASSE_FAUX = "mauvais-mot-de-passe";

test.describe("accès", () => {
  test("sans session, l’application renvoie vers la connexion", async ({ page }) => {
    await page.goto("/dashboard");
    await page.waitForURL("**/login");
    await expect(page.getByRole("heading", { name: "Connexion", level: 1 })).toBeVisible();
  });

  test("un mot de passe faux ne dit pas si le compte existe", async ({ page }) => {
    await seConnecter(page, RESPONSABLE.email, MOT_DE_PASSE_FAUX);
    await expect(messageErreur(page)).toHaveText("Adresse e-mail ou mot de passe incorrect.");

    // Exactement le même message pour une adresse inconnue : sinon le
    // formulaire devient un annuaire des comptes existants.
    await seConnecter(page, "personne@sdi.test", MOT_DE_PASSE_FAUX);
    await expect(messageErreur(page)).toHaveText("Adresse e-mail ou mot de passe incorrect.");
  });

  test("le responsable se connecte et arrive sur sa supervision", async ({ page }) => {
    await seConnecterEtEntrer(page);
  });

  test("la session survit à un rechargement sans réseau", async ({ page, context }) => {
    await seConnecterEtEntrer(page);
    await prendreLaMainEtMettreEnCache(page, "/supervision");

    await context.setOffline(true);
    await page.reload();

    // Toujours connecté : ni redirection vers /login, ni écran vide.
    await expect(page.getByRole("heading", { name: "Supervision", level: 1 })).toBeVisible();
    expect(page.url()).toContain("/supervision");

    await context.setOffline(false);
  });

  test("la déconnexion ramène à l’écran de connexion", async ({ page }) => {
    await seConnecterEtEntrer(page);

    await page.goto("/parametres");
    await page.getByRole("button", { name: "Se déconnecter" }).click();
    await page.waitForURL("**/login", { timeout: 20_000 });
    await expect(page.getByRole("heading", { name: "Connexion", level: 1 })).toBeVisible();
  });
});

test.describe("gestion des comptes", () => {
  test("le responsable crée un gérant, qui apparaît dans la liste", async ({ page }) => {
    await seConnecterEtEntrer(page);
    await page.goto("/parametres/utilisateurs");

    const email = emailUnique("gerant");
    await page.getByLabel("Nom", { exact: true }).fill("Ouédraogo");
    await page.getByLabel("Adresse e-mail").fill(email);
    await page.getByLabel("Mot de passe provisoire").fill("motdepasse-provisoire");
    await page.getByRole("button", { name: /Créer le compte/ }).click();

    await expect(messageSucces(page)).toContainText("Compte créé pour Ouédraogo", {
      timeout: 20_000,
    });
    await expect(page.getByRole("listitem").filter({ hasText: email })).toBeVisible();
  });

  test("un mot de passe trop court est refusé par le serveur", async ({ page }) => {
    await seConnecterEtEntrer(page);
    await page.goto("/parametres/utilisateurs");

    await page.getByLabel("Nom", { exact: true }).fill("Trop court");
    await page.getByLabel("Adresse e-mail").fill(emailUnique("court"));
    await page.getByLabel("Mot de passe provisoire").fill("court");
    await page.getByRole("button", { name: /Créer le compte/ }).click();

    await expect(messageErreur(page)).toContainText("10 caractères", { timeout: 20_000 });
  });

  test("un gérant n’atteint pas l’administration des comptes", async ({ page, browser }) => {
    await seConnecterEtEntrer(page);
    await page.goto("/parametres/utilisateurs");

    const email = emailUnique("restreint");
    const motDePasse = "gerant-restreint-01";
    await page.getByLabel("Nom", { exact: true }).fill("Gérant restreint");
    await page.getByLabel("Adresse e-mail").fill(email);
    await page.getByLabel("Mot de passe provisoire").fill(motDePasse);
    await page.getByRole("button", { name: /Créer le compte/ }).click();
    await expect(messageSucces(page)).toContainText("Compte créé", { timeout: 20_000 });

    const contexteGerant = await browser.newContext();
    const pageGerant = await contexteGerant.newPage();
    await seConnecter(pageGerant, email, motDePasse);
    await pageGerant.waitForURL("**/dashboard");

    // L’entrée n’apparaît pas dans ses réglages…
    await pageGerant.goto("/parametres");
    await expect(pageGerant.getByRole("link", { name: /Utilisateurs/ })).toHaveCount(0);
    /* Le bandeau le dit aussi, en haut de chaque écran : on vise donc le contenu,
       sinon les deux régions se disputent le même texte. */
    await expect(contenu(pageGerant).getByText("Aucune boutique attribuée")).toBeVisible();

    // …et l’adresse tapée à la main est refusée avec une explication.
    await pageGerant.goto("/parametres/utilisateurs");
    await expect(
      pageGerant.getByRole("heading", { name: /Réservé au responsable/, level: 1 }),
    ).toBeVisible();
    await expect(pageGerant.getByRole("button", { name: /Créer le compte/ })).toHaveCount(0);

    await contexteGerant.close();
  });
});
