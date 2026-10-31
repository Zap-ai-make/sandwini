import { expect, test } from "@playwright/test";
import { attendreLaFileVide, contenu, seConnecterEtEntrer, vendre } from "./aide";

/**
 * Annuler une vente (S25), de bout en bout.
 *
 * Ce que ce témoin garde, c'est ce qu'aucun test unitaire ne voit : que le lot
 * écrit par l'écran passe **les vraies règles**, et qu'il produise bien les
 * trois effets promis au commanditaire — la vente marquée annulée et figée, la
 * moto rendue au stock, l'argent ressorti de la caisse. Les règles seules
 * sont prouvées par `regles/annulation-vente.test.ts`, le calcul par
 * `lib/domain/annulation-vente.test.ts`.
 */

test.beforeEach(({}, informations) => {
  informations.setTimeout(180_000);
});

test("annuler une vente rend la moto au stock et l’argent à la caisse", async ({ page }) => {
  await seConnecterEtEntrer(page);
  const { chassis } = await vendre(page, {
    mode: "Crédit",
    prix: "1200000",
    encaisse: "400000",
  });

  const fiche = contenu(page).getByRole("complementary");
  await fiche.getByRole("button", { name: "Annuler la vente" }).click();

  const fenetre = page.getByRole("dialog", { name: /Annuler la vente/ });
  /* La conséquence s'annonce avant le geste : ce qui sortira de la caisse. */
  await expect(fenetre).toContainText("400 000 FCFA");

  /* Le motif est obligatoire : sans lui, rien ne part. */
  await fenetre.getByRole("button", { name: "Annuler la vente" }).click();
  await expect(fenetre).toContainText("le motif est obligatoire");

  await fenetre.getByLabel("Motif").fill("Le client s’est rétracté");
  await fenetre.getByRole("button", { name: "Annuler la vente" }).click();
  await expect(fenetre).toHaveCount(0);

  /* **Après la file vide, et pas avant.** L'écran voit l'annulation dans son
     cache dès le clic ; seul le serveur dit si les règles l'ont acceptée. Un
     refus ferait revenir la vente à son état d'avant, et la mention
     disparaîtrait. */
  await attendreLaFileVide(page);
  await expect(fiche).toContainText("Vente annulée");
  await expect(fiche).toContainText("Le client s’est rétracté");
  await expect(fiche.getByRole("button", { name: "Annuler la vente" })).toHaveCount(0);
  await expect(fiche.getByRole("link", { name: "Modifier" })).toHaveCount(0);

  /* L'argent ressort, par le même moyen, sous sa nature. */
  await page.goto("/caisse", { waitUntil: "load" });
  const sortie = contenu(page).locator("tbody tr").filter({ hasText: "Vente annulée" });
  await expect(sortie).toContainText("400 000", { timeout: 30_000 });
  await expect(sortie).toContainText("Espèces");

  /* La moto est de nouveau vendable. */
  await page.goto("/motos", { waitUntil: "load" });
  await page.getByLabel("Chercher dans le stock").fill(chassis.slice(-6));
  const ligne = contenu(page).locator("tbody tr").filter({ hasText: chassis });
  await expect(ligne).toContainText("En stock", { timeout: 30_000 });
});
