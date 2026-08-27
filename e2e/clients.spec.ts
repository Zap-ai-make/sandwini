import { expect, test } from "@playwright/test";
import {
  bandeauEtat,
  contenu,
  emailUnique,
  nomUnique,
  prendreLaMainEtMettreEnCache,
  seConnecter,
  seConnecterEtEntrer,
} from "./aide";

/**
 * Fichier clients (S6).
 *
 * Ce que ces tests protègent : qu'on **retrouve** quelqu'un. Un client qu'on
 * ne retrouve pas est un client qu'on recrée, et deux fiches pour la même
 * personne coupent son historique d'achats en deux — un problème qui ne se voit
 * que des mois plus tard.
 */

/** Un numéro burkinabè neuf par exécution : les fiches ne se suppriment pas. */
function telephoneUnique(): string {
  const suffixe = String(Date.now()).slice(-6);
  return `70${suffixe}`;
}

async function creerClient(page: import("@playwright/test").Page, nom: string, telephone: string) {
  await page.getByRole("button", { name: "Nouveau client" }).click();
  await page.getByLabel("Nom", { exact: true }).fill(nom);
  await page.getByLabel("Téléphone", { exact: true }).fill(telephone);
  await page.getByRole("button", { name: "Créer le client" }).click();
  await expect(contenu(page).getByRole("status")).toContainText(nom, { timeout: 20_000 });
}

test.describe("recherche", () => {
  test("un client se retrouve par son numéro, écrit comme on veut", async ({ page }) => {
    await seConnecterEtEntrer(page);
    await page.goto("/clients", { waitUntil: "load" });
    await page.getByRole("heading", { name: "Clients", level: 1 }).waitFor();

    const nom = nomUnique("Ouédraogo Salif");
    const telephone = telephoneUnique();
    await creerClient(page, nom, telephone);

    const ligne = page.getByRole("listitem").filter({ hasText: nom });
    await expect(ligne).toBeVisible();

    // Les trois écritures du même numéro mènent à la même personne.
    for (const ecriture of [telephone, `+226 ${telephone}`, telephone.slice(-4)]) {
      await page.getByLabel("Chercher un client").fill(ecriture);
      await expect(page.getByRole("listitem").filter({ hasText: nom })).toBeVisible();
    }

    await page.getByLabel("Chercher un client").fill("99 99 99 99");
    await expect(contenu(page)).toContainText("Personne ne correspond");
  });

  test("un client se retrouve par le début de son nom, sans accents", async ({ page }) => {
    await seConnecterEtEntrer(page);
    await page.goto("/clients", { waitUntil: "load" });

    const nom = nomUnique("Kaboré Awa");
    await creerClient(page, nom, telephoneUnique());

    await page.getByLabel("Chercher un client").fill("kabore");
    await expect(page.getByRole("listitem").filter({ hasText: nom })).toBeVisible();
  });
});

test.describe("création et correction", () => {
  test("un numéro déjà connu est refusé, avec le client concerné nommé", async ({ page }) => {
    await seConnecterEtEntrer(page);
    await page.goto("/clients", { waitUntil: "load" });

    const nom = nomUnique("Sawadogo Issa");
    const telephone = telephoneUnique();
    await creerClient(page, nom, telephone);

    await page.getByRole("button", { name: "Nouveau client" }).click();
    await page.getByLabel("Nom", { exact: true }).fill(nomUnique("Homonyme"));
    await page.getByLabel("Téléphone", { exact: true }).fill(`+226 ${telephone}`);
    await page.getByRole("button", { name: "Créer le client" }).click();

    await expect(contenu(page).getByRole("alert").first()).toContainText("déjà celui de");
    await expect(contenu(page).getByRole("alert").first()).toContainText(nom);
  });

  test("un client sans téléphone est refusé — c’est par lui qu’on le retrouve", async ({
    page,
  }) => {
    await seConnecterEtEntrer(page);
    await page.goto("/clients", { waitUntil: "load" });

    await page.getByRole("button", { name: "Nouveau client" }).click();
    await page.getByLabel("Nom", { exact: true }).fill(nomUnique("Sans numéro"));
    await page.getByRole("button", { name: "Créer le client" }).click();

    await expect(contenu(page).getByRole("alert").first()).toContainText("téléphone");
  });

  test("un numéro mal noté se corrige sans créer une seconde fiche", async ({ page }) => {
    await seConnecterEtEntrer(page);
    await page.goto("/clients", { waitUntil: "load" });

    const nom = nomUnique("Zongo Paul");
    await creerClient(page, nom, telephoneUnique());
    const corrige = telephoneUnique().replace(/^70/, "76");

    const ligne = page.getByRole("listitem").filter({ hasText: nom });
    await ligne.getByRole("button", { name: "Corriger" }).click();
    await ligne.getByLabel("Téléphone", { exact: true }).fill(corrige);
    await ligne.getByRole("button", { name: "Enregistrer" }).click();

    await page.getByLabel("Chercher un client").fill(corrige);
    await expect(page.getByRole("listitem").filter({ hasText: nom })).toHaveCount(1);
  });
});

