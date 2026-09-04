import { expect, test } from "@playwright/test";
import {
  contenu,
  creerPrestataire,
  nomUnique,
  seConnecterEtEntrer,
  vendre,
} from "./aide";

/**
 * Le cycle des documents du dossier (S11).
 *
 * Ce qui se joue ici n’est pas l’enregistrement d’un statut — c’est **le chemin
 * que chaque document a le droit de suivre**, et il n’est pas le même pour les
 * quatre (`DECISIONS.md` D65).
 *
 * La quittance et le CMC arrivent déjà faits : le magasin reçoit le produit
 * fini. Personne ne les détient jamais, donc l’écran ne doit même pas proposer
 * de les confier à quelqu’un.
 *
 * La carte grise et la plaque passent par un prestataire, et le dépôt ne se
 * saute pas : c’est lui qui dit qui détient le document en ce moment, la seule
 * chose que la liste des dossiers sert à répondre.
 *
 * Enfin l’avance versée n’est pas une formalité de saisie : c’est de l’argent
 * qui sort de la caisse dans le même lot que le dépôt. Un dépôt sans écriture
 * de caisse, ou l’inverse, ne se rattrape qu’en interrogeant des gens de
 * mémoire des semaines plus tard.
 */

/* Même raison qu’en S8 et S9 : le décor — boutique, référentiels, moto, client,
   vente — consomme l’essentiel du budget, et chaque étape passe par
   l’interface. Les assertions gardent le leur. */
test.beforeEach(({}, informations) => {
  informations.setTimeout(240_000);
});

const dossier = (page: import("@playwright/test").Page) =>
  contenu(page).locator("section").filter({ hasText: "Le dossier" });

const ligne = (page: import("@playwright/test").Page, document: string) =>
  dossier(page).locator("li").filter({ hasText: document });

test.describe("le chemin dépend du document", () => {
  test("la quittance va au magasin sans passer par personne, puis au client", async ({ page }) => {
    await seConnecterEtEntrer(page);
    await vendre(page, { mode: "Crédit", prix: "1200000", encaisse: "400000" });

    const quittance = ligne(page, "Quittance");
    await expect(quittance).toContainText("À faire");

    /* Le cœur du test : ce bouton ne doit pas exister. Un document qui arrive
       fini n’est confié à personne, et l’écran ne propose pas un geste dont la
       base refuserait ensuite l’écriture. */
    await expect(
      quittance.getByRole("button", { name: "Déposer chez un prestataire" }),
    ).toHaveCount(0);

    await quittance.getByRole("button", { name: "Arrivé au magasin" }).click();
    await expect(quittance).toContainText("Revenu au magasin");

    await quittance.getByRole("button", { name: "Remettre au client" }).click();
    await expect(quittance).toContainText("Remis au client");

    /* Un document remis est terminé : plus aucun geste ne doit rester offert. */
    await expect(quittance.getByRole("button")).toHaveCount(0);
  });

  test("la carte grise ne saute pas le dépôt chez le prestataire", async ({ page }) => {
    await seConnecterEtEntrer(page);
    await vendre(page, { mode: "Crédit", prix: "1200000", encaisse: "400000" });

    const carteGrise = ligne(page, "Carte grise");
    await expect(carteGrise).toContainText("À faire");
    await expect(carteGrise.getByRole("button", { name: "Arrivé au magasin" })).toHaveCount(0);
    await expect(
      carteGrise.getByRole("button", { name: "Déposer chez un prestataire" }),
    ).toBeVisible();
  });
});

