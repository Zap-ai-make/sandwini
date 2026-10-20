import { expect, test, type Page } from "@playwright/test";
import {
  attendreLaFileVide,
  contenu,
  creerPrestataire,
  nomUnique,
  preparerTerrain,
  seConnecter,
  seConnecterEtEntrer,
  emailUnique,
  vendreDansLeTerrain,
} from "./aide";

/**
 * Les papiers d'une moto, regardés (S53) — la « règle 5 ».
 *
 * Ce n'est pas une garantie, c'est un œil. Les témoins de S53 prouvent que
 * l'état d'un papier se calcule au bon endroit ; aucun d'eux ne dit si l'écran
 * est lisible au comptoir, en plein soleil, sur un Android d'entrée de gamme.
 * Ce fichier photographie les écrans neufs ou refaits, **en clair et en
 * sombre**, en mobile et en bureau, et **des deux rôles** — c'était le dernier
 * critère non coché de la spec.
 *
 * Il se lance à la demande, jamais dans la passe courante : il coûte un décor
 * complet — un terrain, deux motos, deux clients, deux ventes, un paquet — et
 * ne rend aucun verdict qu'un autre test ne rende déjà.
 */

const DOSSIER = "captures/s53";

/* Le Pixel 7 du projet Playwright est déjà le terrain réel. Le bureau n'est là
   que pour les écrans que le responsable lit assis — les dossiers et
   l'inventaire, qui sont des tableaux. */
const BUREAU = { width: 1440, height: 1000 };
const MOBILE = { width: 412, height: 915 };

/**
 * Les valeurs du produit : « clair » / « sombre » sur `dataset.theme`
 * (`BasculeTheme`). **À reposer après chaque navigation** — un `goto` reconstruit
 * le document, et le thème forcé s'en va avec.
 */
const forcerTheme = (page: Page, theme: "clair" | "sombre") =>
  page.evaluate((valeur) => {
    document.documentElement.dataset.theme = valeur;
  }, theme);

/**
 * `animations: "disabled"` partout, et ce n'est pas un détail.
 *
 * Sans lui, la première prise d'une modale attrape la feuille en pleine montée
 * et la montre **translucide**, le contenu de la page transparaissant au
 * travers : un défaut du harnais qu'on prend pour un défaut du produit. Une
 * demi-heure perdue le 8 octobre 2026.
 */
const photo = (page: Page, nom: string) =>
  page.screenshot({ path: `${DOSSIER}/${nom}.png`, fullPage: true, animations: "disabled" });

/* Le décor est le plus lourd de la suite : il traverse tout le trajet d'un
   papier, de l'entrée en stock au reçu. */
test.beforeEach(({}, informations) => {
  informations.setTimeout(900_000);
});

