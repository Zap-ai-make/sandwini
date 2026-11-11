import { expect, test, type Page } from "@playwright/test";
import { seConnecterEtEntrer } from "./aide";

/**
 * Les écrans d'un espace, atteints au doigt (11 novembre 2026).
 *
 * **Pourquoi ce test n'existait pas, et pourquoi le défaut est passé.** Toute la
 * suite tourne sur un Pixel 7, mais ses tests ouvrent chaque écran par son
 * adresse (`page.goto`). Ils ne pouvaient donc pas voir qu'un téléphone n'y
 * menait plus : la colonne des écrans s'efface sous 1024 px, et les
 * pages-sommaires qui la relayaient avaient disparu. Le commanditaire l'a vu à
 * notre place — « dans Paramètres on ne voit que l'identité ».
 *
 * Ici, aucun `goto` après l'arrivée : on navigue comme quelqu'un qui tient le
 * téléphone, par la barre d'espaces et la barre des écrans.
 */

const barreEcrans = (page: Page) => page.getByRole("button", { name: /^Écrans de l’espace/ });

test("sur téléphone, les écrans des paramètres s’atteignent au doigt", async ({ page }) => {
  await seConnecterEtEntrer(page);

  await page
    .getByRole("navigation", { name: "Navigation principale" })
    .getByRole("link", { name: "Paramètres" })
    .click();
  await page.waitForURL("**/parametres/entreprise");
  await expect(barreEcrans(page)).toHaveAccessibleName(
    "Écrans de l’espace Paramètres — Identité de l’entreprise",
  );

  await barreEcrans(page).click();
  const panneau = page.getByRole("dialog", { name: "Paramètres" });
  await expect(panneau.getByRole("link", { name: "Identité de l’entreprise" })).toHaveAttribute(
    "aria-current",
    "page",
  );
  /* Les deux gestes qui manquaient, et ceux du pied que le rail cache sur
     téléphone. */
  await expect(panneau.getByRole("button", { name: "Se déconnecter" })).toBeVisible();
  await panneau.getByRole("link", { name: "Utilisateurs" }).click();

  await page.waitForURL("**/parametres/utilisateurs");
  await expect(panneau).toBeHidden();
  await expect(page.getByRole("button", { name: "Créer un compte" })).toBeVisible();

  await barreEcrans(page).click();
  await page.getByRole("dialog", { name: "Paramètres" }).getByRole("link", { name: "Boutiques" }).click();
  await page.waitForURL("**/parametres/boutiques");
  await expect(barreEcrans(page)).toHaveAccessibleName("Écrans de l’espace Paramètres — Boutiques");
});

test("sur grand écran, la barre des écrans laisse la place à la colonne", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await seConnecterEtEntrer(page);
  await expect(barreEcrans(page)).toBeHidden();
});
