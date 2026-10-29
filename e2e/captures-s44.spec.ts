import { expect, test } from "@playwright/test";
import {
  chassisUnique,
  choisirDansLaListe,
  contenu,
  creerClientDepuisLeFichier,
  nomUnique,
  preparerTerrain,
  saisirMoto,
  seConnecterEtEntrer,
} from "./aide";

/**
 * Captures de S44, en clair et en sombre, au téléphone et au bureau.
 *
 * C'est la « règle 5 » d'`AGENTS.md` — regarder le rendu —, et ce n'est pas une
 * garantie : c'est un œil. Ce que les tests ne voient pas se voit ici, et le
 * dépôt en a la preuve deux fois plutôt qu'une (D77 : un reçu s'imprimait blanc
 * sur nuit depuis une machine réglée en sombre, et aucune capture d'écran
 * ordinaire ne l'aurait montré ; D84 : un écran confronté à sa maquette n'a pas
 * été confronté à ses données).
 *
 * Quatre écrans, deux thèmes, deux largeurs : la modale de vente (vide, puis
 * remplie), les chiffres de tête, l'entrée d'une moto — où le champ Modèle ne
 * doit plus paraître verrouillé — et les réglages, qui n'ont pas le même
 * contenu selon la largeur.
 *
 * `captures/` est ignoré par git : ces images ne sont pas un livrable, elles
 * sont là pour être regardées une fois.
 */

const BUREAU = { width: 1440, height: 1000 };
const TELEPHONE = { width: 390, height: 844 };

/** Pose le thème comme le fait la bascule du produit, puis laisse peindre. */
async function poserLeTheme(page: import("@playwright/test").Page, theme: "clair" | "sombre") {
  await page.evaluate((valeur) => {
    document.documentElement.dataset.theme = valeur;
  }, theme);
}

