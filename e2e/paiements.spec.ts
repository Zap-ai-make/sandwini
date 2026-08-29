import { expect, test, type Page } from "@playwright/test";
import {
  bandeauEtat,
  contenu,
  creerClientDepuisLeFichier,
  preparerTerrain,
  saisirMoto,
  seConnecterEtEntrer,
  type Terrain,
} from "./aide";

/**
 * Versements et suivi des paiements (S9).
 *
 * Trois choses à protéger, et elles ne se ressemblent pas.
 *
 * D'abord la promesse du produit : **un versement s'encaisse réseau coupé**, et
 * le reste dû tombe immédiatement à l'écran — sans quoi le gérant ne saurait
 * pas quoi dire au client qui attend devant lui.
 *
 * Ensuite la frontière métier : la moto d'une vente en tranches ne part qu'au
 * dernier franc. Tant qu'il reste quelque chose à verser, l'écran n'offre même
 * pas le geste.
 *
 * Enfin la distinction que tout le produit refuse de relâcher : une **dette**
 * est de l'argent qui manque au magasin, une **tranche** est de l'argent qu'il
 * détient. Deux listes, deux totaux, jamais un cumul.
 */

/* Même raison qu'en S8 : le décor — boutique, référentiels, moto, client,
   vente — consomme l'essentiel du budget, et chaque étape passe par
   l'interface. Les assertions gardent leur propre budget. */
test.beforeEach(({}, informations) => {
  informations.setTimeout(180_000);
});

function chassisUnique(prefixe: string): string {
  return `${prefixe}${Date.now().toString(36).toUpperCase()}`;
}

/**
 * Enregistre une vente et ouvre sa fiche. Rend de quoi la retrouver.
 *
 * `encaisse` est le montant déposé le jour de la vente — celui que S8 écrit
 * dans le lot. Tout ce que S9 ajoute vient après.
 */
async function vendre(
  page: Page,
  options: { mode: "Crédit" | "Tranches"; prix: string; encaisse: string },
): Promise<{ terrain: Terrain; client: string; chassis: string; numero: string }> {
  const terrain = await preparerTerrain(page);
  const chassis = chassisUnique("PAIE");
  await saisirMoto(page, terrain, chassis, { prixAchat: "700000", conseille: options.prix });

  const client = `Zongo ${Date.now().toString(36)}`;
  await creerClientDepuisLeFichier(page, client, `78${String(Date.now()).slice(-6)}`);

  await page.goto("/motos/ventes/nouvelle", { waitUntil: "load" });
  await page.getByLabel("Chercher dans le stock").fill(chassis);
  await page.getByRole("radio", { name: new RegExp(chassis) }).check();
  await page.getByLabel("Chercher un client").fill(client);
  await page.getByRole("radio", { name: new RegExp(client) }).check();
  await page.getByLabel("Prix convenu", { exact: true }).fill(options.prix);
  await page.getByRole("radio", { name: new RegExp(options.mode) }).check();
  await page.getByLabel(/Montant reçu/).fill(options.encaisse);
  await page.getByRole("button", { name: "Enregistrer la vente" }).click();

  const confirmation = contenu(page).getByRole("status");
  await expect(confirmation).toContainText("Vente enregistrée", { timeout: 20_000 });
  const numero = (await confirmation.locator(".plaque-code").textContent())!.trim();

  await page.getByRole("link", { name: "Voir la vente" }).click();
  await expect(contenu(page).getByRole("heading", { level: 1 })).toContainText(client);

  return { terrain, client, chassis, numero };
}

/** Encaisse un versement depuis la fiche ouverte. */
async function encaisser(page: Page, montant: string) {
  await page.getByLabel("Montant reçu").fill(montant);
  await page.getByRole("button", { name: "Enregistrer le versement" }).click();
}

test.describe("encaisser un versement", () => {
  test("un versement s’ajoute à une vente à crédit, et le reste dû tombe", async ({ page }) => {
    await seConnecterEtEntrer(page);
    const { numero } = await vendre(page, {
      mode: "Crédit",
      prix: "1200000",
      encaisse: "400000",
    });

    await expect(contenu(page)).toContainText("800 000 FCFA");
    await encaisser(page, "300000");

    /* Le reçu du versement dérive du numéro de la vente (D57) : c'est le
       deuxième encaissement de cette vente, donc le rang 2. */
    const confirmation = contenu(page).getByRole("status");
    await expect(confirmation).toContainText("Versement enregistré", { timeout: 20_000 });
    await expect(confirmation.locator(".plaque-code")).toHaveText(`${numero}/V2`);

    // Le reste dû suit immédiatement, et les deux versements sont là.
    await expect(contenu(page)).toContainText("500 000 FCFA");
    await expect(contenu(page)).toContainText("300 000 FCFA");
    await expect(contenu(page)).toContainText("Partiellement payée");
  });

  test("un versement ne peut pas dépasser le reste dû, et l’écran dit le maximum", async ({
    page,
  }) => {
    await seConnecterEtEntrer(page);
    await vendre(page, { mode: "Crédit", prix: "1000000", encaisse: "600000" });

    await encaisser(page, "500000");

    const refus = contenu(page).getByRole("alert");
    await expect(refus).toContainText("ne peut pas dépasser le reste dû");
    await expect(refus).toContainText("400 000 FCFA");
    await expect(contenu(page).getByRole("status")).toHaveCount(0);
  });

  test("une vente soldée n’offre plus de quoi encaisser", async ({ page }) => {
    await seConnecterEtEntrer(page);
    await vendre(page, { mode: "Crédit", prix: "800000", encaisse: "500000" });

    await encaisser(page, "300000");
    await expect(contenu(page)).toContainText("Soldée", { timeout: 20_000 });
    await expect(page.getByRole("button", { name: "Enregistrer le versement" })).toHaveCount(0);
  });
});