test.describe("droits", () => {
  test("le gérant lit et crée des clients — c’est la seule donnée partagée", async ({
    page,
    browser,
  }) => {
    await seConnecterEtEntrer(page);

    const nomDuResponsable = nomUnique("Client du responsable");
    await page.goto("/clients", { waitUntil: "load" });
    await creerClient(page, nomDuResponsable, telephoneUnique());

    await page.goto("/parametres/utilisateurs", { waitUntil: "load" });
    const email = emailUnique("clients");
    const motDePasse = "gerant-clients-001";
    const creation = page.locator("form").filter({
      has: page.getByRole("button", { name: /Créer le compte/ }),
    });
    await creation.getByLabel("Nom", { exact: true }).fill("Gérant du fichier");
    await creation.getByLabel("Adresse e-mail").fill(email);
    await creation.getByLabel("Mot de passe provisoire").fill(motDePasse);
    await creation.getByRole("button", { name: /Créer le compte/ }).click();
    await expect(contenu(page).getByRole("status")).toContainText("Compte créé", {
      timeout: 20_000,
    });

    const contexteGerant = await browser.newContext();
    const pageGerant = await contexteGerant.newPage();
    await seConnecter(pageGerant, email, motDePasse);
    await pageGerant.waitForURL("**/dashboard");

    // Il voit le client créé par le responsable, sans être rattaché à aucune boutique.
    await pageGerant.goto("/clients", { waitUntil: "load" });
    await expect(pageGerant.getByRole("listitem").filter({ hasText: nomDuResponsable })).toBeVisible(
      { timeout: 20_000 },
    );

    // Et il en crée un.
    const sien = nomUnique("Client du gérant");
    await creerClient(pageGerant, sien, telephoneUnique());
    await expect(pageGerant.getByRole("listitem").filter({ hasText: sien })).toBeVisible();

    await contexteGerant.close();
  });
});

test.describe("hors ligne", () => {
  test("un client se crée et se retrouve sans réseau", async ({ page, context }) => {
    await seConnecterEtEntrer(page);
    await page.goto("/clients", { waitUntil: "load" });
    await prendreLaMainEtMettreEnCache(page, "/clients");

    await context.setOffline(true);
    await expect(bandeauEtat(page)).toContainText("Hors ligne", { timeout: 30_000 });

    const nom = nomUnique("Client hors ligne");
    const telephone = telephoneUnique();
    await creerClient(page, nom, telephone);

    // Accepté tout de suite, et compté comme non parti.
    await expect(bandeauEtat(page)).toContainText("en attente");

    // Et déjà retrouvable : c'est ce qui permettra de lui vendre une moto.
    await page.getByLabel("Chercher un client").fill(telephone);
    await expect(page.getByRole("listitem").filter({ hasText: nom })).toBeVisible();

    await context.setOffline(false);
    await expect(bandeauEtat(page)).toContainText("À jour", { timeout: 30_000 });
  });
});
