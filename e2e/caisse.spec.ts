import { expect, test } from "@playwright/test";
import {
  attendreLaFileVide,
  bandeauEtat,
  contenu,
  emailUnique,
  preparerTerrain,
  seConnecter,
  seConnecterEtEntrer,
  selecteurPerimetre,
  vendre,
} from "./aide";

/**
 * La caisse — le journal, et la dépense qui s'y inscrit (S22, S55).
 *
 * Ce que cette suite protège tient en deux affirmations, et aucune ne se relit
 * ailleurs dans le code exécuté :
 *
 * 1. **Un versement encaissé au comptoir apparaît au journal de caisse**, à
 *    sa nature et à son moyen. C'est le lien entre S9 et S22 : les mouvements
 *    sont écrits depuis S8, et S22 se contente de les lire — si ce lien casse,
 *    le journal se vide sans que rien d'autre échoue.
 * 2. **Une sortie d'espèces s'inscrit au journal, en négatif** (réponse 2 du
 *    commanditaire). Sans elle, chaque billet sorti pour du carburant manque au
 *    tiroir sans que rien ne l'explique.
 *
 * **La clôture n'est plus ici, et ce n'est pas un oubli.** Le commanditaire a
 * répondu « pas de fermeture ni d'ouverture » : personne ne compte le tiroir le
 * soir. L'écran ne porte donc plus le panneau, et les assertions qui le
 * visaient sont parties avec lui (D87). Ce que la clôture savait faire reste
 * prouvé un cran plus bas — `lib/domain/caisse.test.ts` pour le calcul,
 * `regles/caisse.test.ts` pour ce que la base accepte — de sorte qu'un retour
 * en arrière ne repart pas de rien.
 */

/* Même raison qu'en S8 et S9 : le décor consomme l'essentiel du budget, et
   chaque étape passe par l'interface. Le second test crée en plus un compte de
   gérant et ouvre une seconde session. */
test.beforeEach(({}, informations) => {
  informations.setTimeout(300_000);
});

test.describe("le journal de caisse", () => {
  test("l’argent encaissé à la vente se retrouve dans la journée, à sa nature et à son moyen", async ({
    page,
  }) => {
    await seConnecterEtEntrer(page);
    const { numero, client } = await vendre(page, {
      mode: "Crédit",
      prix: "1200000",
      encaisse: "400000",
    });

    await page.goto("/caisse", { waitUntil: "load" });
    await expect(page.getByRole("heading", { name: /Journal de caisse/, level: 1 })).toBeVisible();

    /* La ligne du versement : son numéro de pièce, sa nature, son montant. Le
       décor n'a produit qu'un seul mouvement, donc le journal en compte un. */
    const ligne = contenu(page).locator("tbody tr").filter({ hasText: numero });
    await expect(ligne).toContainText("400 000", { timeout: 30_000 });
    await expect(ligne).toContainText("Espèces");
    await expect(ligne).toContainText("Vente");
    await expect(contenu(page)).toContainText("1 mouvement");

    /* **Ce que le journal ne montre pas, et c'est voulu.** Le nom du client ne
       figure nulle part dans un encaissement, et `origineRefId` est un
       identifiant Firestore et non un numéro imprimé. Le premier passage de ce
       test a fait tomber les deux — la colonne « Pièce » affichait
       « hDgIoVtmr1SwOLm0axV7 ». Cette assertion garde le défaut fermé : si un
       identifiant brut revient à l'écran, elle échoue. */
    await expect(ligne).not.toContainText(client);
    /* Compter les cellules est ce qui garde fermé le défaut de S22 : la
       colonne « Pièce » avait été retirée parce qu'elle ne pouvait afficher
       qu'un identifiant Firestore, et une colonne qui revient se voit ici
       avant de se voir à l'écran. Six depuis S55, qui a ajouté « Saisi par » —
       le nombre suit l'écran, le garde-fou ne bouge pas. */
    await expect(ligne.locator("td")).toHaveCount(6);
    await expect(ligne).toContainText(`Vente ${numero}`);

    /* Le montant entré se lit sur sa ligne, et c'est tout ce que le journal
       promet : il ne totalise plus rien depuis que la clôture est partie
       (D87). Un total attendu sans personne pour le comparer au tiroir n'est
       un total pour personne. */
    await expect(ligne).toContainText("400 000");
  });
});

