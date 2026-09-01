import { expect, test, type Page } from "@playwright/test";
import {
  bandeauEtat,
  codeUnique,
  creerBoutique,
  prendreLaMainEtMettreEnCache,
  seConnecterEtEntrer,
  selecteurPerimetre,
} from "./aide";

/**
 * Numérotation hors-ligne (S7).
 *
 * Ce que ces tests protègent : qu’un appareil sache donner un numéro de reçu
 * **sans réseau**. Le reste du mécanisme — qui garde son numéro quand deux
 * appareils tombent d’accord sur le même — se vérifie côté serveur, où il vit
 * (`declencheurs/numerotation.test.ts`).
 */

const prochainNumero = (page: Page) => page.locator('[data-test="prochain-numero"]');

test.describe("le numéro de la prochaine pièce", () => {
  test("un numéro appartient à une boutique, pas à l’entreprise", async ({ page }) => {
    await seConnecterEtEntrer(page);
    const code = codeUnique();
    await creerBoutique(page, code);

    await page.goto("/diagnostic", { waitUntil: "load" });

    // Périmètre « toutes les boutiques » : rien à numéroter, et on le dit.
    await expect(page.getByText(/Choisissez-en une dans le bandeau/)).toBeVisible();
    await expect(prochainNumero(page)).toHaveCount(0);

    await selecteurPerimetre(page).selectOption(code);
    await expect(prochainNumero(page)).toHaveText(new RegExp(`^${code}-\\d{4}-0001$`));
  });

  test("le numéro reste disponible réseau coupé — c’est tout l’objet du mécanisme", async ({
    page,
    context,
  }) => {
    await seConnecterEtEntrer(page);
    const code = codeUnique();
    await creerBoutique(page, code);

    await page.goto("/diagnostic", { waitUntil: "load" });
    await selecteurPerimetre(page).selectOption(code);
    await prendreLaMainEtMettreEnCache(page, "/diagnostic");

    const enLigne = await prochainNumero(page).textContent();
    expect(enLigne).toMatch(new RegExp(`^${code}-\\d{4}-0001$`));

    await context.setOffline(true);
    await expect(bandeauEtat(page)).toContainText("Hors ligne");

    /* Le rechargement est le vrai test : un numéro calculé une fois en mémoire
       ne prouverait rien. Ici la page repart du cache, relit le périmètre et
       recalcule le numéro sans que rien ne soit joignable. */
    await page.reload();
    await expect(prochainNumero(page)).toHaveText(enLigne!);

    await context.setOffline(false);
  });
});
