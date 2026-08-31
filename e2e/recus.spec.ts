import { expect, test, type Page } from "@playwright/test";
import {
  bandeauEtat,
  contenu,
  encaisser,
  prendreLaMainEtMettreEnCache,
  seConnecterEtEntrer,
  vendre,
} from "./aide";

/**
 * Reçus imprimables hors ligne (S10).
 *
 * Trois choses à protéger.
 *
 * **Le papier dit la vérité.** Un reçu de versement porte le reste dû du jour
 * où il a été remis, pas celui d'aujourd'hui — et rien n'a été figé pour cela
 * (D61). C'est ce que ces tests vérifient en réimprimant après un second
 * versement.
 *
 * **Le papier n'est pas l'écran.** Ce qui aide au comptoir — bandeau réseau,
 * navigation, boutons — ne sort pas de l'imprimante. On le vérifie sous média
 * `print`, parce qu'un `@media print` cassé ne se voit sur aucune capture
 * d'écran ordinaire.
 *
 * **Et tout cela sans réseau.** C'est la raison d'être de la spec : le logo
 * voyage dans Firestore (D35), les polices viennent de notre domaine, le PDF
 * sort de la boîte d'impression du navigateur (D60). Rien à télécharger au
 * moment d'imprimer.
 */

/* Même budget qu'en S9 : le décor — boutique, référentiels, moto, client,
   vente — consomme l'essentiel du temps, et chaque étape passe par
   l'interface. */
test.beforeEach(({}, informations) => {
  informations.setTimeout(180_000);
});

/**
 * `window.print()` ouvre une boîte de dialogue que rien ne fermerait dans un
 * navigateur piloté : le test compte les appels au lieu de les subir. Ce qu'on
 * vérifie ici, c'est que le bouton déclenche l'impression — la composition de
 * la page, elle, se vérifie sous média `print` juste à côté.
 */
async function compterLesImpressions(page: Page) {
  await page.addInitScript(() => {
    Object.defineProperty(window, "impressions", { value: 0, writable: true });
    window.print = () => {
      (window as unknown as { impressions: number }).impressions += 1;
    };
  });
}

function impressions(page: Page) {
  return page.evaluate(() => (window as unknown as { impressions: number }).impressions);
}

/** L'en-tête que tout reçu doit porter : sans elle, le §10 n'est pas tenu. */
const ENTREPRISE = {
  nom: "Sandwidi et frère",
  adresse: "Avenue de la Nation, Pouytenga",
  telephone: "70112233",
  identifiant: "IFU-00919283",
};

async function renseignerEntreprise(page: Page) {
  await page.goto("/parametres/entreprise", { waitUntil: "load" });
  await page.getByLabel("Nom de l’entreprise").fill(ENTREPRISE.nom);
  await page.getByLabel("Adresse").fill(ENTREPRISE.adresse);
  await page.getByLabel("Téléphone", { exact: true }).fill(ENTREPRISE.telephone);
  await page.getByLabel("Numéro d’identification").fill(ENTREPRISE.identifiant);
  await page.getByRole("button", { name: "Enregistrer la fiche" }).click();
  await expect(contenu(page).getByRole("status")).toBeVisible({ timeout: 20_000 });
}

/** L'identifiant de la vente dont la fiche est ouverte — il porte l'URL du reçu. */
function venteOuverte(page: Page): string {
  return new URL(page.url()).searchParams.get("vente") ?? "";
}

test.describe("le reçu de vente", () => {
  test("porte l’en-tête, le détail, le reste dû — et s’imprime sans la coquille", async ({
    page,
  }) => {
    await compterLesImpressions(page);
    await seConnecterEtEntrer(page);
    await renseignerEntreprise(page);

    const { client, chassis, numero } = await vendre(page, {
      mode: "Crédit",
      prix: "1200000",
      encaisse: "400000",
    });

    await page.getByRole("link", { name: "Reçu de vente" }).click();

    const recu = page.getByRole("article");
    await expect(recu).toBeVisible({ timeout: 20_000 });

    // Le contenu obligatoire du §10, ligne à ligne.
    await expect(recu).toContainText(ENTREPRISE.nom);
    await expect(recu).toContainText(ENTREPRISE.adresse);
    await expect(recu).toContainText(numero);
    await expect(recu).toContainText(client);
    await expect(recu).toContainText(chassis);
    await expect(recu).toContainText("1 200 000 FCFA");
    await expect(recu).toContainText("400 000 FCFA");
    await expect(recu).toContainText("800 000 FCFA");
    await expect(recu).toContainText("Espèces");
    await expect(recu).toContainText("Établi par");
    // Les mentions légales s’impriment parce qu’elles sont renseignées (D11).
    await expect(recu).toContainText(ENTREPRISE.identifiant);

    /* Le rendu imprimé, pas le rendu à l'écran : c'est un autre document, et
       c'est celui qu'on remet au client. */
    const signature = recu.getByText("Le magasin", { exact: true });
    await expect(signature).toBeHidden();

    await page.emulateMedia({ media: "print" });
    await expect(recu).toBeVisible();
    await expect(page.getByRole("banner")).toBeHidden();
    await expect(page.getByRole("navigation", { name: "Navigation principale" })).toBeHidden();
    await expect(page.getByRole("button", { name: "Imprimer le reçu" })).toBeHidden();
    // Les traits de signature n’apparaissent que sur le papier.
    await expect(signature).toBeVisible();
    await page.emulateMedia({ media: "screen" });

    await page.getByRole("button", { name: "Imprimer le reçu" }).click();
    expect(await impressions(page)).toBe(1);
  });
});

