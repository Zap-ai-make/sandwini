import { expect, test } from "@playwright/test";
import {
  bandeauEtat,
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
 * **S53 a retiré leurs étapes à la quittance et au CMC.** Leur disponibilité se
 * coche sur la moto, leur remise s’enregistre sur la vente : le dossier ne
 * garde d’eux qu’un fait, celui d’être écartés. Le seul geste qu’il leur offre
 * encore est donc « Non concerné par cette vente », et c’est ce que ces tests
 * vérifient — un écran qui proposerait les anciennes étapes offrirait un geste
 * dont la base refuserait l’écriture.
 *
 * La carte grise passe par un prestataire, et le dépôt ne se
 * saute pas : c’est lui qui dit qui détient le document en ce moment, la seule
 * chose que la liste des dossiers sert à répondre. Son retour est le TERME de
 * son parcours (arbitrage 7) : il n’y a pas de troisième geste.
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
  /* **La quittance et le CMC ont quitté le dossier** (16 octobre 2026). Ils se
     cochent sur le lot à l'arrivée, et le commanditaire a tranché que cela
     suffisait : le dossier ne suit plus que la carte grise.

     Ce qu'ils n'ont pas quitté, et que ce test vérifie aussi : la fiche de
     vente dit toujours ce que le client a emporté, sous « Les papiers du
     client ». C'est un fait sur la remise, pas une étape de dossier. */
  test("le dossier ne suit que la carte grise", async ({ page }) => {
    await seConnecterEtEntrer(page);
    await vendre(page, { mode: "Crédit", prix: "1200000", encaisse: "400000" });

    await expect(ligne(page, "Carte grise")).toHaveCount(1);
    await expect(ligne(page, "Quittance")).toHaveCount(0);
    await expect(ligne(page, "CMC")).toHaveCount(0);

    /* Ce qui reste du côté du client, et qui n'est pas le dossier. */
    await expect(contenu(page).getByLabel("Quittance emportée")).toBeVisible();
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

    const carteGrise = ligne(page, "Carte grise");
    await carteGrise.getByRole("button", { name: "Déposer chez un prestataire" }).click();

    /* L’écran annonce la conséquence sur la caisse avant qu’on valide, plutôt
       que de la laisser découvrir dans le journal. */
    await expect(carteGrise).toContainText("sortie de caisse");

    await carteGrise.getByLabel("Prestataire").selectOption({ label: prestataire });
    await carteGrise.getByLabel("Avance versée").fill("15000");
    await carteGrise.getByRole("button", { name: "Enregistrer le dépôt" }).click();

    await expect(carteGrise).toContainText("Chez le prestataire");
    await expect(carteGrise).toContainText(prestataire);
    await expect(carteGrise).toContainText("15 000");

    /* Le dépôt survit à un rechargement : ce que l'écran montrait n'était pas
       seulement l'état optimiste du lot en cours.

       Cette ligne remplace une attente sur le bandeau « À jour ». Celle-ci
       observait l'indicateur de synchronisation — le signal que D55 documente
       comme instable sur cette machine — et non le comportement de S11. Elle
       échouait une fois sur deux sans que le dépôt soit en cause : le test du
       cycle complet, qui fait le même dépôt, passait dans les mêmes minutes. */
    await page.reload({ waitUntil: "load" });
    const apresRechargement = ligne(page, "Carte grise");
    await expect(apresRechargement).toContainText("Chez le prestataire");
    await expect(apresRechargement).toContainText(prestataire);
  });

  test("une avance nulle est refusée : sans montant, c’est un crédit", async ({ page }) => {
    await seConnecterEtEntrer(page);
    const prestataire = nomUnique("Sawadogo");
    await creerPrestataire(page, prestataire);
    await vendre(page, { mode: "Crédit", prix: "1200000", encaisse: "400000" });

    const carteGrise = ligne(page, "Carte grise");
    await carteGrise.getByRole("button", { name: "Déposer chez un prestataire" }).click();
    await carteGrise.getByLabel("Prestataire").selectOption({ label: prestataire });
    await carteGrise.getByLabel("Avance versée").fill("0");
    await carteGrise.getByRole("button", { name: "Enregistrer le dépôt" }).click();

    await expect(carteGrise.getByRole("alert")).toContainText("crédit");
    /* Le formulaire reste ouvert et la saisie reste là : on corrige le montant,
       on ne recommence pas le dépôt. */
    await expect(carteGrise.getByLabel("Avance versée")).toHaveValue("0");
  });

  test("le dépôt se termine sans réseau : l’écran rend la main tout de suite", async ({
    page,
    context,
  }) => {
    await seConnecterEtEntrer(page);
    const prestataire = nomUnique("Sankara");
    await creerPrestataire(page, prestataire);
    await vendre(page, { mode: "Crédit", prix: "1200000", encaisse: "400000" });

    const carteGrise = ligne(page, "Carte grise");
    await carteGrise.getByRole("button", { name: "Déposer chez un prestataire" }).click();
    await carteGrise.getByLabel("Prestataire").selectOption({ label: prestataire });
    await carteGrise.getByLabel("Avance versée").fill("20000");

    /* Le comptoir n’a pas toujours de réseau, et c’est le cas normal, pas
       l’exception (AGENTS.md). Le dépôt s’écrit dans le cache local sans
       attendre le serveur : l’écran doit en tirer les conséquences tout de
       suite, sinon le gérant reste devant un formulaire qui ne se referme
       jamais et un papier qu’il ne peut plus faire avancer. */
    await context.setOffline(true);
    await carteGrise.getByRole("button", { name: "Enregistrer le dépôt" }).click();

    await expect(carteGrise).toContainText("Chez le prestataire");
    await expect(carteGrise).toContainText(prestataire);

    /* Les trois signes que le geste est terminé : le formulaire est parti, et
       l’étape suivante est offerte — sans réseau. */
    await expect(carteGrise.getByRole("button", { name: "Enregistrer le dépôt" })).toHaveCount(0);
    await expect(carteGrise.getByRole("button", { name: "Arrivé au magasin" })).toBeVisible();

    /* Ce qui attend est annoncé ailleurs, et c’est la contrepartie du reste :
       si l’écran rend la main avant le serveur, quelque chose doit dire ce qui
       n’est pas encore parti. Le bandeau le compte — ce qui exige que l’écriture
       du dossier passe par la file, ce qu’elle avait oublié de faire.

       On ne va pas jusqu’à « À jour » après le retour du réseau : la file ne
       repart qu’au bout de l’attente croissante du SDK (S27 au backlog), et
       D55 range cet indicateur parmi les signaux instables. Ce test porte sur
       le dépôt, pas sur la reconnexion. */
    await expect(bandeauEtat(page)).toContainText("saisie");
    await expect(bandeauEtat(page)).toContainText("en attente");

    await context.setOffline(false);
  });

  test("le cycle complet : déposé, puis revenu — et c’est fini", async ({ page }) => {
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
    await expect(carteGrise).toContainText("Au magasin");

    /* **Le retour est le terme** (arbitrage 7). Il n'y a pas de « Remettre au
       client » : la preuve de la remise est le scan et la plaque saisis plus
       bas sur cette même fiche. Un troisième statut à promener n'ajoutait
       qu'un geste. */
    await expect(carteGrise.getByRole("button")).toHaveCount(0);
  });
});

