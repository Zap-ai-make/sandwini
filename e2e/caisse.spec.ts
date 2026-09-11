import { expect, test } from "@playwright/test";
import {
  attendreLaFileVide,
  bandeauEtat,
  contenu,
  emailUnique,
  seConnecter,
  seConnecterEtEntrer,
  vendre,
} from "./aide";

/**
 * La caisse — le journal du jour (S22).
 *
 * Ce que cette suite protège tient en deux affirmations, et aucune ne se relit
 * ailleurs dans le code exécuté :
 *
 * 1. **Un versement encaissé au comptoir apparaît dans le journal du jour**, à
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
    await expect(page.getByRole("heading", { name: /Journal du jour/, level: 1 })).toBeVisible();

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
    /* Cinq cellules, et non six : la colonne « Pièce » a été retirée parce
       qu'elle ne pouvait afficher qu'un identifiant Firestore. Compter les
       cellules est ce qui garde le défaut fermé — une colonne qui revient se
       voit ici avant de se voir à l'écran. */
    await expect(ligne.locator("td")).toHaveCount(5);
    await expect(ligne).toContainText(`Vente ${numero}`);

    /* Le montant entré se lit sur sa ligne, et c'est tout ce que le journal
       promet : il ne totalise plus rien depuis que la clôture est partie
       (D87). Un total attendu sans personne pour le comparer au tiroir n'est
       un total pour personne. */
    await expect(ligne).toContainText("400 000");
  });
});

test.describe("la sortie d’espèces", () => {
  test("le gérant sort des espèces de sa boutique, et le journal les compte en moins", async ({
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
    await expect(bandeauEtat(page)).toContainText("À jour", { timeout: 60_000 });

    await page.goto("/parametres/utilisateurs", { waitUntil: "load" });
    const email = emailUnique("caisse");
    const motDePasse = "gerant-caisse-001";
    const creation = page.locator("form").filter({
      has: page.getByRole("button", { name: /Créer le compte/ }),
    });
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

    /* Réponse 2 : une sortie d'espèces se saisit, et elle s'inscrit au journal
       en négatif — c'est ainsi qu'on lit une colonne de caisse. */
    await pageGerant.getByLabel("Montant", { exact: true }).fill("15000");
    await pageGerant.getByLabel("À quoi").fill("Carburant du groupe");
    await pageGerant.getByRole("button", { name: "Enregistrer la sortie" }).click();

    const sortie = contenu(pageGerant)
      .locator("tbody tr")
      .filter({ hasText: "Carburant du groupe" });
    await expect(sortie).toBeVisible({ timeout: 30_000 });
    await expect(sortie).toContainText("Sortie");
    /* Le signe accepte les deux caractères, et ce n'est pas de la complaisance :
       `Intl` rend un vrai moins typographique (U+2212) sous Chromium et un
       trait d'union sous Node, parce que les deux n'embarquent pas la même
       version d'ICU. Figer celui de la machine qui écrit le test le ferait
       tomber sur l'autre — et l'échec accuserait le produit, qui n'y est pour
       rien. */
    await expect(sortie).toContainText(/[−-]15\s000/);
    await expect(contenu(pageGerant)).toContainText("2 mouvements");

    /* Le responsable lit le journal de cette boutique, et n'y saisit pas : la
       sortie d'espèces appartient à qui tient le tiroir. */
    await page.goto("/caisse", { waitUntil: "load" });
    await expect(
      contenu(page).locator("tbody tr").filter({ hasText: "Carburant du groupe" }),
    ).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole("button", { name: "Enregistrer la sortie" })).toHaveCount(0);

    /* **Réseau coupé, le formulaire rend la main** (D76, et le défaut que S27 a
       trouvé). Il attendait l'accusé de réception du serveur : hors ligne, la
       promesse de Firestore ne se résout jamais, le bouton restait désactivé et
       les champs pleins — pour une écriture pourtant déjà acquise au cache. Le
       gérant ne pouvait plus saisir la sortie suivante.

       Les deux sens de D79 : la ligne apparaît **et** le formulaire redevient
       disponible. Vérifier l'un sans l'autre laissait passer le défaut. */
    await contexteGerant.setOffline(true);
    await expect(bandeauEtat(pageGerant)).toContainText("Hors ligne", { timeout: 30_000 });

    await pageGerant.getByLabel("Montant", { exact: true }).fill("2500");
    await pageGerant.getByLabel("À quoi").fill("Course au marché");
    await pageGerant.getByRole("button", { name: "Enregistrer la sortie" }).click();

    await expect(
      contenu(pageGerant).locator("tbody tr").filter({ hasText: "Course au marché" }),
    ).toBeVisible({ timeout: 20_000 });
    await expect(pageGerant.getByLabel("Montant", { exact: true })).toHaveValue("");
    await expect(pageGerant.getByRole("button", { name: "Enregistrer la sortie" })).toBeEnabled();

    await contexteGerant.setOffline(false);
    await contexteGerant.close();
  });
});
