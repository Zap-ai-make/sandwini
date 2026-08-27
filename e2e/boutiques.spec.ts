import { expect, test, type Page } from "@playwright/test";
import {
  bandeauEtat,
  codeUnique,
  emailUnique,
  ligneDeBoutique,
  seConnecter,
  seConnecterEtEntrer,
  selecteurPerimetre,
} from "./aide";

/**
 * Boutiques et périmètre (S3).
 *
 * Ce que ces tests protègent réellement : qu’on sache **où on écrit**. Le reste
 * — corriger un nom, fermer un point de vente — se rattrape ; une saisie faite
 * dans la mauvaise boutique fausse deux stocks et ne se voit pas tout de suite.
 */

/** Le formulaire de création, isolé des formulaires d’édition de chaque ligne. */
function formulaireCreation(page: Page) {
  return page.locator("form").filter({
    has: page.getByRole("button", { name: "Créer la boutique" }),
  });
}

const ligne = ligneDeBoutique;

async function creerBoutique(page: Page, code: string, nom: string) {
  const formulaire = formulaireCreation(page);
  await formulaire.getByLabel("Nom de la boutique").fill(nom);
  await formulaire.getByLabel(/^Code/).fill(code);
  await formulaire.getByLabel(/^Adresse/).fill("Marché central");
  await formulaire.getByLabel("Téléphone").fill("70 00 00 00");
  await formulaire.getByRole("button", { name: "Créer la boutique" }).click();
}

test.describe("déclaration des boutiques", () => {
  test.beforeEach(async ({ page }) => {
    await seConnecterEtEntrer(page);
    await page.goto("/parametres/boutiques", { waitUntil: "load" });
    await page.getByRole("heading", { name: "Boutiques", level: 1 }).waitFor();
  });

  test("le responsable déclare une boutique, qui apparaît aussitôt dans la liste", async ({
    page,
  }) => {
    const code = codeUnique();
    await creerBoutique(page, code, `Boutique ${code}`);

    await expect(page.getByText(`Boutique ${code} créée, code ${code}.`)).toBeVisible();
    await expect(ligne(page, code)).toContainText(`Boutique ${code}`);

    // Le formulaire se vide : la boutique suivante ne part pas avec le nom de
    // la précédente.
    await expect(formulaireCreation(page).getByLabel("Nom de la boutique")).toHaveValue("");
  });

  test("un code qui casserait un numéro de reçu est refusé avant l’envoi", async ({ page }) => {
    const formulaire = formulaireCreation(page);
    await formulaire.getByLabel("Nom de la boutique").fill("Code trop court");
    await formulaire.getByLabel(/^Code/).fill("PT");
    await formulaire.getByRole("button", { name: "Créer la boutique" }).click();

    await expect(formulaire.getByRole("alert")).toContainText("3 lettres");
  });

  test("un code déjà pris est refusé, et la boutique existante reste intacte", async ({ page }) => {
    const code = codeUnique();
    await creerBoutique(page, code, `Première ${code}`);
    await expect(ligne(page, code)).toContainText(`Première ${code}`);

    await creerBoutique(page, code, `Doublon ${code}`);
    await expect(formulaireCreation(page).getByRole("alert")).toContainText("déjà pris");
    await expect(ligne(page, code)).toContainText(`Première ${code}`);
  });

  test("le nom se corrige, le code est définitif", async ({ page }) => {
    const code = codeUnique();
    await creerBoutique(page, code, `Avant ${code}`);

    const rangee = ligne(page, code);
    await rangee.getByRole("button", { name: "Modifier" }).click();

    // Le code est visible mais verrouillé : des reçus le portent déjà.
    await expect(rangee.getByLabel(/^Code/)).toBeDisabled();

    await rangee.getByLabel("Nom de la boutique").fill(`Après ${code}`);
    await rangee.getByRole("button", { name: "Enregistrer" }).click();

    await expect(ligne(page, code)).toContainText(`Après ${code}`);
  });

  test("une boutique fermée reste lisible et sort des choix de saisie", async ({ page }) => {
    const code = codeUnique();
    await creerBoutique(page, code, `Fermable ${code}`);

    // Elle est proposée tant qu’elle est ouverte.
    await expect(selecteurPerimetre(page).getByRole("option", { name: code })).toHaveCount(1);

    await ligne(page, code).getByRole("button", { name: "Fermer" }).click();

    // L’état est écrit, pas seulement coloré (DESIGN.md §5).
    await expect(ligne(page, code)).toContainText("Fermée");
    await expect(selecteurPerimetre(page).getByRole("option", { name: code })).toHaveCount(0);

    await ligne(page, code).getByRole("button", { name: "Rouvrir" }).click();
    await expect(selecteurPerimetre(page).getByRole("option", { name: code })).toHaveCount(1);
  });
});