test.describe("la moto des tranches ne part qu’au dernier franc", () => {
  test("la remise se confirme une fois les tranches soldées, et la moto passe vendue", async ({
    page,
  }) => {
    await seConnecterEtEntrer(page);
    const { chassis } = await vendre(page, {
      mode: "Tranches",
      prix: "900000",
      encaisse: "400000",
    });

    // Tant qu'il reste à verser, le geste n'existe pas.
    await expect(contenu(page)).toContainText("reste 500 000 FCFA à verser");
    await expect(
      page.getByRole("button", { name: "Confirmer la remise de la moto" }),
    ).toHaveCount(0);

    await encaisser(page, "500000");
    await expect(contenu(page)).toContainText("Tranches soldées", { timeout: 20_000 });

    /* Confirmation en deux temps : ce geste transforme un engagement en
       recette et ne s'annule pas depuis l'application. */
    await page.getByRole("button", { name: "Confirmer la remise de la moto" }).click();
    await page.getByRole("button", { name: "Oui, la moto est remise" }).click();

    await expect(contenu(page)).toContainText("Remise au client", { timeout: 20_000 });
    await expect(
      page.getByRole("button", { name: "Confirmer la remise de la moto" }),
    ).toHaveCount(0);

    // Et le stock le sait : la moto n'est plus réservée, elle est vendue.
    await page.goto("/motos", { waitUntil: "load" });
    await page.getByLabel("Chercher un châssis").fill(chassis);
    await expect(page.getByRole("listitem").filter({ hasText: chassis })).toContainText("Vendue", {
      timeout: 20_000,
    });
  });
});

test.describe("les trois listes de suivi", () => {
  test("une dette et une tranche ne se mélangent jamais", async ({ page }) => {
    await seConnecterEtEntrer(page);
    const { client } = await vendre(page, {
      mode: "Crédit",
      prix: "1000000",
      encaisse: "250000",
    });

    await page.goto("/motos/paiements", { waitUntil: "load" });

    // La dette : ce qui manque au magasin.
    await expect(contenu(page)).toContainText("Total dû par les clients", { timeout: 30_000 });
    await expect(contenu(page)).toContainText("750 000 FCFA");
    await expect(page.getByRole("listitem").filter({ hasText: client })).toContainText("reste dû");

    /* Les tranches : de l'argent que le magasin détient. Cette vente-ci est un
       crédit — elle n'a donc rien à y faire, et c'est tout l'enjeu. */
    await page.getByRole("button", { name: /Tranches en cours/ }).click();
    await expect(contenu(page)).toContainText("Total détenu pour le compte des clients");
    await expect(contenu(page)).toContainText("Aucune moto retenue au magasin");

    await page.getByRole("button", { name: /Tranches inactives/ }).click();
    await expect(contenu(page)).toContainText("Aucune tranche sans versement depuis 30 jours");
  });

  test("une vente en tranches compte dans le total détenu, pas dans les dettes", async ({
    page,
  }) => {
    await seConnecterEtEntrer(page);
    const { client } = await vendre(page, {
      mode: "Tranches",
      prix: "900000",
      encaisse: "300000",
    });

    await page.goto("/motos/paiements", { waitUntil: "load" });
    await expect(contenu(page)).toContainText("Aucune dette", { timeout: 30_000 });

    await page.getByRole("button", { name: /Tranches en cours/ }).click();
    await expect(contenu(page)).toContainText("300 000 FCFA");
    await expect(contenu(page)).toContainText("1 moto à livrer");
    await expect(page.getByRole("listitem").filter({ hasText: client })).toContainText("détenu");
  });
});

test.describe("hors ligne", () => {
  test("un versement s’encaisse réseau coupé, et le reste dû tombe aussitôt", async ({
    page,
    context,
  }) => {
    await seConnecterEtEntrer(page);
    const { client, numero } = await vendre(page, {
      mode: "Crédit",
      prix: "1000000",
      encaisse: "200000",
    });

    /* La fiche est ouverte et son cache est chaud : c'est le trajet réel d'un
       gérant qui reçoit un client, puis perd le réseau. On recharge d'abord,
       parce que la toute première visite passe à côté du service worker. */
    await page.waitForFunction(() => Boolean(navigator.serviceWorker?.controller), null, {
      timeout: 30_000,
    });
    await page.reload({ waitUntil: "load" });
    await expect(contenu(page).getByRole("heading", { level: 1 })).toContainText(client, {
      timeout: 30_000,
    });

    await context.setOffline(true);
    await expect(bandeauEtat(page)).toContainText("Hors ligne", { timeout: 30_000 });

    await encaisser(page, "300000");

    // Le numéro du reçu est disponible sans réseau : il dérive de la vente.
    const confirmation = contenu(page).getByRole("status");
    await expect(confirmation).toContainText("Versement enregistré", { timeout: 20_000 });
    await expect(confirmation.locator(".plaque-code")).toHaveText(`${numero}/V2`);

    // Et les totaux se recalculent sur le cache local, sans rien demander.
    await expect(contenu(page)).toContainText("500 000 FCFA");

    await context.setOffline(false);
    /* Ce qu'on vérifie, c'est que le lot part tout seul — pas en combien de
       temps : après une coupure, le SDK Firestore reprend avec une attente
       croissante que le retour du réseau n'interrompt pas (D50, S27). */
    await expect(bandeauEtat(page)).toContainText("À jour", { timeout: 90_000 });
  });
});