test.describe("confier un document à un prestataire", () => {
  test("le dépôt enregistre qui détient le document, et sort l’avance de la caisse", async ({
    page,
  }) => {
    await seConnecterEtEntrer(page);
    const prestataire = nomUnique("Kaboré");
    await creerPrestataire(page, prestataire);
    await vendre(page, { mode: "Crédit", prix: "1200000", encaisse: "400000" });

    const plaque = ligne(page, "Plaque");
    await plaque.getByRole("button", { name: "Déposer chez un prestataire" }).click();

    /* L’écran annonce la conséquence sur la caisse avant qu’on valide, plutôt
       que de la laisser découvrir dans le journal. */
    await expect(plaque).toContainText("sortie de caisse");

    await plaque.getByLabel("Prestataire").selectOption({ label: prestataire });
    await plaque.getByLabel("Avance versée").fill("15000");
    await plaque.getByRole("button", { name: "Enregistrer le dépôt" }).click();

    await expect(plaque).toContainText("Chez le prestataire");
    await expect(plaque).toContainText(prestataire);
    await expect(plaque).toContainText("15 000");

    /* Le dépôt survit à un rechargement : ce que l'écran montrait n'était pas
       seulement l'état optimiste du lot en cours.

       Cette ligne remplace une attente sur le bandeau « À jour ». Celle-ci
       observait l'indicateur de synchronisation — le signal que D55 documente
       comme instable sur cette machine — et non le comportement de S11. Elle
       échouait une fois sur deux sans que le dépôt soit en cause : le test du
       cycle complet, qui fait le même dépôt, passait dans les mêmes minutes. */
    await page.reload({ waitUntil: "load" });
    const apresRechargement = ligne(page, "Plaque");
    await expect(apresRechargement).toContainText("Chez le prestataire");
    await expect(apresRechargement).toContainText(prestataire);
  });

  test("une avance nulle est refusée : sans montant, c’est un crédit", async ({ page }) => {
    await seConnecterEtEntrer(page);
    const prestataire = nomUnique("Sawadogo");
    await creerPrestataire(page, prestataire);
    await vendre(page, { mode: "Crédit", prix: "1200000", encaisse: "400000" });

    const plaque = ligne(page, "Plaque");
    await plaque.getByRole("button", { name: "Déposer chez un prestataire" }).click();
    await plaque.getByLabel("Prestataire").selectOption({ label: prestataire });
    await plaque.getByLabel("Avance versée").fill("0");
    await plaque.getByRole("button", { name: "Enregistrer le dépôt" }).click();

    await expect(plaque.getByRole("alert")).toContainText("crédit");
    /* Le formulaire reste ouvert et la saisie reste là : on corrige le montant,
       on ne recommence pas le dépôt. */
    await expect(plaque.getByLabel("Avance versée")).toHaveValue("0");
  });

  test("le cycle complet : déposé, revenu, remis", async ({ page }) => {
    await seConnecterEtEntrer(page);
    const prestataire = nomUnique("Ouedraogo");
    await creerPrestataire(page, prestataire);
    await vendre(page, { mode: "Crédit", prix: "1200000", encaisse: "400000" });

    const carteGrise = ligne(page, "Carte grise");
    await carteGrise.getByRole("button", { name: "Déposer chez un prestataire" }).click();
    await carteGrise.getByLabel("Prestataire").selectOption({ label: prestataire });
    await carteGrise.getByLabel("Avance versée").fill("20000");
    await carteGrise.getByRole("button", { name: "Enregistrer le dépôt" }).click();
    await expect(carteGrise).toContainText("Chez le prestataire");

    /* Depuis le prestataire, un seul chemin : revenir. On ne l’écarte plus —
       l’argent de l’avance est sorti, l’écarter le laisserait sans contrepartie. */
    await expect(
      carteGrise.getByRole("button", { name: "Non concerné par cette vente" }),
    ).toHaveCount(0);

    await carteGrise.getByRole("button", { name: "Arrivé au magasin" }).click();
    await expect(carteGrise).toContainText("Revenu au magasin");

    await carteGrise.getByRole("button", { name: "Remettre au client" }).click();
    await expect(carteGrise).toContainText("Remis au client");
  });
});

test.describe("écarter un document", () => {
  test("un document qui ne concerne pas la vente se retire, et ne se rouvre pas", async ({
    page,
  }) => {
    await seConnecterEtEntrer(page);
    await vendre(page, { mode: "Crédit", prix: "1200000", encaisse: "400000" });

    const cmc = ligne(page, "CMC");
    await cmc.getByRole("button", { name: "Non concerné par cette vente" }).click();
    await expect(cmc).toContainText("Sans objet");
    await expect(cmc.getByRole("button")).toHaveCount(0);
  });
});

test.describe("la liste des dossiers en attente", () => {
  test("montre le dossier, qui le détient, et disparaît quand tout est réglé", async ({ page }) => {
    await seConnecterEtEntrer(page);
    const prestataire = nomUnique("Compaoré");
    await creerPrestataire(page, prestataire);
    const { numero } = await vendre(page, {
      mode: "Crédit",
      prix: "1200000",
      encaisse: "400000",
    });

    /* Une vente fraîche ouvre quatre documents : le dossier attend forcément. */
    await page.goto("/motos/dossiers", { waitUntil: "load" });
    const dossier = contenu(page).locator("li").filter({ hasText: numero }).first();
    await expect(dossier).toContainText("Carte grise");

    /* Le filtre par prestataire ne doit rien rendre tant que rien n'est déposé :
       personne ne détient encore quoi que ce soit. */
    await contenu(page).getByLabel("Prestataire").selectOption({ label: prestataire });
    await expect(contenu(page)).toContainText("Aucun dossier ne correspond");

    await contenu(page).getByLabel("Prestataire").selectOption({ label: "Tous" });
    await contenu(page).getByLabel("Document").selectOption({ label: "Plaque" });
    await expect(dossier).toBeVisible();
  });
});