test.describe("périmètre de travail", () => {
  test("le responsable choisit une boutique, et le choix survit au rechargement", async ({
    page,
  }) => {
    await seConnecterEtEntrer(page);
    await page.goto("/parametres/boutiques", { waitUntil: "load" });
    const code = codeUnique();
    await creerBoutique(page, code, `Périmètre ${code}`);
    await expect(ligne(page, code)).toBeVisible();

    const selecteur = selecteurPerimetre(page);
    await expect(selecteur).toHaveValue("");

    await selecteur.selectOption(code);
    await expect(page.getByRole("banner")).toContainText(`Périmètre ${code}`);

    /* Le périmètre est la réponse à « où j’écris » : la reposer à chaque
       ouverture de l’application la ferait ressaisir vingt fois par jour. */
    await page.reload({ waitUntil: "load" });
    await expect(selecteurPerimetre(page)).toHaveValue(code);
    await expect(page.getByRole("banner")).toContainText(`Périmètre ${code}`);

    // Retour à l’entreprise entière.
    await selecteurPerimetre(page).selectOption("");
    await expect(page.getByRole("banner")).toContainText("Toutes les boutiques");
  });
});

test.describe("rattachement d’un gérant", () => {
  test("un gérant créé sans boutique en reçoit une, et ne voit qu’elle", async ({
    page,
    browser,
  }) => {
    await seConnecterEtEntrer(page);

    // Une boutique à laquelle rattacher quelqu’un.
    await page.goto("/parametres/boutiques", { waitUntil: "load" });
    const code = codeUnique();
    await creerBoutique(page, code, `Comptoir ${code}`);
    await expect(ligne(page, code)).toBeVisible();

    // Un compte de gérant, créé sans boutique — le cas laissé ouvert par S2.
    await page.goto("/parametres/utilisateurs", { waitUntil: "load" });
    const email = emailUnique("rattache");
    const motDePasse = "gerant-rattache-01";
    const creation = page.locator("form").filter({
      has: page.getByRole("button", { name: /Créer le compte/ }),
    });
    await creation.getByLabel("Nom", { exact: true }).fill("Gérant rattaché");
    await creation.getByLabel("Adresse e-mail").fill(email);
    await creation.getByLabel("Mot de passe provisoire").fill(motDePasse);
    await creation.getByRole("button", { name: /Créer le compte/ }).click();

    const rangee = page.getByRole("listitem").filter({ hasText: email });
    await expect(rangee).toContainText("aucune boutique", { timeout: 20_000 });

    // Rattachement : le sélecteur est replié tant qu'on ne le demande pas.
    await rangee.getByRole("button", { name: "Rattacher à une boutique" }).click();
    await rangee.getByLabel("Boutique").selectOption(code);
    await rangee.getByRole("button", { name: "Rattacher", exact: true }).click();
    await expect(rangee).toContainText(`Rattaché à ${code}`, { timeout: 20_000 });

    /* Le miroir `users/{uid}` est écrit en dernier par la fonction : l'attendre,
       c'est attendre que l'opération soit entièrement passée — claim compris —
       avant de faire se connecter le gérant. Sans cela, la connexion pouvait
       partir dans la même seconde que la révocation des jetons. */
    await expect(rangee).toContainText(`Gérant · ${code}`, { timeout: 20_000 });

    // Vu du gérant : sa boutique est un fait, pas un choix.
    const contexteGerant = await browser.newContext();
    const pageGerant = await contexteGerant.newPage();
    await seConnecter(pageGerant, email, motDePasse);
    await pageGerant.waitForURL("**/dashboard");

    await expect(pageGerant.getByRole("banner")).toContainText(`Comptoir ${code}`);
    await expect(selecteurPerimetre(pageGerant)).toHaveCount(0);

    await contexteGerant.close();
  });
});

test.describe("indicateur réseau", () => {
  /**
   * Le cas que `navigator.onLine` ne sait pas voir : une interface réseau
   * active, mais aucun paquet qui arrive au serveur — wifi captif, réseau
   * mobile qui accroche sans transmettre. Le navigateur répond « en ligne »,
   * Firestore sert le cache, et le gérant croit que ses ventes sont parties.
   *
   * On reproduit exactement cela : la page reste connectée, seules les requêtes
   * vers Firestore sont coupées (`DECISIONS.md` D20).
   */
  test("le bandeau croit Firestore plutôt que le navigateur", async ({ page, context }) => {
    test.setTimeout(90_000);

    await seConnecterEtEntrer(page);
    await page.goto("/parametres/boutiques", { waitUntil: "load" });
    await expect(bandeauEtat(page)).toContainText("À jour", { timeout: 20_000 });

    /* Le wifi capte, mais rien ne passe : seules les requêtes Firestore sont
       coupées. On rouvre ensuite l'application, comme le gérant qui arrive au
       magasin — c'est le moment où la panne se voit, et le pire moment pour
       croire un bandeau qui dit « À jour ». */
    await context.route("http://127.0.0.1:8181/**", (route) => route.abort());
    await page.reload({ waitUntil: "load" });

    await expect(bandeauEtat(page)).toContainText("Hors ligne", { timeout: 40_000 });

    // Le navigateur, lui, n'a jamais cessé de se croire connecté.
    expect(await page.evaluate(() => navigator.onLine)).toBe(true);

    await context.unroute("http://127.0.0.1:8181/**");
    await page.reload({ waitUntil: "load" });
    await expect(bandeauEtat(page)).toContainText("À jour", { timeout: 40_000 });
  });
});
