import { readFile, writeFile } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";
import { contenu, prendreLaMainEtMettreEnCache, seConnecterEtEntrer } from "./aide";

/**
 * Ce que S34 promet, et non ce qu'il affiche.
 *
 * La promesse tient en une phrase : **quand un gérant appelle, on peut lui
 * demander ce qui tourne sur son appareil et obtenir une réponse exploitable.**
 * Trois choses la portent, et chacune a son test.
 *
 * 1. Le numéro se lit **avant d'entrer** — un compte bloqué au refus est
 *    exactement le cas où l'on veut savoir quelle version refuse.
 * 2. Les trois faits se lisent **réseau coupé**. C'est la promesse forte : cet
 *    écran est celui qu'on ouvre quand plus rien ne marche, et il serait le
 *    seul du produit à demander du réseau pour se remplir.
 * 3. Une nouvelle version **s'installe et attend** : elle ne prend pas la main
 *    sur l'onglet ouvert, et l'écran le dit (D85).
 */

/* Le service worker servi par `npm start`, relu du disque à chaque requête. Le
   modifier d'un octet est ce qui fait exister une « nouvelle version » aux yeux
   du navigateur — le seul moyen d'observer la bascule sans compiler deux fois
   le produit. Fichier de build, hors dépôt, restauré en sortie. */
const SERVICE_WORKER = "public/sw.js";

const versionEnAttente = (page: Page) =>
  page.evaluate(async () => {
    const registre = await navigator.serviceWorker.getRegistration();
    return Boolean(registre?.waiting);
  });

test.describe("la version au comptoir", () => {
  test("se lit sur la page de connexion, sans compte", async ({ page }) => {
    await page.goto("/login");

    /* Le pied de marque n'existe qu'au-delà du seuil `md` (`a1:25`, repris tel
       quel) ; le projet Playwright vise un Pixel 7, plus étroit. On élargit
       donc la fenêtre pour ce test précis — la ligne est absente sur téléphone
       par choix de mise en page, pas par défaut. */
    await page.setViewportSize({ width: 1280, height: 800 });

    await expect(page.getByText(/^SDI · version \d+$/)).toBeVisible();
  });

  test("se lit en entier dans les réglages, réseau coupé", async ({ page, context }) => {
    await seConnecterEtEntrer(page);
    await page.goto("/parametres", { waitUntil: "load" });
    await prendreLaMainEtMettreEnCache(page, "/parametres");

    await context.setOffline(true);
    await page.reload({ waitUntil: "load" });

    const appareil = contenu(page).getByRole("region", { name: "Cet appareil" });

    /* Les trois valeurs sont posées à la compilation et voyagent dans le
       paquet : aucune ne doit s'afficher « — » hors ligne. Un tiret ici
       voudrait dire qu'on est allé les chercher quelque part. */
    await expect(appareil.getByText(/^\d+$/)).toBeVisible();
    await expect(appareil.getByText(/^[0-9a-f]{7}$/)).toBeVisible();
    await expect(appareil).not.toContainText("—");

    await context.setOffline(false);
  });

  test("une nouvelle version s'installe, attend, et l'écran le dit", async ({ page }) => {
    /* Ce que ce test protège : le jour où quelqu'un remet `skipWaiting: true`
       dans `app/sw.ts`, un déploiement reprendra la main sur les onglets
       ouverts, et le prochain morceau de code demandé — une navigation, un
       panneau — sera cherché dans un cache où l'ancien fichier n'existe plus.
       Le geste échouera en pleine saisie (D85).

       **Une première version de ce test lisait `/sw.js` et y cherchait la
       chaîne `SKIP_WAITING`.** Elle passait dans les deux sens : Serwist
       embarque ses deux branches et choisit à l'exécution, si bien que le
       marqueur est présent quel que soit le réglage. Le test ne vérifiait rien,
       et seule la vérification en sens inverse l'a montré (D79). La bascule ne
       s'observe qu'en faisant réellement exister une seconde version. */
    await seConnecterEtEntrer(page);
    await page.goto("/parametres", { waitUntil: "load" });
    await prendreLaMainEtMettreEnCache(page, "/parametres");

    /* Compter les reprises de contrôle. Avec `skipWaiting: true`, la nouvelle
       version s'active seule et cet événement part — c'est très exactement le
       moment où l'onglet du gérant change de sol sous ses pieds. */
    await page.evaluate(() => {
      const fenetre = window as unknown as { reprises: number };
      fenetre.reprises = 0;
      navigator.serviceWorker.addEventListener("controllerchange", () => {
        fenetre.reprises += 1;
      });
    });

    const original = await readFile(SERVICE_WORKER, "utf8");
    try {
      await writeFile(SERVICE_WORKER, `${original}\n/* version d'essai ${Date.now()} */\n`);
      await page.evaluate(async () => {
        const registre = await navigator.serviceWorker.getRegistration();
        await registre?.update();
      });

      await expect.poll(() => versionEnAttente(page), { timeout: 30_000 }).toBe(true);

      /* Installée, donc — et pas en vigueur. Les deux moitiés comptent : sans
         la seconde, le test dirait seulement qu'une mise à jour est arrivée. */
      expect(await page.evaluate(() => (window as unknown as { reprises: number }).reprises)).toBe(
        0,
      );

      /* Et l'écran le dit, sans quoi le retrait de `skipWaiting` aurait
         remplacé un défaut visible par un silence. */
      await expect(
        contenu(page)
          .getByRole("status")
          .filter({ hasText: "Une version plus récente est prête" }),
      ).toBeVisible();
    } finally {
      await writeFile(SERVICE_WORKER, original);
    }
  });
});
