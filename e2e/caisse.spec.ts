import { expect, test, type Page } from "@playwright/test";
import {
  bandeauEtat,
  contenu,
  emailUnique,
  seConnecter,
  seConnecterEtEntrer,
  vendre,
} from "./aide";

/**
 * La caisse — journal du jour et clôture (S22).
 *
 * Ce que cette suite protège tient en trois affirmations, et aucune ne se
 * relit ailleurs dans le code exécuté :
 *
 * 1. **Un versement encaissé au comptoir apparaît dans le journal du jour**, à
 *    sa nature et à son moyen. C'est le lien entre S9 et S22 : les mouvements
 *    sont écrits depuis S8, et S22 se contente de les lire — si ce lien casse,
 *    le journal se vide sans que rien d'autre échoue.
 * 2. **Une sortie d'espèces baisse les espèces attendues** (réponse 2 du
 *    commanditaire). Sans elle, chaque billet sorti pour du carburant devient
 *    un écart inexpliqué le soir.
 * 3. **Une clôture ne se rejoue pas.** Une fois faite, l'écran ne propose plus
 *    le geste : il relit ce qui a été affirmé. Les règles Firestore refusent la
 *    réécriture — `regles/caisse.test.ts` le prouve à ce niveau-là ; ici on
 *    vérifie que l'écran ne promet pas ce que la base refuserait.
 *
 * **Ce que cette suite ne couvre pas, et pourquoi.** La fermeture automatique
 * d'une journée oubliée demande une journée passée avec des mouvements — donc
 * d'antidater des écritures, ce qu'aucun chemin de l'interface ne permet, et
 * c'est très bien ainsi. Elle est couverte par `lib/domain/caisse.test.ts` sur
 * le calcul, par `regles/caisse.test.ts` sur ce que la base accepte, et elle a
 * été regardée sur émulateurs semés : la veille laissée ouverte s'est fermée
 * seule, avec son écart à `null` et non à zéro.
 */

/* Même raison qu'en S8 et S9 : le décor consomme l'essentiel du budget, et
   chaque étape passe par l'interface. Le second test crée en plus un compte de
   gérant et ouvre une seconde session. */
test.beforeEach(({}, informations) => {
  informations.setTimeout(300_000);
});

/** Le panneau de droite, celui qui porte les totaux et le geste. */
function panneauCloture(page: Page) {
  return contenu(page).locator(".cadre").filter({ hasText: /^La clôture/ });
}

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

    /* Les espèces attendues, pour une première journée sans fonds reporté :
       exactement ce qui vient d'entrer. */
    await expect(panneauCloture(page)).toContainText("400 000");
    await expect(panneauCloture(page)).toContainText("Première journée de cette caisse");
  });
});

test.describe("clôturer sa journée", () => {
  test("le gérant sort des espèces, compte le tiroir, et ne peut plus rejouer sa clôture", async ({
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

    const contexteGerant = await browser.newContext();
    const pageGerant = await contexteGerant.newPage();
    await seConnecter(pageGerant, email, motDePasse);
    await pageGerant.waitForURL("**/dashboard");

    await pageGerant.goto("/caisse", { waitUntil: "load" });
    await expect(contenu(pageGerant).locator("tbody tr").filter({ hasText: numero })).toBeVisible({
      timeout: 30_000,
    });
    await expect(panneauCloture(pageGerant)).toContainText("400 000");

    /* Réponse 2 : une sortie d'espèces se saisit, et elle baisse ce qu'on
       s'attend à trouver dans le tiroir. 400 000 − 15 000 = 385 000. */
    await pageGerant.getByLabel("Montant", { exact: true }).fill("15000");
    await pageGerant.getByLabel("À quoi").fill("Carburant du groupe");
    await pageGerant.getByRole("button", { name: "Enregistrer la sortie" }).click();
    await expect(panneauCloture(pageGerant)).toContainText("385 000", { timeout: 30_000 });
    await expect(contenu(pageGerant)).toContainText("2 mouvements");

    /* Réponse 5 : un écart au-delà du seuil réclame une phrase. On compte
       380 000 là où 385 000 sont attendus — cinq mille de moins. */
    await pageGerant.getByLabel("Espèces comptées").fill("380000");
    await expect(panneauCloture(pageGerant)).toContainText("Manque de 5 000 FCFA");
    await pageGerant.getByRole("button", { name: "Clôturer la journée" }).click();
    await expect(panneauCloture(pageGerant)).toContainText("L’écart dépasse", { timeout: 15_000 });

    await pageGerant.getByLabel("D’où vient cet écart ?").fill("Monnaie rendue en trop, recomptée");
    await pageGerant.getByRole("button", { name: "Clôturer la journée" }).click();

    /* Ce qui prouve que la clôture est passée : le geste disparaît. Une
       affirmation ne se rejoue pas — et si l'écran l'offrait encore, il
       promettrait ce que les règles refusent. */
    await expect(panneauCloture(pageGerant)).toContainText("Clôturée par Gérant de caisse", {
      timeout: 30_000,
    });
    await expect(panneauCloture(pageGerant)).toContainText("Monnaie rendue en trop");
    await expect(
      pageGerant.getByRole("button", { name: "Clôturer la journée" }),
    ).toHaveCount(0);
    await expect(pageGerant.getByLabel("Espèces comptées")).toHaveCount(0);
    /* Et la journée close n'accepte plus de mouvement saisi à la main : le
       formulaire de sortie s'en va avec le reste. */
    await expect(pageGerant.getByRole("button", { name: "Enregistrer la sortie" })).toHaveCount(0);

    /* Le responsable lit cette clôture, et n'en fait pas (réponse 3). */
    await page.goto("/caisse", { waitUntil: "load" });
    await expect(panneauCloture(page)).toContainText("Clôturée par Gérant de caisse", {
      timeout: 30_000,
    });
    await expect(page.getByRole("button", { name: "Clôturer la journée" })).toHaveCount(0);

    await contexteGerant.close();
  });
});
