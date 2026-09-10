import { expect, test, type Page } from "@playwright/test";
import {
  bandeauEtat,
  contenu,
  emailUnique,
  preparerTerrain,
  seConnecter,
  seConnecterEtEntrer,
  vendre,
} from "./aide";

/**
 * Les chiffres du mois (S24, `c3-supervision-chiffres.html`).
 *
 * Ce que cette suite protège n'est pas « l'écran s'affiche » : c'est **le sens
 * des quatre nombres**, c'est-à-dire les trois arbitrages que le commanditaire
 * a rendus et qui ne se relisent nulle part ailleurs dans le code exécuté.
 *
 * 1. **La marge est entière au mois de la vente**, et la carte doit dire
 *    qu'elle n'est pas de l'argent en caisse. Sans cette ligne, le choix
 *    devient un mensonge tranquille — c'est la spec qui l'écrit ainsi.
 * 2. **Créances et dépôts ne se totalisent jamais.** Deux lignes, jamais trois :
 *    un client qui doit de l'argent au magasin et un magasin qui détient
 *    l'argent d'un client sont deux situations opposées, et leur somme ne
 *    désigne rien. Le test compte les valeurs de la carte, parce que c'est la
 *    seule façon de vérifier qu'une troisième n'est pas réapparue.
 * 3. **Un mois vide s'écrit en une phrase**, pas en quatre zéros alignés (D63).
 *
 * S'y ajoute la frontière que S24 ne doit pas percer : un gérant n'entre pas
 * ici. La marge de l'entreprise n'est pas masquée à son écran, elle est hors de
 * portée de son compte (D2) — et la garde le lui dit au lieu de le rediriger.
 */

/* Même raison qu'en S8 et S9 : le décor — boutique, référentiels, moto, client,
   vente — consomme l'essentiel du budget, et chaque étape passe par
   l'interface. Les assertions gardent leur propre budget.

   Cinq minutes et non trois : ce fichier ajoute au décor l'attente de la
   synchronisation, sans laquelle la marge n'est pas encore écrite. Le décor
   seul a dépassé quatre minutes une fois, sur une machine qui tenait en même
   temps les émulateurs, une compilation et le serveur — mesuré, pas supposé. */
test.beforeEach(({}, informations) => {
  informations.setTimeout(300_000);
});

/**
 * La section « Le mois » : les quatre cartes, et rien d'autre.
 *
 * Le nom est cherché sans égard à la casse : le titre de section s'affiche en
 * capitales par la feuille de style, et le nom accessible suit la casse rendue.
 */
function sectionDuMois(page: Page) {
  return contenu(page).getByRole("region", { name: /le mois/i });
}

/**
 * Une carte de la section, désignée par son intitulé — ancré en tête.
 *
 * Ancré, parce que `hasText` compare sans la casse : « Encaissé » se retrouve
 * dans « pas encore encaissée en totalité », et le filtre ramenait deux cartes
 * au lieu d'une.
 */
function carte(page: Page, nom: RegExp) {
  return sectionDuMois(page).locator(".cadre").filter({ hasText: nom });
}

