import { expect, test, type Page } from "@playwright/test";
import {
  contenu,
  emailUnique,
  nomUnique,
  seConnecter,
  seConnecterEtEntrer,
} from "./aide";

/**
 * Référentiels et entreprise (S4).
 *
 * Ce que ces tests protègent : que les listes de choix des specs suivantes
 * existent, et qu'elles ne se laissent pas polluer. Un doublon de marque coupe
 * un stock en deux, un modèle rangé sous la mauvaise marque ne se retrouve
 * plus, et un reçu sans en-tête part chez un client tel quel.
 */

function section(page: Page, titre: string) {
  return page
    .locator("section")
    .filter({ has: page.getByRole("heading", { name: titre }) });
}

test.describe("entreprise", () => {
  test("les coordonnées saisies reviennent après un rechargement", async ({
    page,
  }) => {
    await seConnecterEtEntrer(page);
    await page.goto("/parametres/entreprise", { waitUntil: "load" });
    await page.getByRole("heading", { name: "Entreprise", level: 1 }).waitFor();

    const nom = nomUnique("Sandwidi et frère");
    await page.getByLabel("Nom de l’entreprise").fill(nom);
    await page.getByLabel("Adresse").fill("Pouytenga, marché central");
    await page.getByLabel("Téléphone", { exact: true }).fill("70 00 00 00");
    await page.getByRole("button", { name: "Enregistrer la fiche" }).click();

    await expect(contenu(page).getByRole("status")).toContainText(
      "Fiche enregistrée",
    );

    await page.reload({ waitUntil: "load" });
    await expect(page.getByLabel("Nom de l’entreprise")).toHaveValue(nom);
    await expect(page.getByLabel("Téléphone", { exact: true })).toHaveValue(
      "70 00 00 00",
    );
  });

  test("une entreprise sans nom est refusée — c’est l’en-tête du reçu", async ({
    page,
  }) => {
    await seConnecterEtEntrer(page);
    await page.goto("/parametres/entreprise", { waitUntil: "load" });

    await page.getByLabel("Nom de l’entreprise").fill("");
    await page.getByRole("button", { name: "Enregistrer la fiche" }).click();

    await expect(contenu(page).getByRole("alert")).toContainText("nom");
  });
});

test.describe("marques et modèles", () => {
  test.beforeEach(async ({ page }) => {
    await seConnecterEtEntrer(page);
    await page.goto("/parametres/catalogue", { waitUntil: "load" });
    await page
      .getByRole("heading", { name: "Marques et modèles", level: 1 })
      .waitFor();
  });

  test("un modèle se range sous sa marque, et sous elle seule", async ({
    page,
  }) => {
    const marques = section(page, "Marques");
    const premiere = nomUnique("Yamaha");
    const seconde = nomUnique("TVS");

    await marques.getByLabel("Ajouter une marque").fill(premiere);
    await marques.getByRole("button", { name: "Ajouter" }).click();
    await expect(
      marques.getByRole("listitem").filter({ hasText: premiere }),
    ).toBeVisible();

    await marques.getByLabel("Ajouter une marque").fill(seconde);
    await marques.getByRole("button", { name: "Ajouter" }).click();
    await expect(
      marques.getByRole("listitem").filter({ hasText: seconde }),
    ).toBeVisible();

    const modeles = section(page, "Modèles");
    await modeles.getByLabel("Marque").selectOption({ label: premiere });

    const modele = nomUnique("Crux");
    await modeles.getByLabel(/^Ajouter un modèle/).fill(modele);
    await modeles.getByRole("button", { name: "Ajouter" }).click();
    await expect(
      modeles.getByRole("listitem").filter({ hasText: modele }),
    ).toBeVisible();

    // Chez la marque voisine, il n’existe pas.
    await modeles.getByLabel("Marque").selectOption({ label: seconde });
    await expect(
      modeles.getByRole("listitem").filter({ hasText: modele }),
    ).toHaveCount(0);
  });

  test("le même nom écrit autrement est refusé — sinon le stock se coupe en deux", async ({
    page,
  }) => {
    const marques = section(page, "Marques");
    const nom = nomUnique("Apsonic");

    await marques.getByLabel("Ajouter une marque").fill(nom);
    await marques.getByRole("button", { name: "Ajouter" }).click();
    await expect(
      marques.getByRole("listitem").filter({ hasText: nom }),
    ).toBeVisible();

    await marques.getByLabel("Ajouter une marque").fill(nom.toUpperCase());
    await marques.getByRole("button", { name: "Ajouter" }).click();
    await expect(marques.getByRole("alert").first()).toContainText(
      "existe déjà",
    );
  });
});