test.describe("écarter un document", () => {
  test("un document qui ne concerne pas la vente se retire, et ne se rouvre pas", async ({
    page,
  }) => {
    await seConnecterEtEntrer(page);
    await vendre(page, { mode: "Crédit", prix: "1200000", encaisse: "400000" });

    /* La carte grise depuis le 16 octobre 2026 : c'est le seul document du
       dossier, donc le seul qu'on puisse écarter. */
    const carteGrise = ligne(page, "Carte grise");
    await carteGrise.getByRole("button", { name: "Non concerné par cette vente" }).click();
    await expect(carteGrise).toContainText("Sans objet");
    await expect(carteGrise.getByRole("button")).toHaveCount(0);
  });
});

/**
 * La file des dossiers en attente (A7).
 *
 * L’écran répond à une seule question — qui détient quel papier, et ce qui est
 * en retard —, et depuis S29 il laisse aussi y répondre : le relais d’un
 * document s’ouvre sous la file et fait avancer le papier sans quitter
 * l’écran. C’est ce couple qui se vérifie ici : la file dit l’état des quatre
 * documents, et le geste qu’on y fait s’y voit tout de suite.
 */
test.describe("la file des dossiers en attente", () => {
  test("dit où en est la carte grise, et la fait avancer sans quitter l’écran", async ({
    page,
  }) => {
    await seConnecterEtEntrer(page);
    const { numero } = await vendre(page, {
      mode: "Crédit",
      prix: "1200000",
      encaisse: "400000",
    });

    /* Une vente fraîche ouvre son dossier : il attend forcément sa carte grise. */
    await page.goto("/motos/dossiers", { waitUntil: "load" });
    const ligne = contenu(page).locator("tbody tr").filter({ hasText: numero });
    await expect(ligne).toHaveCount(1);

    /* **Une seule colonne de papier** (16 octobre 2026) : la quittance et le CMC
       se cochent sur le lot à l'arrivée, et deux colonnes qui répétaient
       « À faire » noyaient la seule qu'on venait lire. */
    await expect(ligne.locator("td", { hasText: "À faire" })).toHaveCount(1);
    await expect(
      ligne.getByRole("button", { name: `Quittance de ${numero} : À faire`, exact: true }),
    ).toHaveCount(0);
    await expect(
      ligne.getByRole("button", { name: `Carte grise de ${numero} : À faire`, exact: true }),
    ).toBeVisible();

    /* Rien n'est encore parti : personne ne détient quoi que ce soit. */
    await contenu(page).getByRole("button", { name: "Chez un prestataire", exact: true }).click();
    await expect(contenu(page)).toContainText("Aucun dossier ne correspond");
    await contenu(page).getByRole("button", { name: "Ouverts", exact: true }).click();

    /* Le relais s'ouvre sous la file et montre le chemin qui reste : deux
       étapes, et le dépôt ne se saute pas. */
    await ligne
      .getByRole("button", { name: `Carte grise de ${numero} : À faire`, exact: true })
      .click();
    const relais = contenu(page).locator("section").filter({ hasText: "Carte grise de" });
    await expect(relais.getByRole("button", { name: "Déposer chez un prestataire" })).toBeVisible();
    /* Le troisième statut a disparu du chemin : le retour est le terme. */
    await expect(relais).not.toContainText("Remis au client");
  });

  /**
   * **Le trajet entier d'un papier sur une moto SANS LOT** (16 octobre 2026).
   *
   * La quittance et le CMC se cochent normalement sur le lot à l'arrivée, et
   * c'est pour cela qu'ils ont quitté le dossier. Mais une moto entrée à
   * l'unité par `/motos/nouvelle` n'appartient à aucun lot : sa fiche garde
   * donc le bloc « Papiers en main », et c'est le seul endroit où ses papiers
   * peuvent se cocher.
   *
   * Sans cette exception, la case « CMC emporté » de la vente ne se serait
   * jamais ouverte — on ne remet pas ce qu'on n'a pas — et le reçu de cette
   * moto n'aurait jamais pu dire ce que le client avait emporté.
   */
  test("une moto sans lot garde ses cases sur sa fiche, et le client emporte depuis la vente", async ({
    page,
  }) => {
    await seConnecterEtEntrer(page);
    const { chassis, numero } = await vendre(page, {
      mode: "Crédit",
      prix: "1200000",
      encaisse: "400000",
    });

    /* Cette moto n'a pas de lot : sa fiche garde donc le bloc. */
    await page.goto("/motos", { waitUntil: "load" });
    await page.getByLabel("Chercher dans le stock").fill(chassis);
    await page.getByRole("link", { name: chassis }).click();
    /* **`click` et non `check`**, comme le test des arrivages (S43). Ces cases
       sont contrôlées par l'abonnement Firestore : le clic retourne la case
       dans le DOM, React la remet aussitôt sur la valeur reçue, et `check`
       vérifie l'état dans cet intervalle. */
    await page.getByRole("checkbox", { name: "CMC", exact: true }).click();
    await expect(contenu(page).getByText("Au magasin")).toBeVisible({ timeout: 30_000 });

    /* La file ne montre plus qu'une colonne de papier, et c'est la carte grise :
       cocher le CMC n'y change donc plus rien, et c'est voulu. */
    await page.goto("/motos/dossiers", { waitUntil: "load" });
    const ligneDossier = contenu(page).locator("tbody tr").filter({ hasText: numero });
    await expect(ligneDossier).toHaveCount(1, { timeout: 30_000 });
    await expect(ligneDossier.locator("td", { hasText: "À faire" })).toHaveCount(1);

    /* Sur la fiche de vente, la quittance n'est pas en main : on ne remet pas
       ce qu'on n'a pas, et la case doit être fermée. Le CMC, lui, s'ouvre. */
    await page.goto("/motos/ventes", { waitUntil: "load" });
    await contenu(page).getByRole("link", { name: numero }).click();

    await expect(page.getByRole("checkbox", { name: /Quittance emportée/ })).toBeDisabled();

    const caseCmc = page.getByRole("checkbox", { name: /CMC emporté/ });
    await expect(caseCmc).toBeEnabled();
    await caseCmc.click();
    await expect(contenu(page)).toContainText("Emporté par le client", { timeout: 30_000 });

    /* La plaque se saisit ici et se range sur la moto : `normaliserPlaque` la
       met en capitales avant l'écriture. */
    await page.getByLabel("Numéro de plaque").fill("11 aa 1234");
    await page.getByRole("button", { name: "Enregistrer la plaque" }).click();
    await expect(page.getByLabel("Numéro de plaque")).toHaveValue("11 AA 1234", {
      timeout: 30_000,
    });
  });
});
