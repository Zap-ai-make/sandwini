import { expect, test, type Page } from "@playwright/test";
import {
  attendreLaFileVide,
  bandeauEtat,
  prendreLaMainEtMettreEnCache,
  preparerTerrain,
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
 *
 * **Ces tests pilotaient `/diagnostic`, supprimé en S54, et plus personne ne
 * les regardait tomber.** L’écran affichait le prochain numéro dans un coin ;
 * il a disparu avec la refonte, et la suite a continué de le viser. C’est le
 * genre de test qui ne protège plus rien tout en ayant l’air d’exister — et un
 * audit l’a trouvé orphelin, pas une exécution.
 *
 * Le numéro ne se voit plus que dans la modale de vente, au récapitulatif. Ce
 * n’est pas un repli : c’est l’endroit juste. Un numéro de pièce intéresse
 * celui qui s’apprête à en émettre une, pas celui qui inspecte son appareil.
 */

const prochainNumero = (page: Page) => page.locator('[data-test="prochain-numero"]');

test.describe("le numéro de la prochaine pièce", () => {
  test("un numéro appartient à une boutique, pas à l’entreprise", async ({ page }) => {
    await seConnecterEtEntrer(page);
    await preparerTerrain(page);

    await page.goto("/motos/ventes?nouvelle=1", { waitUntil: "load" });
    /* **Le reçu n'affiche plus que le rang du mois** (27 octobre 2026) : le code
       de la boutique et le mois se lisent ailleurs sur la feuille. Le numéro
       complet reste en base ; c'est son rendu qui s'allège. */
    await expect(prochainNumero(page)).toHaveText(/^n°\s*0001$/, { timeout: 30_000 });

    /* **En vue entreprise, aucun numéro n'est promis.** C'est l'énoncé du
       titre : le compteur appartient à un tiroir, et l'entreprise n'en est pas
       un. L'assertion vient après celle du dessus, et c'est ce qui lui donne sa
       valeur — on a vu le numéro exister, puis disparaître avec le périmètre.
       Seule, une absence pourrait aussi bien signaler un mécanisme cassé.

       Une seconde boutique aurait dit la même chose plus fort, mais au prix
       d'un `creerBoutique` de plus : du décor, pas de la preuve. */
    await selecteurPerimetre(page).selectOption("");
    await page.goto("/motos/ventes?nouvelle=1", { waitUntil: "load" });
    await expect(prochainNumero(page)).toHaveCount(0, { timeout: 30_000 });
  });

  test("le numéro reste disponible réseau coupé — c’est tout l’objet du mécanisme", async ({
    page,
    context,
  }) => {
    await seConnecterEtEntrer(page);
    await preparerTerrain(page);

    await page.goto("/motos/ventes?nouvelle=1", { waitUntil: "load" });
    await expect(prochainNumero(page)).toHaveText(/^n°\s*0001$/, { timeout: 30_000 });
    const enLigne = (await prochainNumero(page).textContent())!.trim();

    /* Le registre est mis en cache sans son paramètre : c'est la page que le
       service worker garde, et la modale s'ouvre par-dessus. */
    await page.goto("/motos/ventes", { waitUntil: "load" });
    await prendreLaMainEtMettreEnCache(page, "/motos/ventes");
    /* On ne coupe qu'une fois la file vide : ce test recharge la page, donc il
       n'a le droit de le faire que lorsque plus rien n'attend d'être envoyé
       (D97). */
    await attendreLaFileVide(page);

    await context.setOffline(true);
    await expect(bandeauEtat(page)).toContainText("Hors ligne", { timeout: 30_000 });

    /* Le vrai test : la page repart du cache, relit le périmètre et recalcule
       le numéro sans que rien ne soit joignable. Un numéro gardé en mémoire ne
       prouverait rien. */
    await page.goto("/motos/ventes?nouvelle=1", { waitUntil: "load" });
    await expect(prochainNumero(page)).toHaveText(enLigne, { timeout: 30_000 });

    await context.setOffline(false);
  });
});