test.describe("provenances et frais", () => {
  test("une entrée retirée sort des choix et reste lisible", async ({
    page,
  }) => {
    await seConnecterEtEntrer(page);
    await page.goto("/parametres/referentiels", { waitUntil: "load" });
    await page
      .getByRole("heading", { name: "Provenances et frais", level: 1 })
      .waitFor();

    const provenances = section(page, "Provenances");
    const nom = nomUnique("Import");
    await provenances.getByLabel("Ajouter une provenance").fill(nom);
    await provenances.getByRole("button", { name: "Ajouter" }).click();

    const ligne = provenances.getByRole("listitem").filter({ hasText: nom });
    await expect(ligne).toBeVisible();

    await ligne.getByRole("button", { name: "Retirer" }).click();
    // L’état est écrit, pas seulement grisé (DESIGN.md §5).
    await expect(ligne).toContainText("Retirée des choix");

    await ligne.getByRole("button", { name: "Remettre" }).click();
    await expect(ligne).not.toContainText("Retirée des choix");
  });

  test("un type de frais se renomme", async ({ page }) => {
    await seConnecterEtEntrer(page);
    await page.goto("/parametres/referentiels", { waitUntil: "load" });

    const frais = section(page, "Types de frais");
    const avant = nomUnique("Transport");
    const apres = nomUnique("Transport et douane");

    await frais.getByLabel("Ajouter un type de frais").fill(avant);
    await frais.getByRole("button", { name: "Ajouter" }).click();

    await frais
      .getByRole("listitem")
      .filter({ hasText: avant })
      .getByRole("button", { name: "Renommer" })
      .click();

    /* En édition, la ligne devient un formulaire : son ancien nom n'est plus du
       texte mais la valeur d'un champ. On vise donc le champ, pas la ligne. */
    await frais.getByLabel("Nouveau nom").fill(apres);
    await frais.getByRole("button", { name: "Enregistrer" }).click();

    await expect(
      frais.getByRole("listitem").filter({ hasText: apres }),
    ).toBeVisible();
  });
});

test.describe("prestataires", () => {
  test("un prestataire est enregistré avec ce qu’il traite", async ({
    page,
  }) => {
    await seConnecterEtEntrer(page);
    await page.goto("/parametres/prestataires", { waitUntil: "load" });
    await page
      .getByRole("heading", { name: "Prestataires", level: 1 })
      .waitFor();

    const nom = nomUnique("Kaboré");
    const formulaire = page.locator("form").filter({
      has: page.getByRole("button", { name: "Enregistrer le prestataire" }),
    });
    await formulaire.getByLabel("Nom", { exact: true }).fill(nom);
    await formulaire.getByLabel("Téléphone").fill("70 11 22 33");
    await formulaire.getByLabel("Carte grise").check();
    await formulaire
      .getByRole("button", { name: "Enregistrer le prestataire" })
      .click();

    const ligne = page.getByRole("listitem").filter({ hasText: nom });
    await expect(ligne).toContainText("70 11 22 33");
    await expect(ligne).toContainText("Carte grise");
  });

  test("un prestataire qui ne traite rien est refusé : il ne serait jamais proposé", async ({
    page,
  }) => {
    await seConnecterEtEntrer(page);
    await page.goto("/parametres/prestataires", { waitUntil: "load" });

    const formulaire = page.locator("form").filter({
      has: page.getByRole("button", { name: "Enregistrer le prestataire" }),
    });
    await formulaire
      .getByLabel("Nom", { exact: true })
      .fill(nomUnique("Sans document"));
    await formulaire.getByLabel("Téléphone").fill("70 44 55 66");
    await formulaire
      .getByRole("button", { name: "Enregistrer le prestataire" })
      .click();

    await expect(formulaire.getByRole("alert")).toContainText(
      "au moins un type",
    );
  });
});

test.describe("droits", () => {
  test("un gérant n’atteint aucun écran de référentiel", async ({
    page,
    browser,
  }) => {
    await seConnecterEtEntrer(page);
    await page.goto("/parametres/utilisateurs", { waitUntil: "load" });

    const email = emailUnique("referentiels");
    const motDePasse = "gerant-referentiels-1";
    const creation = page.locator("form").filter({
      has: page.getByRole("button", { name: /Créer le compte/ }),
    });
    await creation
      .getByLabel("Nom", { exact: true })
      .fill("Gérant sans réglages");
    await creation.getByLabel("Adresse e-mail").fill(email);
    await creation.getByLabel("Mot de passe provisoire").fill(motDePasse);
    await creation.getByRole("button", { name: /Créer le compte/ }).click();
    await expect(contenu(page).getByRole("status")).toContainText(
      "Compte créé",
      {
        timeout: 20_000,
      },
    );

    const contexteGerant = await browser.newContext();
    const pageGerant = await contexteGerant.newPage();
    await seConnecter(pageGerant, email, motDePasse);
    await pageGerant.waitForURL("**/dashboard");

    for (const chemin of [
      "entreprise",
      "catalogue",
      "referentiels",
      "prestataires",
    ]) {
      await pageGerant.goto(`/parametres/${chemin}`, { waitUntil: "load" });
      await expect(
        pageGerant.getByRole("heading", {
          name: /Réservé au responsable/,
          level: 1,
        }),
      ).toBeVisible();
    }

    await contexteGerant.close();
  });
});