test.describe("les chiffres du mois", () => {
  test("une vente à crédit se compte, s’encaisse et se doit — sans qu’aucun total ne les mélange", async ({
    page,
  }) => {
    await seConnecterEtEntrer(page);
    /* 1 200 000 convenus, 700 000 d'achat, 400 000 déposés le jour même : la
       vente laisse 800 000 de créance et 500 000 de marge. Trois nombres
       différents, qu'on doit retrouver à trois endroits différents. */
    await vendre(page, { mode: "Crédit", prix: "1200000", encaisse: "400000" });

    /* On attend que la file d'écritures soit vide avant d'ouvrir les chiffres,
       et ce n'est pas du confort de test : la marge est écrite par un
       déclencheur côté serveur, donc la vente doit d'abord y parvenir. Sans
       cette attente, l'écran s'ouvrait pendant que l'appareil téléversait
       encore, `getDoc` levait `unavailable`, et le test mesurait la reprise de
       connexion du SDK (D50, S27) au lieu de mesurer les chiffres. C'est ce
       qu'attend aussi le test de marge de S8, pour la même raison. */
    await expect(bandeauEtat(page)).toContainText("À jour", { timeout: 60_000 });

    /* Par le lien de la supervision, et non par l'URL : c'est le chemin du
       responsable, et un écran qu'on n'atteint que par l'adresse n'est pas
       atteint. */
    await page.goto("/supervision", { waitUntil: "load" });
    await page.getByRole("link", { name: "Voir les chiffres" }).click();
    await expect(page.getByRole("heading", { name: "Les chiffres", level: 1 })).toBeVisible();

    /* Le périmètre est la boutique que le décor vient de créer : elle ne
       contient que cette vente-là, et le compte est donc exactement un. C'est
       ce qui rend l'assertion possible dans une base que les autres suites
       remplissent en même temps. */
    await expect(carte(page, /^Motos vendues/).locator(".font-code")).toHaveText("1", {
      timeout: 30_000,
    });
    await expect(carte(page, /^Encaissé/).locator(".font-code")).toHaveText("400 000");

    /* Décision 2, et c'est le cœur de ce fichier. Deux valeurs dans la carte :
       la créance, puis les dépôts à zéro. Une troisième signifierait qu'un
       total est revenu. */
    const restant = carte(page, /^Reste à percevoir/);
    await expect(restant.locator("dd")).toHaveCount(2);
    await expect(restant.locator("dd").first()).toHaveText("800 000");
    await expect(restant.locator("dd").last()).toHaveText("0");
    await expect(restant).toContainText("Créances");
    await expect(restant).toContainText("Dépôts");
    await expect(restant).not.toContainText("Total");

    /* Décision 1. La marge est écrite par un déclencheur côté serveur, dans un
       document que seul le responsable peut lire : elle arrive après la vente,
       et la carte affiche « — » en attendant plutôt que zéro. D'où le délai —
       ce qu'on vérifie, c'est qu'elle arrive, pas en combien de temps. */
    const marge = carte(page, /^Marge brute/);
    await expect(marge.locator(".font-code")).toHaveText("500 000", { timeout: 60_000 });
    /* Et la phrase sans laquelle le choix A serait un mensonge : la vente est à
       crédit, donc cette marge n'est pas en caisse. */
    await expect(marge).toContainText("acquise à la vente, pas encore encaissée en totalité");
  });

  test("un mois sans rien l’écrit en une phrase, et n’aligne pas quatre zéros", async ({ page }) => {
    await seConnecterEtEntrer(page);
    await page.goto("/supervision/chiffres", { waitUntil: "load" });

    /* Six mois en arrière : aucune suite ne date une vente d'autre chose que
       du jour même, donc ce mois-là est vide quoi qu'aient fait les autres
       tests de l'exécution. */
    await page.getByLabel("Mois affiché").selectOption({ index: 6 });

    await expect(contenu(page)).toContainText("Aucune vente en", { timeout: 30_000 });
    /* La preuve que c'est bien une phrase à la place des cartes, et non une
       phrase en plus : la section des quatre chiffres n'existe pas. */
    await expect(sectionDuMois(page)).toHaveCount(0);
  });

  test("un gérant n’entre pas dans les chiffres, et on lui dit pourquoi", async ({
    page,
    browser,
  }) => {
    await seConnecterEtEntrer(page);
    /* Une boutique suffit à rattacher un gérant : ce test-là ne regarde pas
       des chiffres, il regarde une porte. Passer par `vendre` faisait payer une
       moto, un client et une vente pour rien — et la première exécution a
       dépassé son budget avant même d'atteindre l'assertion. */
    const terrain = await preparerTerrain(page);

    await page.goto("/parametres/utilisateurs", { waitUntil: "load" });
    const email = emailUnique("chiffres");
    const motDePasse = "gerant-chiffres-001";
    const creation = page.locator("form").filter({
      has: page.getByRole("button", { name: /Créer le compte/ }),
    });
    await creation.getByLabel("Nom", { exact: true }).fill("Gérant des chiffres");
    await creation.getByLabel("Adresse e-mail").fill(email);
    await creation.getByLabel("Mot de passe provisoire").fill(motDePasse);
    await creation.getByLabel("Boutique").selectOption(terrain.code);
    await creation.getByRole("button", { name: /Créer le compte/ }).click();
    /* La confirmation de la fonction, pas la liste des comptes : même raison
       qu'en S8 — la liste vient d'un écouteur que ce navigateur n'a jamais mis
       en cache, et elle répond vide quand la file d'écritures est encore
       encombrée. */
    await expect(contenu(page).getByRole("status")).toContainText("Compte créé", {
      timeout: 30_000,
    });

    const contexteGerant = await browser.newContext();
    const pageGerant = await contexteGerant.newPage();
    await seConnecter(pageGerant, email, motDePasse);
    await pageGerant.waitForURL("**/dashboard");

    /* Par l'adresse directe, parce que c'est le seul chemin qui lui reste : la
       supervision ne figure pas dans sa coquille. Un lien reçu, un onglet
       gardé ouvert — la garde doit tenir là aussi. */
    await pageGerant.goto("/supervision/chiffres", { waitUntil: "load" });
    await expect(contenu(pageGerant)).toContainText("Réservé au responsable", { timeout: 30_000 });
    /* Ni la marge de l'entreprise, ni la moindre carte : le refus remplace
       l'écran, il ne le voile pas. */
    await expect(sectionDuMois(pageGerant)).toHaveCount(0);
    await expect(contenu(pageGerant)).not.toContainText("Marge brute");

    await contexteGerant.close();
  });
});