test.describe("la dépense", () => {
  test("le gérant enregistre une dépense, la range dans un poste, et le journal la compte en moins", async ({
    page,
    browser,
  }) => {
    await seConnecterEtEntrer(page);
    const { terrain, numero } = await vendre(page, {
      mode: "Crédit",
      prix: "1200000",
      encaisse: "400000",
    });

    /* Le gérant doit voir la vente du responsable : elle passe donc par le
       serveur avant qu'il ouvre sa session. */
    await attendreLaFileVide(page, 60_000);

    await page.goto("/parametres/utilisateurs", { waitUntil: "load" });
    const email = emailUnique("caisse");
    const motDePasse = "gerant-caisse-001";
    await page.getByRole("button", { name: "Créer un compte" }).click();
    const creation = page.getByRole("dialog");
    await creation.getByLabel("Nom", { exact: true }).fill("Gérant de caisse");
    await creation.getByLabel("Adresse e-mail").fill(email);
    await creation.getByLabel("Mot de passe provisoire").fill(motDePasse);
    await creation.getByLabel("Boutique").selectOption(terrain.code);
    await creation.getByRole("button", { name: /Créer le compte/ }).click();
    await expect(contenu(page).getByRole("status")).toContainText("Compte créé", {
      timeout: 30_000,
    });

    /* Le second navigateur lit le **serveur**, pas le cache du premier : tant
       que la file d'écritures n'est pas vide, il ne verra rien de ce que le
       décor vient de fabriquer, et l'échec accusera les droits (D97). */
    await attendreLaFileVide(page);

    const contexteGerant = await browser.newContext();
    const pageGerant = await contexteGerant.newPage();
    await seConnecter(pageGerant, email, motDePasse);
    await pageGerant.waitForURL("**/dashboard");

    await pageGerant.goto("/caisse", { waitUntil: "load" });
    await expect(contenu(pageGerant).locator("tbody tr").filter({ hasText: numero })).toBeVisible({
      timeout: 30_000,
    });

    /**
     * **La saisie a déménagé en S55, et ce témoin suit.**
     *
     * Elle vivait dans le journal de caisse ; le commanditaire l'a voulue
     * ailleurs — « l'enregistrement de toutes les dépenses doit se faire dans
     * poste de dépenses, avec l'historique et tout », et « dans la caisse c'est
     * juste le montant total qui doit figurer ». Ce que le test protégeait ne
     * change pas : la dépense s'inscrit, elle se lit en négatif, et le journal
     * la compte. Seul l'écran où on la saisit a changé.
     */
    await pageGerant.goto("/caisse/depenses", { waitUntil: "load" });

    /* Le poste n'existe pas encore : le gérant le tape, et il se crée au
       passage. C'est tout l'intérêt — une course imprévue ne doit pas attendre
       le responsable pour être tracée, et les règles l'autorisent. Le champ est
       libre depuis S55 : le menu et son bouton « Ajouter » demandaient trois
       gestes pour écrire un mot. */
    await pageGerant.locator("#depense-poste").fill("Carburant");

    await pageGerant.getByLabel("Montant", { exact: true }).fill("15000");
    await pageGerant.getByLabel("À quoi").fill("Carburant du groupe");
    await pageGerant.getByRole("button", { name: "Enregistrer la dépense" }).click();

    const sortie = contenu(pageGerant)
      .locator("tbody tr")
      .filter({ hasText: "Carburant du groupe" });
    await expect(sortie).toBeVisible({ timeout: 30_000 });
    /* Le poste range la dépense : c'est lui qui répond à « combien de carburant
       ce mois-ci », et sans lui le livre retombe au rang de journal. */
    await expect(sortie).toContainText("Carburant");
    /* Le signe accepte les deux caractères, et ce n'est pas de la complaisance :
       `Intl` rend un vrai moins typographique (U+2212) sous Chromium et un
       trait d'union sous Node, parce que les deux n'embarquent pas la même
       version d'ICU. Figer celui de la machine qui écrit le test le ferait
       tomber sur l'autre — et l'échec accuserait le produit, qui n'y est pour
       rien.

       L'espace après le signe est facultative pour la même raison : l'historique
       des dépenses écrit « − 15 000 », le journal « −15 000 ». Deux écrans, un
       seul fait à prouver — le montant sort du tiroir. */
    await expect(sortie).toContainText(/[−-]\s*15\s000/);

    /* **Le journal de caisse la compte quand même.** Une dépense reste un
       mouvement de caisse : elle a quitté l'écran de saisie, pas le tiroir. */
    await pageGerant.goto("/caisse", { waitUntil: "load" });
    const auJournal = contenu(pageGerant)
      .locator("tbody tr")
      .filter({ hasText: "Carburant du groupe" });
    await expect(auJournal).toBeVisible({ timeout: 30_000 });
    await expect(auJournal).toContainText("Sortie");
    await expect(auJournal).toContainText(/[−-]\s*15\s000/);
    await expect(contenu(pageGerant)).toContainText("2 mouvements");

    /**
     * **Le responsable saisit lui aussi, et c'est l'inverse de ce que ce test
     * affirmait.**
     *
     * Il vérifiait que le bouton lui était refusé. Les règles Firestore, elles,
     * l'autorisaient depuis toujours — `encaissements` crée sous
     * `peutVendrePour`, qui vaut responsable **ou** gérant de la boutique. Un
     * responsable travaillant dans une de ses boutiques prenait donc un billet
     * pour du carburant sans qu'aucun écran ne le lui laisse écrire, et le
     * mouvement devenait un trou. Le commanditaire a tranché en une phrase :
     * « ce qui compte est de rendre tout traçable ».
     */
    await page.goto("/caisse/depenses", { waitUntil: "load" });
    await expect(
      contenu(page).locator("tbody tr").filter({ hasText: "Carburant du groupe" }),
    ).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole("button", { name: "Enregistrer la dépense" })).toHaveCount(1);

    /* **Réseau coupé, le formulaire rend la main** (D76, et le défaut que S27 a
       trouvé). Il attendait l'accusé de réception du serveur : hors ligne, la
       promesse de Firestore ne se résout jamais, le bouton restait désactivé et
       les champs pleins — pour une écriture pourtant déjà acquise au cache. Le
       gérant ne pouvait plus saisir la sortie suivante.

       Les deux sens de D79 : la ligne apparaît **et** le formulaire redevient
       disponible. Vérifier l'un sans l'autre laissait passer le défaut. */
    await pageGerant.goto("/caisse/depenses", { waitUntil: "load" });
    await expect(pageGerant.getByRole("button", { name: "Enregistrer la dépense" })).toBeVisible({
      timeout: 30_000,
    });
    await contexteGerant.setOffline(true);
    await expect(bandeauEtat(pageGerant)).toContainText("Hors ligne", { timeout: 30_000 });

    /* Le même poste, retapé : `trouverParNom` le reconnaît au lieu d'en créer
       un second, et la dépense se range sous celui qui existe déjà. */
    await pageGerant.locator("#depense-poste").fill("Carburant");
    await pageGerant.getByLabel("Montant", { exact: true }).fill("2500");
    await pageGerant.getByLabel("À quoi").fill("Course au marché");
    await pageGerant.getByRole("button", { name: "Enregistrer la dépense" }).click();

    await expect(
      contenu(pageGerant).locator("tbody tr").filter({ hasText: "Course au marché" }),
    ).toBeVisible({ timeout: 20_000 });
    await expect(pageGerant.getByLabel("Montant", { exact: true })).toHaveValue("");
    await expect(pageGerant.getByRole("button", { name: "Enregistrer la dépense" })).toBeEnabled();

    await contexteGerant.setOffline(false);
    await contexteGerant.close();
  });
});