test("les papiers d’une moto, en clair et en sombre, des deux rôles", async ({
  page,
  browser,
  request,
}) => {
  await seConnecterEtEntrer(page);

  const prestataire = nomUnique("Ouedraogo");
  await creerPrestataire(page, prestataire);

  /* **Un prestataire d'avant S48, dont le type a cessé d'exister.** Le
     formulaire ne peut plus en fabriquer — le groupe de cases l'a quitté, et le
     type se pose implicitement. Mais la base en contient : des fiches nées avec
     `plaque` seul, que `estTypeDocument` filtre aujourd'hui à vide. C'est
     exactement ce que l'alerte de l'écran existe pour dire, et la seule façon
     honnête de la regarder est de reproduire une de ces fiches.

     L'écriture passe par l'API REST de l'émulateur avec le jeton `owner`, qui
     court-circuite les règles : écrire `plaque` est précisément ce que les
     règles refusent désormais, et c'est un passé qu'on rejoue, pas un geste du
     produit. */
  const ancien = nomUnique("Kabore");
  const reponse = await request.post(
    "http://127.0.0.1:8181/v1/projects/sdi-dev/databases/(default)/documents/prestataires",
    {
      headers: { Authorization: "Bearer owner" },
      data: {
        fields: {
          nom: { stringValue: ancien },
          telephone: { stringValue: "70445566" },
          typesDocuments: { arrayValue: { values: [{ stringValue: "plaque" }] } },
          actif: { booleanValue: true },
        },
      },
    },
  );
  expect(reponse.ok(), "la fiche d’avant S48 doit être posée").toBeTruthy();

  const terrain = await preparerTerrain(page);
  const premiere = await vendreDansLeTerrain(page, terrain, "CAP");
  /* **La seconde part en tranches, et c'est voulu.** « Crédit » livre la moto
     et la met `vendue` : l'inventaire a raison de ne plus la montrer, et la
     plaque y serait donc introuvable. « Tranches » la retient au magasin
     (`reservee`) — c'est précisément le cas où lire une plaque sert, puisque la
     moto est dans la cour. Cherché une heure le 16 octobre sur une capture qui
     accusait l'écran. */
  const seconde = await vendreDansLeTerrain(page, terrain, "CPB", { mode: "Tranches" });

  // ── 1. Les prestataires : le formulaire allégé, et la fiche signalée ───────
  await page.setViewportSize(MOBILE);
  await page.goto("/prestataires", { waitUntil: "load" });
  await expect(contenu(page).getByText(/n’est proposé nulle part/)).toBeVisible({
    timeout: 30_000,
  });
  await forcerTheme(page, "clair");
  await photo(page, "prestataires-mobile-clair");
  await forcerTheme(page, "sombre");
  await photo(page, "prestataires-mobile-sombre");

  // ── 2. La fiche d'une moto SANS LOT : elle garde ses cases ────────────
  /* Le bloc « Papiers en main » ne paraît plus que là (16 octobre 2026) : les
     motos d'un lot se cochent à l'inspection de ce lot. `vendreDansLeTerrain`
     fait entrer ses motos à l'unité, donc sans arrivage — c'est exactement le
     cas que ce bloc existe pour couvrir. */
  await page.goto("/motos", { waitUntil: "load" });
  await contenu(page).getByRole("link", { name: premiere.chassis }).click();
  await expect(contenu(page).getByText("Papiers en main")).toBeVisible({ timeout: 30_000 });
  await forcerTheme(page, "clair");
  await photo(page, "moto-papiers-manquants-mobile-clair");

  await page.getByLabel("Quittance", { exact: true }).click();
  await page.getByLabel("CMC", { exact: true }).click();
  await expect(contenu(page).getByText("Au magasin").first()).toBeVisible({ timeout: 30_000 });
  await photo(page, "moto-papiers-en-main-mobile-clair");
  await forcerTheme(page, "sombre");
  await photo(page, "moto-papiers-en-main-mobile-sombre");

  // ── 3. L'écran des dossiers : un état calculé, pas stocké ─────────────────
  await attendreLaFileVide(page);
  await page.goto("/motos/dossiers", { waitUntil: "load" });
  await expect(
    contenu(page).locator("tbody tr").filter({ hasText: premiere.numero }),
  ).toHaveCount(1, { timeout: 60_000 });
  await forcerTheme(page, "clair");
  await photo(page, "dossiers-mobile-clair");
  await forcerTheme(page, "sombre");
  await photo(page, "dossiers-mobile-sombre");

  await page.setViewportSize(BUREAU);
  await forcerTheme(page, "clair");
  await photo(page, "dossiers-bureau-clair");

  // ── 4. La sélection, et la barre qui dit combien de cartes partent ────────
  for (const numero of [premiere.numero, seconde.numero]) {
    const ligne = contenu(page).locator("tbody tr").filter({ hasText: numero });
    /* `click` et non `check` : la case est contrôlée par un état React que
       l'écoute Firestore alimente, et `check` vérifie l'état dans l'intervalle
       où React la remet sur la valeur reçue. */
    await ligne.getByRole("checkbox", { name: /Confier la carte grise/ }).click();
  }
  const barre = contenu(page).getByRole("button", { name: /Confier 2 cartes grises/ });
  await expect(barre).toBeVisible({ timeout: 30_000 });
  await photo(page, "dossiers-selection-bureau-clair");

  await page.setViewportSize(MOBILE);
  await photo(page, "dossiers-selection-mobile-clair");

  // ── 5. La modale du dépôt groupé ──────────────────────────────────────────
  await barre.click();
  const modale = page.getByRole("dialog");
  await modale.getByLabel("Prestataire").selectOption({ label: prestataire });
  await modale.getByLabel("Avance versée").fill("150000");
  await expect(modale).toContainText(premiere.numero);
  await modale.screenshot({
    path: `${DOSSIER}/paquet-modale-mobile-clair.png`,
    animations: "disabled",
  });
  await forcerTheme(page, "sombre");
  await modale.screenshot({
    path: `${DOSSIER}/paquet-modale-mobile-sombre.png`,
    animations: "disabled",
  });

  await page.setViewportSize(BUREAU);
  await forcerTheme(page, "clair");
  await modale.screenshot({
    path: `${DOSSIER}/paquet-modale-bureau-clair.png`,
    animations: "disabled",
  });

  // ── 6. Les paquets en cours, une fois le lot confié ───────────────────────
  await modale.getByRole("button", { name: "Confier le paquet" }).click();
  await expect(contenu(page)).toContainText("2 dehors sur 2", { timeout: 60_000 });
  await photo(page, "paquets-en-cours-bureau-clair");

  await page.setViewportSize(MOBILE);
  await photo(page, "paquets-en-cours-mobile-clair");
  await forcerTheme(page, "sombre");
  await photo(page, "paquets-en-cours-mobile-sombre");

  // ── 7. « Les papiers du client » sur la fiche de vente ────────────────────
  await forcerTheme(page, "clair");
  await contenu(page).getByRole("link", { name: premiere.numero }).click();
  await expect(contenu(page).getByLabel("Quittance emportée")).toBeVisible({ timeout: 30_000 });
  await photo(page, "vente-papiers-mobile-clair");

  /* Les deux cases s'ouvrent parce que la moto porte les papiers : c'est la
     chaîne entière, de l'arrivage au comptoir, en un écran. */
  await page.getByLabel("Quittance emportée").click();
  await page.getByLabel("CMC emporté").click();
  await expect(contenu(page).getByText("Emporté par le client").first()).toBeVisible({
    timeout: 30_000,
  });
  await photo(page, "vente-papiers-emportes-mobile-clair");
  await forcerTheme(page, "sombre");
  await photo(page, "vente-papiers-emportes-mobile-sombre");

  // ── 8. Le reçu dit ce que le client a emporté ─────────────────────────────
  await forcerTheme(page, "clair");
  await contenu(page).getByRole("link", { name: "Reçu de vente" }).click();
  await expect(contenu(page).getByText(/Papiers emport/)).toBeVisible({ timeout: 30_000 });
  await photo(page, "recu-mobile-clair");
  await forcerTheme(page, "sombre");
  await photo(page, "recu-mobile-sombre");

  // ── 9. Les cases fermées, et la plaque posée au retour ────────────────────
  /* La seconde vente n'a pas eu ses papiers cochés sur la moto : ses deux cases
     sont donc **fermées**, avec la phrase qui dit pourquoi. C'est l'état qu'un
     gérant voit le plus souvent, et il méritait d'être regardé autant que
     l'autre. */
  await forcerTheme(page, "clair");
  await page.goto("/motos/dossiers", { waitUntil: "load" });
  await forcerTheme(page, "clair");
  await contenu(page).getByRole("link", { name: seconde.numero }).click();
  await expect(contenu(page).getByLabel("Quittance emportée")).toBeDisabled({ timeout: 30_000 });
  await photo(page, "vente-papiers-fermes-mobile-clair");

  await page.getByLabel("Numéro de plaque").fill("11 AA 1234");
  await page.getByRole("button", { name: "Enregistrer la plaque" }).click();
  await expect(contenu(page).getByRole("button", { name: "Enregistrer la plaque" })).toBeDisabled({
    timeout: 30_000,
  });
  await photo(page, "vente-plaque-posee-mobile-clair");

  // ── 10. La plaque se relit dans l'inventaire, à côté du châssis ───────────
  await attendreLaFileVide(page);
  await page.setViewportSize(BUREAU);
  await page.goto("/motos/inventaire", { waitUntil: "load" });
  await forcerTheme(page, "clair");
  await expect(contenu(page).getByText("11 AA 1234")).toBeVisible({ timeout: 60_000 });
  await photo(page, "inventaire-plaque-bureau-clair");

  // ── 11. Le même écran, vu par le gérant ──────────────────────────────────
  /* **Les deux rôles, parce que ce ne sont pas les mêmes écrans.** Le gérant
     tient le comptoir : il confie les cartes et coche ce que le client emporte.
     Ce qu'il ne doit pas voir — les coûts, les marges — est muré ailleurs (D2),
     et c'est ce que cette capture laisse vérifier d'un coup d'œil. */
  await page.goto("/parametres/utilisateurs", { waitUntil: "load" });
  const email = emailUnique("captures");
  const motDePasse = "gerant-captures-0001";
  await page.getByRole("button", { name: "Créer un compte" }).click();
  const creation = page.getByRole("dialog");
  await creation.getByLabel("Nom", { exact: true }).fill("Gérant des papiers");
  await creation.getByLabel("Adresse e-mail").fill(email);
  await creation.getByLabel("Mot de passe provisoire").fill(motDePasse);
  await creation.getByLabel("Boutique").selectOption(terrain.code);
  await creation.getByRole("button", { name: /Créer le compte/ }).click();
  await expect(contenu(page).getByRole("status")).toContainText("Compte créé", {
    timeout: 30_000,
  });

  /* Le second navigateur lit le **serveur**, pas le cache du premier : tant que
     la file d'écritures n'est pas vide, il ne verrait rien du décor et la
     capture montrerait un écran vide (D97). */
  await attendreLaFileVide(page);

  const contexteGerant = await browser.newContext({ viewport: MOBILE });
  const pageGerant = await contexteGerant.newPage();
  await seConnecter(pageGerant, email, motDePasse);
  await pageGerant.waitForURL("**/dashboard");

  await pageGerant.goto("/motos/dossiers", { waitUntil: "load" });
  await expect(pageGerant.getByRole("heading", { level: 1 })).toBeVisible({ timeout: 60_000 });
  await forcerTheme(pageGerant, "clair");
  await photo(pageGerant, "dossiers-gerant-mobile-clair");
  await forcerTheme(pageGerant, "sombre");
  await photo(pageGerant, "dossiers-gerant-mobile-sombre");

  await pageGerant.goto("/motos", { waitUntil: "load" });
  await pageGerant.getByRole("link", { name: premiere.chassis }).click();
  await expect(pageGerant.getByText("Papiers en main")).toBeVisible({ timeout: 30_000 });
  await forcerTheme(pageGerant, "clair");
  await photo(pageGerant, "moto-gerant-mobile-clair");

  await contexteGerant.close();
});