test("captures de la refonte S44", async ({ page }) => {
  test.setTimeout(300_000);

  await page.setViewportSize(BUREAU);
  await seConnecterEtEntrer(page);
  const terrain = await preparerTerrain(page);

  const chassis = chassisUnique("CAPS44");
  await saisirMoto(page, terrain, chassis, { prixAchat: "700000", conseille: "1200000" });

  const client = nomUnique("Ouédraogo");
  await creerClientDepuisLeFichier(page, client, `78${String(Date.now()).slice(-6)}`);

  for (const theme of ["clair", "sombre"] as const) {
    for (const [nomLargeur, largeur] of [
      ["bureau", BUREAU],
      ["telephone", TELEPHONE],
    ] as const) {
      await page.setViewportSize(largeur);

      /* La modale vide : c'est l'état qu'on voit le plus souvent, et celui où
         les deux listes ne montrent rien tant qu'on n'a pas tapé. */
      await page.goto("/motos/ventes?nouvelle=1", { waitUntil: "load" });
      await poserLeTheme(page, theme);
      const modale = page.getByRole("dialog", { name: "Nouvelle vente" });
      await expect(modale).toBeVisible({ timeout: 30_000 });
      await page.screenshot({ path: `captures/s44-vente-vide-${theme}-${nomLargeur}.png` });

      // La même, remplie : le récapitulatif porte la conséquence du mode.
      await page.getByLabel("Chercher dans le stock").fill(chassis);
      await page.getByRole("radio", { name: new RegExp(chassis) }).check();
      await page.getByLabel("Chercher un client").fill(client);
      await page.getByRole("radio", { name: new RegExp(client) }).check();
      await choisirDansLaListe(page, "Mode de paiement", "Tranches");
      await page.getByLabel(/Montant reçu/).fill("300000");
      /* **Jamais `fullPage` sur une modale.** Le calque est en position fixe :
         `fullPage` étire la page entière, photographie la feuille à
         mi-défilement et lui ajoute un grand vide en dessous. L'image donnait à
         croire à un défaut de mise en page qui n'existait pas — constaté à la
         première passe de captures de S44. La fenêtre suffit, et elle montre en
         plus ce qui compte ici : la liste restée dessous, assombrie. */
      await page.screenshot({ path: `captures/s44-vente-remplie-${theme}-${nomLargeur}.png` });

      /* Le champ Modèle, celui qui paraissait verrouillé. On le photographie
         **sans marque choisie** : c'est l'état où le gris se lisait comme un
         refus, et c'est donc lui qu'il faut regarder. */
      await page.goto("/motos/nouvelle", { waitUntil: "load" });
      await poserLeTheme(page, theme);
      await expect(page.getByLabel("Modèle", { exact: true })).toBeVisible({ timeout: 30_000 });
      await page.screenshot({ path: `captures/s44-entree-moto-${theme}-${nomLargeur}.png` });

      /* Les réglages n'ont pas le même contenu selon la largeur, et c'est le
         point : le sommaire « Ce qui change » disparaît au-dessus de 1024 px,
         où la colonne de gauche le dit déjà. */
      await page.goto("/parametres", { waitUntil: "load" });
      await poserLeTheme(page, theme);
      await expect(contenu(page).getByRole("heading", { level: 1 })).toContainText("Réglages");
      await page.screenshot({
        path: `captures/s44-reglages-${theme}-${nomLargeur}.png`,
        fullPage: true,
      });
    }
  }

  /* Les chiffres de tête demandent une vente : on en enregistre une, puis on
     photographie le registre. */
  await page.setViewportSize(BUREAU);
  await page.goto("/motos/ventes?nouvelle=1", { waitUntil: "load" });
  await page.getByLabel("Chercher dans le stock").fill(chassis);
  await page.getByRole("radio", { name: new RegExp(chassis) }).check();
  await page.getByLabel("Chercher un client").fill(client);
  await page.getByRole("radio", { name: new RegExp(client) }).check();
  await choisirDansLaListe(page, "Mode de paiement", "Crédit");
  await page.getByLabel(/Montant reçu/).fill("500000");
  await page.getByRole("button", { name: "Enregistrer la vente" }).click();
  await expect(contenu(page).getByRole("status")).toContainText("Vente enregistrée", {
    timeout: 30_000,
  });
  const lien = page.getByRole("link", { name: "Voir la vente" });
  const adresseFiche = await lien.getAttribute("href");
  await lien.click();

  for (const theme of ["clair", "sombre"] as const) {
    await page.goto("/motos/ventes", { waitUntil: "load" });
    await poserLeTheme(page, theme);
    await expect(contenu(page)).toContainText("Chiffre d’affaires", { timeout: 30_000 });
    await page.screenshot({ path: `captures/s44-chiffres-${theme}.png` });

    // La fiche : « ce qui part avec la moto », dans sa forme S44.
    await page.goto(adresseFiche!, { waitUntil: "load" });
    await poserLeTheme(page, theme);
    await expect(contenu(page).getByRole("complementary")).toContainText("Carte grise", {
      timeout: 30_000,
    });
    await page.screenshot({ path: `captures/s44-fiche-vente-${theme}.png`, fullPage: true });
  }

  /**
   * Le reçu **sous média `print`**, et pas seulement à l'écran.
   *
   * Un écran qui a un rendu imprimé en a deux, et la capture ordinaire n'en
   * montre qu'un (`DESIGN.md` §14). Le thème est laissé en sombre exprès :
   * c'est exactement la machine depuis laquelle le reçu sortait blanc sur nuit
   * avant D77, et c'est donc le cas qui mérite l'œil.
   */
  await poserLeTheme(page, "sombre");
  await page.goto("/motos/ventes", { waitUntil: "load" });
  await poserLeTheme(page, "sombre");
  const premierRecu = contenu(page).getByRole("link").first();
  await premierRecu.click();
  await expect(contenu(page).getByRole("complementary").or(contenu(page))).toContainText("Reçu", {
    timeout: 30_000,
  });
  await page.emulateMedia({ media: "print" });
  await page.screenshot({ path: "captures/s44-recu-print.png", fullPage: true });
  await page.emulateMedia({ media: "screen" });
});