test.describe("la dépense en vue entreprise", () => {
  test("le responsable la saisit depuis « Toutes les boutiques », et elle tombe dans le tiroir qu’il désigne", async ({
    page,
  }) => {
    await seConnecterEtEntrer(page);
    const terrain = await preparerTerrain(page);

    /**
     * **L'écran que le commanditaire a photographié.**
     *
     * En vue entreprise, les dépenses n'avaient pas de formulaire du tout —
     * seulement une phrase renvoyant au sélecteur du bandeau. « Je ne vois pas
     * le formulaire d'enregistrement de dépenses », et il avait raison : on
     * atterrit ici pour saisir, pas pour apprendre où aller saisir.
     */
    await selecteurPerimetre(page).selectOption("");
    await page.goto("/caisse/depenses", { waitUntil: "load" });

    const enregistrer = page.getByRole("button", { name: "Enregistrer la dépense" });
    await expect(enregistrer).toBeVisible();

    /* **Le tiroir ne se devine pas.** Trois boutiques, trois caisses : une
       dépense sans boutique tomberait dans celle d'un gérant qui n'y est pour
       rien, et fausserait son compte sans que rien ne l'explique. */
    /* **Sans détail, et c'est le point (S55).** Le champ « À quoi » est
       facultatif depuis que le poste porte la raison de la sortie : l'exiger
       faisait retaper « loyer » sous un poste nommé « Loyer », et le
       commanditaire ne distinguait plus les deux champs. Ce témoin passe donc
       par le chemin le plus court — poste, montant, rien d'autre. */
    await page.locator("#depense-poste").fill("Transport");
    await page.getByLabel("Montant", { exact: true }).fill("7000");
    await enregistrer.click();
    await expect(contenu(page)).toContainText("Choisissez la boutique dont le tiroir paie");

    await page.locator("#depense-boutique").selectOption(terrain.code);
    await enregistrer.click();

    const ligne = contenu(page).locator("tbody tr").filter({ hasText: "Transport" });
    await expect(ligne).toBeVisible({ timeout: 30_000 });
    await expect(ligne).toContainText(/[−-]\s*7\s000/);

    /**
     * **La consolidation, et c'est la demande mot pour mot** : « il faut
     * consolider toutes les dépenses dans la caisse du gérant ». Saisie depuis
     * la vue entreprise, la dépense doit se retrouver dans le journal de la
     * boutique désignée — pas dans un pot commun que personne ne tient.
     */
    await attendreLaFileVide(page);
    await selecteurPerimetre(page).selectOption(terrain.code);
    await page.goto("/caisse", { waitUntil: "load" });
    const auJournal = contenu(page).locator("tbody tr").filter({ hasText: "Transport" });
    await expect(auJournal).toBeVisible({ timeout: 30_000 });
    await expect(auJournal).toContainText("Sortie");
    /* **Le poste prend la place du détail dans la colonne « Objet ».** Sans ce
       repli, rendre le détail facultatif aurait fait afficher un tiret : le
       journal aurait perdu la raison de la sortie à l'instant même où l'écran
       de saisie cessait de l'exiger. */
    await expect(auJournal).toContainText("Transport");
  });
});