test.describe("le reçu d’un versement", () => {
  test("porte son numéro dérivé et le reste dû de son jour, même réimprimé plus tard", async ({
    page,
  }) => {
    await compterLesImpressions(page);
    await seConnecterEtEntrer(page);
    await renseignerEntreprise(page);

    const { client, numero } = await vendre(page, {
      mode: "Crédit",
      prix: "1200000",
      encaisse: "400000",
    });

    await encaisser(page, "300000");
    await expect(contenu(page).getByRole("status")).toContainText("Versement enregistré", {
      timeout: 20_000,
    });

    /* Un second versement APRÈS, pour que le reste dû d'aujourd'hui (300 000)
       diffère de celui du reçu qu'on va rouvrir (500 000). C'est tout l'enjeu
       de D61 : le papier ne se met pas à jour. */
    await encaisser(page, "200000");
    await expect(contenu(page)).toContainText("300 000 FCFA", { timeout: 20_000 });

    await page.getByRole("link", { name: "Reçu", exact: true }).first().click();

    const recu = page.getByRole("article");
    await expect(recu).toBeVisible({ timeout: 20_000 });
    await expect(recu).toContainText(`${numero}/V2`);
    await expect(recu).toContainText(client);
    await expect(recu).toContainText("300 000 FCFA"); // reçu ce jour-là
    await expect(recu).toContainText("700 000 FCFA"); // total payé à cette date
    await expect(recu).toContainText("500 000 FCFA"); // reste dû à cette date

    /* L'écran Reçus retrouve les trois papiers de cette vente, et les filtre —
       par numéro comme par client (§10). */
    await page.getByRole("link", { name: "Reçus" }).click();
    await expect(contenu(page).getByRole("heading", { level: 1 })).toHaveText("Reçus");
    await expect(page.getByRole("listitem").filter({ hasText: `${numero}/V3` })).toBeVisible({
      timeout: 20_000,
    });

    await page.getByLabel("Chercher un reçu").fill(`${numero}/V2`);
    await expect(contenu(page).getByRole("listitem")).toHaveCount(1);

    await page.getByLabel("Chercher un reçu").fill(client);
    await expect(contenu(page).getByRole("listitem")).toHaveCount(3);

    await page.getByLabel("Chercher un reçu").fill("Kaboré");
    await expect(contenu(page)).toContainText("Aucun reçu ne correspond");
  });
});

test.describe("hors ligne", () => {
  test("un reçu s’ouvre et s’imprime réseau coupé, sur un écran jamais visité", async ({
    page,
    context,
  }) => {
    await compterLesImpressions(page);
    await seConnecterEtEntrer(page);
    await renseignerEntreprise(page);

    const { numero } = await vendre(page, {
      mode: "Crédit",
      prix: "1000000",
      encaisse: "250000",
    });
    const venteId = venteOuverte(page);
    expect(venteId).not.toBe("");

    /* La première visite passe à côté du service worker : ce second passage est
       celui qui met la page en cache. C'est aussi le trajet réel du gérant.
       On repasse par la liste sans paramètre — l'aide compare le chemin, et la
       fiche en porte un (`?vente=`). Les versements de cette vente sont déjà
       dans le cache Firestore, posés par la fiche que `vendre` a ouverte. */
    await page.goto("/motos/ventes", { waitUntil: "load" });
    await prendreLaMainEtMettreEnCache(page, "/motos/ventes");

    await context.setOffline(true);
    await expect(bandeauEtat(page)).toContainText("Hors ligne", { timeout: 30_000 });

    /* L'écran des reçus n'a jamais été ouvert sur cet appareil : s'il s'affiche,
       c'est qu'il a été mis en cache à l'installation et non à la visite (D40).
       C'est l'oubli que cette liste rend invisible jusqu'à la première coupure. */
    await page.goto("/motos/recus", { waitUntil: "load" });
    await expect(contenu(page).getByRole("heading", { level: 1 })).toHaveText("Reçus", {
      timeout: 30_000,
    });

    /* Le reçu lui-même, par son paramètre d'écran — le service worker sert le
       même document qu'à `/motos/recus` (D39). Les chiffres viennent du cache
       Firestore, l'en-tête du logo et des coordonnées déjà lus, et les polices
       de notre domaine : rien à demander au réseau. */
    await page.goto(`/motos/recus?recu=${venteId}`, { waitUntil: "load" });

    const recu = page.getByRole("article");
    await expect(recu).toBeVisible({ timeout: 30_000 });
    await expect(recu).toContainText(numero);
    await expect(recu).toContainText(ENTREPRISE.nom);
    await expect(recu).toContainText("250 000 FCFA");
    await expect(recu).toContainText("750 000 FCFA");

    await page.getByRole("button", { name: "Imprimer le reçu" }).click();
    expect(await impressions(page)).toBe(1);

    await context.setOffline(false);
  });
});

test.describe("états", () => {
  test("un reçu introuvable se dit, il ne tourne pas dans le vide", async ({ page }) => {
    await seConnecterEtEntrer(page);
    await page.goto("/motos/recus?recu=vente-qui-nexiste-pas", { waitUntil: "load" });
    await expect(contenu(page)).toContainText("Ce reçu est introuvable", { timeout: 30_000 });
    await expect(page.getByRole("link", { name: "Revenir aux reçus" })).toBeVisible();
  });
});
