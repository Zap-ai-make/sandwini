import { expect, test, type Page } from "@playwright/test";
import {
  attendreLaFileVide,
  choisirSegment,
  bandeauEtat,
  contenu,
  creerClientDepuisLeFichier,
  emailUnique,
  prendreLaMainEtMettreEnCache,
  preparerTerrain,
  saisirMoto,
  seConnecter,
  seConnecterEtEntrer,
  selecteurPerimetre,
  type Terrain,
} from "./aide";

/**
 * Vente de moto (S8).
 *
 * C'est la spec qui porte la valeur centrale du produit, et ce que ces tests
 * protègent tient en trois phrases.
 *
 * D'abord la promesse : **une vente entière s'enregistre réseau coupé** — la
 * moto se trouve, le client se crée, le numéro s'attribue, le dossier s'ouvre.
 * Ensuite une frontière : le gérant ne voit jamais la marge. Enfin une
 * distinction métier qu'on ne peut pas se permettre de relâcher : le crédit
 * livre la moto, les tranches la retiennent.
 */

const NUMERO = /[A-Z]{3}-\d{4}-\d{4}/;

/**
 * Le double du budget ordinaire, et la raison tient au décor, pas au produit.
 *
 * Une vente exige tout ce que les specs précédentes ont construit : une
 * boutique, une marque, un modèle, une provenance, une moto en stock, un
 * client. Chacun passe par l'interface — c'est voulu, c'est le vrai chemin d'un
 * premier jour — et chacun attend sa confirmation. Le décor consomme ainsi
 * l'essentiel des 90 secondes par défaut, et les assertions qui suivent
 * tombaient sur l'arithmétique du harnais plutôt que sur un défaut.
 *
 * Ce plafond ne masque rien : chaque assertion garde son propre budget, et une
 * donnée qui n'arrive pas fait toujours échouer le test.
 */
test.beforeEach(({}, informations) => {
  informations.setTimeout(180_000);
});

/** Le châssis d'une moto propre à cette exécution. */
function chassisUnique(prefixe: string): string {
  return `${prefixe}${Date.now().toString(36).toUpperCase()}`;
}

/** Un décor complet : boutique, référentiels, une moto en stock, un client. */
async function preparerVente(
  page: Page,
  options: { conseille?: string; synchroniser?: boolean } = {},
): Promise<{ terrain: Terrain; chassis: string; client: string; telephone: string }> {
  const terrain = await preparerTerrain(page);
  const chassis = chassisUnique("VENTE");
  await saisirMoto(page, terrain, chassis, {
    prixAchat: "850000",
    conseille: options.conseille ?? "1200000",
  });

  const client = `Ouédraogo ${Date.now().toString(36)}`;
  const telephone = `70${String(Date.now()).slice(-6)}`;
  await creerClientDepuisLeFichier(page, client, telephone);

  /* **Vidée par défaut, et c'est un revirement mesuré.** La règle écrite plus
     bas — « un navigateur qui vient d'écrire lit son propre cache et n'a rien à
     attendre » — est juste, mais elle ne tient que tant qu'il ne recharge pas.
     Or *tous* les appelants enchaînent sur un `page.goto` vers la modale, et
     D97 dit ce qui se passe alors : Firestore repart du cache sur disque, où
     une écriture encore en vol n'est pas. Le client venait donc de disparaître
     de la recherche, par intermittence — quatre verdicts perdus sur cette
     seule cause pendant S44, chaque fois accusant l'écran plutôt que le décor.
     Qui n'a pas besoin de la frontière passe `synchroniser: false`. */
  if (options.synchroniser !== false) await attendreSynchronisation(page);
  return { terrain, chassis, client, telephone };
}

/**
 * Attend que le décor soit réellement parti au serveur.
 *
 * **Deux situations l'exigent, et elles se ressemblent plus qu'il n'y paraît.**
 *
 * *Un second navigateur* : son cache n'est pas celui du premier. Le gérant du
 * test de la marge ouvre une autre session, et ne verra la moto que lorsqu'elle
 * sera parvenue au serveur.
 *
 * *Un rechargement*, et c'est ce que S44 a dû corriger. On lisait ici qu'« un
 * navigateur qui vient d'écrire lit son propre cache et n'a rien à attendre ».
 * C'est vrai — tant qu'il ne recharge pas. Un `page.goto` repart du cache **sur
 * disque**, où une écriture encore en vol n'est pas (D97) ; le client venait
 * donc de disparaître de la recherche, par intermittence. Recharger et ouvrir
 * un second navigateur sont le même geste vu de la file d'écritures : les deux
 * abandonnent ce qui n'est pas parti.
 *
 * Le budget est large parce que la file met du temps à se vider : le SDK
 * Firestore reste dans son cycle de reconnexion à attente croissante (D50, S27
 * au backlog). Ce qu'il ne faut toujours pas faire, c'est l'appeler **document
 * par document** — c'est cela qui fabriquait la contention, et non la frontière
 * unique posée à la sortie du décor.
 */
async function attendreSynchronisation(page: Page) {
  await attendreLaFileVide(page);
}

async function choisirMotoEtClient(page: Page, chassis: string, client: string) {
  await page.getByLabel("Chercher dans le stock").fill(chassis);
  await page.getByRole("radio", { name: new RegExp(chassis) }).check();

  await page.getByLabel("Chercher un client").fill(client);
  await page.getByRole("radio", { name: new RegExp(client) }).check();
}

test.describe("enregistrer une vente", () => {
  test("une vente au comptant s’enregistre, sort la moto du stock, et se retrouve", async ({
    page,
  }) => {
    await seConnecterEtEntrer(page);
    const { chassis, client, telephone } = await preparerVente(page);

    await page.goto("/motos/ventes?nouvelle=1", { waitUntil: "load" });
    await choisirMotoEtClient(page, chassis, client);

    /* Le prix conseillé s'installe tout seul quand on choisit la moto : c'est
       un point de départ, pas un verrou. */
    /* `exact` n'est pas décoratif : l'aide du champ voisin dit « le prix
       convenu en entier », et une recherche par sous-chaîne résolvait les deux
       champs à la fois. */
    await expect(page.getByLabel("Prix convenu", { exact: true })).toHaveValue("1200000");
    await choisirSegment(page, "Mode de paiement", "Comptant");
    await page.getByLabel(/Montant reçu/).fill("1200000");

    // Le récapitulatif dit ce qui sera écrit, avant qu'on valide.
    const recap = page.getByRole("region", { name: "Récapitulatif de la vente" });
    await expect(recap).toContainText("1 200 000 FCFA");
    await expect(recap).toContainText("Le client repart avec la moto");
    await expect(recap.locator(".plaque-code")).toHaveText(NUMERO);

    await page.getByRole("button", { name: "Enregistrer la vente" }).click();

    const confirmation = contenu(page).getByRole("status");
    await expect(confirmation).toContainText("Vente enregistrée", { timeout: 20_000 });
    const numero = (await confirmation.locator(".plaque-code").textContent())!.trim();
    expect(numero).toMatch(NUMERO);

    /* La moto ne peut plus être vendue une seconde fois : c'était la seule du
       stock, et l'écran n'offre même plus de quoi chercher — il n'y a plus rien
       à vendre. Pas de champ de recherche, donc, et c'est le bon comportement. */
    await page.goto("/motos/ventes?nouvelle=1", { waitUntil: "load" });
    await expect(contenu(page)).toContainText("Aucune moto disponible dans", { timeout: 30_000 });
    await expect(page.getByLabel("Chercher dans le stock")).toHaveCount(0);

    // Et elle est bien passée « vendue » dans le stock.
    await page.goto("/motos", { waitUntil: "load" });
    await page.getByLabel("Chercher dans le stock").fill(chassis);
    /* `locator("tr")` et non `getByRole("row")` : sous 1024 px le tableau du
       stock se replie en cartes, ce qui lui retire ses rôles de tableau, et la
       suite tourne sur un Pixel 7. */
    await expect(page.locator("tbody tr").filter({ hasText: chassis })).toContainText("Vendue", {
      timeout: 20_000,
    });

    // La recherche du §6.4 : on tape le numéro de téléphone du client.
    await page.goto("/motos/ventes", { waitUntil: "load" });
    await page.getByLabel("Chercher une vente").fill(telephone);
    /* `locator("tbody tr")` et non `getByRole("row")` : sous 1024 px le tableau
       des ventes se replie en cartes, ce qui lui retire ses rôles de tableau,
       et la suite tourne sur un Pixel 7. */
    const ligne = page.locator("tbody tr").filter({ hasText: numero });
    await expect(ligne).toContainText(client, { timeout: 20_000 });
    await expect(ligne).toContainText("Soldée");

    /* L'état du dossier a quitté la ligne pour la fiche : le tableau dit ce qui
       se compare d'une vente à l'autre — le reste dû et le paiement — et le
       détail des papiers appartient au panneau, où l'on agit dessus. */
    await ligne.getByRole("link").first().click();
    /* Trois, et non quatre : la plaque a quitté le dossier en S48 — la carte
       grise porte l'immatriculation, et les deux lignes disaient la même
       chose. */
    await expect(contenu(page).getByRole("complementary")).toContainText("3 à faire");
  });

  test("la fiche montre le dossier entier, ses trois documents et le versement", async ({
    page,
  }) => {
    await seConnecterEtEntrer(page);
    const { chassis, client } = await preparerVente(page);

    await page.goto("/motos/ventes?nouvelle=1", { waitUntil: "load" });
    await choisirMotoEtClient(page, chassis, client);
    await choisirSegment(page, "Mode de paiement", "Crédit");
    await page.getByLabel(/Montant reçu/).fill("400000");
    await page.getByRole("button", { name: "Enregistrer la vente" }).click();

    await expect(contenu(page).getByRole("status")).toContainText("Vente enregistrée", {
      timeout: 20_000,
    });
    await page.getByRole("link", { name: "Voir la vente" }).click();

  /* Depuis A6, la fiche est un panneau de l'écran des ventes et non plus une
     page : l'unique `h1` reste « Ventes », et c'est le repère `complementary`,
     nommé « Vente <numéro> », qui porte la vente ouverte. */
    await expect(contenu(page).getByRole("complementary")).toContainText(client);
    await expect(contenu(page)).toContainText("800 000 FCFA"); // reste dû
    await expect(contenu(page)).toContainText("Partiellement payée");

    /* Les trois documents du dossier, créés par le même lot que la vente.
       Scopés à leur liste : depuis S44 « Carte grise » paraît deux fois dans le
       panneau — le papier à obtenir, et ce qui part avec la moto. Ce sont deux
       faits différents sous le même mot, et c'est la section qui les sépare. */
    const dossier = contenu(page).getByRole("list", { name: "Documents du dossier" });
    for (const document of ["Quittance", "CMC", "Carte grise"]) {
      await expect(dossier.getByText(document, { exact: true })).toBeVisible();
    }
    /* Et la plaque n'y est plus (S48) : elle y figurait comme un quatrième
       papier à obtenir, alors que l'immatriculation vient avec la carte grise. */
    await expect(dossier.getByText("Plaque", { exact: true })).toHaveCount(0);
    await expect(contenu(page).getByText("À faire").first()).toBeVisible();

    // Le versement du jour de la vente.
    await expect(contenu(page)).toContainText("400 000 FCFA");
    await expect(contenu(page)).toContainText("Espèces");
  });

  test("une vente au comptant partiellement payée est refusée, et on dit quoi faire", async ({
    page,
  }) => {
    await seConnecterEtEntrer(page);
    const { chassis, client } = await preparerVente(page);

    await page.goto("/motos/ventes?nouvelle=1", { waitUntil: "load" });
    await choisirMotoEtClient(page, chassis, client);
    await choisirSegment(page, "Mode de paiement", "Comptant");
    await page.getByLabel(/Montant reçu/).fill("600000");
    await page.getByRole("button", { name: "Enregistrer la vente" }).click();

    await expect(contenu(page).getByRole("alert")).toContainText("payée en entier");
    await expect(contenu(page).getByRole("alert")).toContainText("crédit ou tranches");
    await expect(contenu(page).getByRole("status")).toHaveCount(0);
  });

  test("un encaissement supérieur au prix convenu est refusé", async ({ page }) => {
    await seConnecterEtEntrer(page);
    const { chassis, client } = await preparerVente(page);

    await page.goto("/motos/ventes?nouvelle=1", { waitUntil: "load" });
    await choisirMotoEtClient(page, chassis, client);
    await choisirSegment(page, "Mode de paiement", "Crédit");
    await page.getByLabel(/Montant reçu/).fill("1500000");
    await page.getByRole("button", { name: "Enregistrer la vente" }).click();

    await expect(contenu(page).getByRole("alert")).toContainText("dépasser le prix convenu");
  });

  /* **Entrée ne doit jamais enregistrer une vente.** L'écran n'est délibérément
     pas un `<form>` — il en contient un, celui du client — et le premier champ
     qu'on remplit est une recherche de châssis. Valider par Entrée après un
     numéro serait une catastrophe silencieuse : une vente partirait sans prix,
     sans mode, sans client. */
  test("la touche Entrée n’enregistre pas la vente", async ({ page }) => {
    await seConnecterEtEntrer(page);
    /* Le décor attend d'être parti avant qu'on quitte la page qui vient de
       l'écrire : `page.goto` recharge tout, et une écriture encore en file s'y
       perd (D97). Les tests voisins courent la même course et la gagnent le
       plus souvent ; celui-ci l'a perdue, ce qui suffit à la rendre visible. */
    const { chassis, client } = await preparerVente(page);

    await page.goto("/motos/ventes?nouvelle=1", { waitUntil: "load" });
    await choisirMotoEtClient(page, chassis, client);

    await page.getByLabel("Chercher dans le stock").press("Enter");
    await page.getByLabel("Prix convenu", { exact: true }).press("Enter");
    await page.getByLabel(/Montant reçu/).press("Enter");

    // Rien n'est parti, et la modale est toujours là.
    await expect(contenu(page).getByRole("status")).toHaveCount(0);
    await expect(page.getByRole("dialog", { name: "Nouvelle vente" })).toBeVisible();
  });

  test("Échap ferme la modale, et le focus revient au bouton qui l’a ouverte", async ({ page }) => {
    await seConnecterEtEntrer(page);
    await preparerVente(page);

    await page.goto("/motos/ventes", { waitUntil: "load" });
    const ouvrir = page.getByRole("button", { name: "Nouvelle vente" });
    await ouvrir.click();

    const modale = page.getByRole("dialog", { name: "Nouvelle vente" });
    await expect(modale).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(modale).toHaveCount(0);
    /* Le focus rendu à son déclencheur : sans lui, on repart au début du
       document, et qui navigue au clavier a tout l'écran à reparcourir. */
    await expect(ouvrir).toBeFocused();
  });

  /**
   * **Le client neuf n'a pas d'étape à lui.** On le tape dans la modale, et
   * c'est « Enregistrer la vente » qui le crée en passant.
   *
   * Ce chemin n'était couvert par aucun test : tous les autres *choisissent un
   * client existant* dans la liste. C'est le commanditaire qui l'a trouvé à
   * l'usage — la saisie disparaissait dès qu'on touchait au mode de paiement,
   * et il fallait passer par un bouton « Créer le client » qui n'avait rien à
   * faire là. Le test porte donc les deux moitiés du défaut : la saisie
   * survit aux autres gestes, et la vente se conclut sans étape intermédiaire.
   */
  test("un client nouveau se crée avec la vente, sans étape à part", async ({ page }) => {
    await seConnecterEtEntrer(page);
    const terrain = await preparerTerrain(page);
    const chassis = chassisUnique("NOUVCLI");
    await saisirMoto(page, terrain, chassis, { prixAchat: "850000", conseille: "1200000" });

    await page.goto("/motos/ventes?nouvelle=1", { waitUntil: "load" });
    const modale = page.getByRole("dialog", { name: "Nouvelle vente" });
    await expect(modale).toBeVisible({ timeout: 30_000 });

    // Aucune étape de création : le bouton n'existe pas dans la modale.
    await expect(modale.getByRole("button", { name: "Créer le client" })).toHaveCount(0);

    const nom = `Compaoré ${Date.now().toString(36)}`;
    const telephone = `76${String(Date.now()).slice(-6)}`;
    await modale.getByLabel("Nom", { exact: true }).fill(nom);
    await modale.getByLabel("Téléphone", { exact: true }).fill(telephone);

    await page.getByLabel("Chercher dans le stock").fill(chassis);
    await page.getByRole("radio", { name: new RegExp(chassis) }).check();

    /* Le cœur du défaut signalé : choisir un mode, puis un moyen, ne doit rien
       effacer de ce qui est déjà tapé — ni laisser le groupe sans réponse. */
    await choisirSegment(page, "Mode de paiement", "Tranches");
    await expect(modale.getByLabel("Nom", { exact: true })).toHaveValue(nom);
    await expect(page.getByRole("radio", { name: "Tranches" })).toBeChecked();
    /* **Visible, et pas seulement présent.** Le défaut que cette ligne garde ne
       retirait rien du DOM : le radio `sr-only`, absolu sous une étiquette non
       positionnée, prenait le cadre de la modale pour bloc conteneur et
       étirait sa zone défilable ; le focus le révélait en faisant défiler ce
       cadre de 856 px, contenu hors champ, sans retour possible puisqu'il est
       `overflow-hidden`. Une assertion de présence passait au vert devant un
       écran vide — c'est exactement ce qui est arrivé. */
    await expect(modale.getByLabel("Nom", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Enregistrer la vente" })).toBeVisible();

    await choisirSegment(page, "Moyen de paiement", "Orange Money");
    await expect(modale.getByLabel("Nom", { exact: true })).toHaveValue(nom);
    await expect(modale.getByLabel("Téléphone", { exact: true })).toHaveValue(telephone);
    await expect(page.getByRole("radio", { name: "Orange Money" })).toBeChecked();
    await expect(modale.getByLabel("Nom", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Enregistrer la vente" })).toBeVisible();

    await page.getByLabel(/Montant reçu/).fill("300000");
    await page.getByRole("button", { name: "Enregistrer la vente" }).click();
    await expect(contenu(page).getByRole("status")).toContainText("Vente enregistrée", {
      timeout: 20_000,
    });

    // Le client a bien été créé, et la vente le cite.
    await page.getByRole("link", { name: "Voir la vente" }).click();
    await expect(contenu(page).getByRole("complementary")).toContainText(nom);
  });

  /* Ce qui part avec la moto se coche depuis S44, et se relit sur la fiche.
     « Carte grise » et « Casque » sont cochés par défaut : c'est le cas
     ordinaire, et décocher est le geste rare. */
  test("les inclusions se cochent, et la fiche les redit", async ({ page }) => {
    await seConnecterEtEntrer(page);
    const { chassis, client } = await preparerVente(page);

    await page.goto("/motos/ventes?nouvelle=1", { waitUntil: "load" });
    await choisirMotoEtClient(page, chassis, client);

    const carteGrise = page.getByRole("checkbox", { name: "Carte grise" });
    const casque = page.getByRole("checkbox", { name: "Casque" });
    await expect(carteGrise).toBeChecked();
    await expect(casque).toBeChecked();
    await casque.uncheck();

    await choisirSegment(page, "Mode de paiement", "Crédit");
    await page.getByLabel(/Montant reçu/).fill("0");
    await page.getByRole("button", { name: "Enregistrer la vente" }).click();
    await expect(contenu(page).getByRole("status")).toContainText("Vente enregistrée", {
      timeout: 20_000,
    });

    await page.getByRole("link", { name: "Voir la vente" }).click();
    const fiche = contenu(page).getByRole("complementary");
    await expect(fiche).toContainText("Carte grise");
    /* Le mot dit l'état, la couleur ne fait que le doubler : « non inclus »
       s'écrit, il ne se devine pas à une nuance de gris. */
    await expect(fiche).toContainText("Casque — non inclus");
  });

  test("les chiffres de tête somment les ventes affichées", async ({ page }) => {
    await seConnecterEtEntrer(page);
    const { chassis, client } = await preparerVente(page);

    await page.goto("/motos/ventes?nouvelle=1", { waitUntil: "load" });
    await choisirMotoEtClient(page, chassis, client);
    await choisirSegment(page, "Mode de paiement", "Crédit");
    await page.getByLabel(/Montant reçu/).fill("500000");
    await page.getByRole("button", { name: "Enregistrer la vente" }).click();
    await expect(contenu(page).getByRole("status")).toContainText("Vente enregistrée", {
      timeout: 20_000,
    });

    /* On **referme**, on ne recharge pas — et c'est le sujet même de S44 : la
       liste est restée dessous, les chiffres se recalculent en lecture depuis
       le cache (D61), et aucun geste n'attend le serveur.
       Un `page.goto` ici rechargerait la page alors que la vente est encore en
       file d'envoi, et Firestore la perdrait : c'est D97, et c'est exactement
       ce qui a fait échouer ce test à la deuxième passe de S44. */
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog", { name: "Vente enregistrée" })).toBeHidden();

    const chiffres = contenu(page);
    await expect(chiffres).toContainText("Chiffre d’affaires", { timeout: 30_000 });
    await expect(chiffres).toContainText("1 200 000 FCFA"); // le prix convenu
    await expect(chiffres).toContainText("500 000 FCFA"); // encaissé
    await expect(chiffres).toContainText("700 000 FCFA"); // reste à percevoir

    /* La marge n'a pas de carte, et ce n'est pas un oubli : le coût vit dans
       `prive/marge`, hors de portée du gérant (D2). Une cinquième carte le
       ferait entrer par la fenêtre. */
    await expect(chiffres).not.toContainText("Marge");
  });

  test("le filtre de période borne les chiffres de tête et la liste", async ({ page }) => {
    await seConnecterEtEntrer(page);
    const { chassis, client } = await preparerVente(page);

    await page.goto("/motos/ventes?nouvelle=1", { waitUntil: "load" });
    await choisirMotoEtClient(page, chassis, client);
    await choisirSegment(page, "Mode de paiement", "Comptant");
    await page.getByRole("button", { name: "Enregistrer la vente" }).click();
    await expect(contenu(page).getByRole("status")).toContainText("Vente enregistrée", {
      timeout: 20_000,
    });
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog", { name: "Vente enregistrée" })).toBeHidden();

    const ecran = contenu(page);
    const periodes = page.getByRole("group", { name: "Filtrer par période" });
    await expect(periodes).toBeVisible();

    /* La vente vient d'être faite : elle est dans le mois courant, et les
       cartes disent laquelle. */
    await periodes.getByRole("button", { name: "Ce mois-ci" }).click();
    await expect(ecran).toContainText("Chiffre d’affaires", { timeout: 30_000 });
    await expect(ecran).toContainText("1 200 000 FCFA");

    /* Le mois dernier ne contient rien : toute la suite écrit aujourd'hui. Les
       cartes disparaissent avec le bilan vide (D63), et le tableau le dit. */
    await periodes.getByRole("button", { name: "Mois dernier" }).click();
    await expect(ecran).not.toContainText("Chiffre d’affaires");
    await expect(ecran).toContainText("Aucune vente ne correspond");

    /* Et l'on revient : « Tout » ne borne rien, donc la vente est de retour. */
    await periodes.getByRole("button", { name: "Tout" }).click();
    await expect(ecran).toContainText("1 200 000 FCFA");
  });

  test("la plage libre se saisit, et une fin antérieure au début le dit", async ({ page }) => {
    await seConnecterEtEntrer(page);
    await preparerVente(page);
    await page.goto("/motos/ventes", { waitUntil: "load" });

    const periodes = page.getByRole("group", { name: "Filtrer par période" });
    await periodes.getByRole("button", { name: "Du… au…" }).click();

    const debut = page.getByLabel("Du", { exact: true });
    const fin = page.getByLabel("Au", { exact: true });
    await expect(debut).toBeVisible();
    await expect(fin).toBeVisible();

    await debut.fill("2026-09-30");
    await fin.fill("2026-09-01");
    await expect(contenu(page)).toContainText("La date de fin précède la date de début");
  });

  test("une vente demande une boutique précise : son numéro en porte le code", async ({
    page,
  }) => {
    await seConnecterEtEntrer(page);
    await preparerVente(page);

    await selecteurPerimetre(page).selectOption("");
    await page.goto("/motos/ventes?nouvelle=1", { waitUntil: "load" });

    await expect(contenu(page)).toContainText("Choisissez-en une dans le bandeau");
    await expect(page.getByRole("button", { name: "Enregistrer la vente" })).toHaveCount(0);
  });
});

test.describe("crédit et tranches ne font pas la même chose", () => {
  test("en tranches, la moto reste réservée au magasin", async ({ page }) => {
    await seConnecterEtEntrer(page);
    const { chassis, client } = await preparerVente(page);

    await page.goto("/motos/ventes?nouvelle=1", { waitUntil: "load" });
    await choisirMotoEtClient(page, chassis, client);
    await choisirSegment(page, "Mode de paiement", "Tranches");
    await page.getByLabel(/Montant reçu/).fill("300000");

    const recap = page.getByRole("region", { name: "Récapitulatif de la vente" });
    await expect(recap).toContainText("La moto reste au magasin");
    await expect(recap).toContainText("engagement, pas une recette");

    await page.getByRole("button", { name: "Enregistrer la vente" }).click();
    await expect(contenu(page).getByRole("status")).toContainText("Vente enregistrée", {
      timeout: 20_000,
    });

    // Réservée, pas vendue : c'est toute la différence avec le crédit.
    await page.goto("/motos", { waitUntil: "load" });
    await page.getByLabel("Chercher dans le stock").fill(chassis);
    /* `locator("tr")` et non `getByRole("row")` : sous 1024 px le tableau du
       stock se replie en cartes, ce qui lui retire ses rôles de tableau, et la
       suite tourne sur un Pixel 7. */
    await expect(page.locator("tbody tr").filter({ hasText: chassis })).toContainText(
      "Réservée",
      { timeout: 20_000 },
    );

    await page.goto("/motos/ventes", { waitUntil: "load" });
    await page.getByLabel("Chercher une vente").fill(chassis);
    /* Le châssis ne figure plus dans la ligne — il est dans la fiche —, mais la
       recherche l'accepte toujours : elle ne laisse qu'une vente, et c'est
       celle-là qu'on ouvre. */
    await page.locator("tbody tr").getByRole("link").first().click();
    await expect(contenu(page)).toContainText("la moto reste au magasin");
  });
});

test.describe("le raccourci de l’ancienne adresse", () => {
  /**
   * `/motos/ventes/nouvelle` n'est plus un écran : c'est une redirection vers
   * `?nouvelle=1`. Elle reste dans `ECRANS_HORS_LIGNE` pour une raison précise —
   * un favori, ou une icône posée sur l'écran d'accueil du téléphone, ouverts un
   * jour de coupure. C'est ce que D40 demande de vérifier au moins une fois, et
   * ça vérifie une chose de plus : que la redirection aboutit sans serveur.
   *
   * **La file est vidée avant de couper**, et c'est ce qui sépare ce test du
   * précédent : celui-ci recharge la page, donc il n'a le droit de le faire que
   * lorsque plus rien n'attend d'être envoyé (D97).
   */
  test("l’ancienne adresse ouvre la modale, réseau coupé", async ({ page, context }) => {
    await seConnecterEtEntrer(page);
    await preparerVente(page);

    await page.goto("/motos/ventes", { waitUntil: "load" });
    await prendreLaMainEtMettreEnCache(page, "/motos/ventes");
    await attendreLaFileVide(page);

    await context.setOffline(true);
    await expect(bandeauEtat(page)).toContainText("Hors ligne", { timeout: 30_000 });

    await page.goto("/motos/ventes/nouvelle", { waitUntil: "load" });
    await page.waitForURL("**/motos/ventes?nouvelle=1");
    await expect(page.getByRole("dialog", { name: "Nouvelle vente" })).toBeVisible({
      timeout: 30_000,
    });

    await context.setOffline(false);
  });
});

test.describe("la marge est réservée au responsable", () => {
  test("le gérant enregistre la vente et ne voit pas la marge ; le responsable la voit", async ({
    page,
    browser,
  }) => {
    await seConnecterEtEntrer(page);
    /* Le seul test à deux navigateurs : le gérant ouvre sa propre session, et
       ne verra le décor que lorsqu'il sera parvenu au serveur. */
    const { terrain, chassis, client } = await preparerVente(page);

    // Un gérant rattaché à cette boutique.
    await page.goto("/parametres/utilisateurs", { waitUntil: "load" });
    const email = emailUnique("vente");
    const motDePasse = "gerant-vente-0001";
    await page.getByRole("button", { name: "Créer un compte" }).click();
    const creation = page.getByRole("dialog");
    await creation.getByLabel("Nom", { exact: true }).fill("Gérant des ventes");
    await creation.getByLabel("Adresse e-mail").fill(email);
    await creation.getByLabel("Mot de passe provisoire").fill(motDePasse);
    await creation.getByLabel("Boutique").selectOption(terrain.code);
    await creation.getByRole("button", { name: /Créer le compte/ }).click();
    /* On lit la confirmation de la fonction, pas la liste des comptes.
       La liste vient d'un écouteur sur `users`, une collection que ce
       navigateur n'a jamais mise en cache : quand la connexion Firestore est
       encore encombrée par les écritures du décor, elle répond vide et le test
       accusait la création d'un échec qui n'avait pas eu lieu. La confirmation,
       elle, prouve exactement ce dont ce test a besoin — le compte existe. */
    await expect(contenu(page).getByRole("status")).toContainText("Compte créé", {
      timeout: 30_000,
    });

    // Le gérant vend.
    /* Le second navigateur lit le **serveur**, pas le cache du premier : tant
       que la file d'écritures n'est pas vide, il ne verra rien de ce que le
       décor vient de fabriquer, et l'échec accusera les droits (D97). */
    await attendreLaFileVide(page);

    const contexteGerant = await browser.newContext();
    const pageGerant = await contexteGerant.newPage();
    await seConnecter(pageGerant, email, motDePasse);
    await pageGerant.waitForURL("**/dashboard");

    await pageGerant.goto("/motos/ventes?nouvelle=1", { waitUntil: "load" });
    await expect(contenu(pageGerant)).toContainText("calculée pour le responsable seul", {
      timeout: 30_000,
    });
    await choisirMotoEtClient(pageGerant, chassis, client);
    await choisirSegment(pageGerant, "Mode de paiement", "Comptant");
    await pageGerant.getByLabel(/Montant reçu/).fill("1200000");
    await pageGerant.getByRole("button", { name: "Enregistrer la vente" }).click();
    await expect(contenu(pageGerant).getByRole("status")).toContainText("Vente enregistrée", {
      timeout: 20_000,
    });

    // Sur la fiche, la marge lui est refusée — et on lui dit pourquoi.
    await pageGerant.getByRole("link", { name: "Voir la vente" }).click();
    await expect(contenu(pageGerant)).toContainText("réservés au responsable");
    await expect(contenu(pageGerant)).not.toContainText("335 000");
    /* **Avant de fermer, on attend que sa vente soit partie.** Fermer un
       contexte détruit ce qu'il n'a pas encore envoyé — c'est D97 dans l'autre
       sens, et la symétrie du « avant d'ouvrir un second navigateur » du
       README. Sans cette ligne, la marge se fige quand elle peut : le
       déclencheur ne réagit qu'une fois la vente au serveur, et les soixante
       secondes accordées plus bas partaient d'un instant inconnu. */
    await attendreLaFileVide(pageGerant);
    await contexteGerant.close();

    /* Le responsable, lui, voit le coût figé et la marge. Elle est écrite par
       un déclencheur : elle arrive après la vente, jamais avec elle. */
    await page.goto("/motos/ventes", { waitUntil: "load" });
    await page.getByLabel("Chercher une vente").fill(chassis);
    /* Le châssis ne figure plus dans la ligne — il est dans la fiche —, mais la
       recherche l'accepte toujours : elle ne laisse qu'une vente, et c'est
       celle-là qu'on ouvre. */
    await page.locator("tbody tr").getByRole("link").first().click();
    await expect(contenu(page)).toContainText("850 000 FCFA", { timeout: 60_000 });
    await expect(contenu(page)).toContainText("350 000 FCFA");
  });
});

test.describe("hors ligne", () => {
  test("une vente complète s’enregistre réseau coupé, client créé à la volée", async ({
    page,
    context,
  }) => {
    await seConnecterEtEntrer(page);
    const terrain = await preparerTerrain(page);
    const chassis = chassisUnique("HORSLIGNE");
    await saisirMoto(page, terrain, chassis, { prixAchat: "700000", conseille: "1000000" });

    /* On s'arrête sur la liste des ventes : c'est elle qui charge le stock, le
       fichier clients et les ventes dans le cache Firestore. L'écran de saisie,
       lui, n'aura jamais été visité — c'est exactement le trajet d'un gérant qui
       perd le réseau, et ce que D40 demande de vérifier au moins une fois. */
    await page.goto("/motos/ventes", { waitUntil: "load" });
    await prendreLaMainEtMettreEnCache(page, "/motos/ventes");
    await expect(contenu(page).getByRole("heading", { level: 1 })).toContainText("Ventes");
    /* Pas d'attente de synchronisation avant de couper : tout se joue dans un
       seul navigateur, qui lit son propre cache. L'exiger allongeait le test de
       deux minutes et le faisait tomber en fin de suite chargée — sur la file
       d'attente du décor, jamais sur la vente. */
    await context.setOffline(true);
    await expect(bandeauEtat(page)).toContainText("Hors ligne", { timeout: 30_000 });

    /* **La modale s'ouvre sans quitter la page**, et c'est délibéré ici : un
       `page.goto` rechargerait tout, et Firestore perdrait les écritures du
       décor encore en file (D97). C'est précisément l'erreur qui a fait échouer
       ce test à la première passe de S44 — la file ne se vidait plus jamais au
       retour du réseau. Le lien profond, lui, a son propre test, où rien
       n'attend en file. */
    await page.getByRole("button", { name: "Nouvelle vente" }).click();
    const modale = page.getByRole("dialog", { name: "Nouvelle vente" });
    await expect(modale).toBeVisible({ timeout: 30_000 });

    // La moto se trouve dans le stock local.
    await page.getByLabel("Chercher dans le stock").fill(chassis);
    await page.getByRole("radio", { name: new RegExp(chassis) }).check();

    /* **Le client se tape, il ne se crée pas à part.** Il n'y a aucun bouton
       intermédiaire : les champs sont là, et c'est « Enregistrer la vente » qui
       créera la fiche en même temps que la vente — réseau coupé compris, ce que
       ce test-ci est le seul à prouver. Le commanditaire a demandé ce
       raccourci après essai, et il a raison : au comptoir, créer le client
       n'est pas un geste, c'est une conséquence. */
    const client = `Kaboré ${Date.now().toString(36)}`;
    await modale.getByLabel("Nom", { exact: true }).fill(client);
    await modale.getByLabel("Téléphone", { exact: true }).fill(`76${String(Date.now()).slice(-6)}`);

    // Le numéro est disponible sans réseau : c'est tout l'objet de S7.
    const recap = page.getByRole("region", { name: "Récapitulatif de la vente" });
    await expect(recap.locator(".plaque-code")).toHaveText(
      new RegExp(`^${terrain.code}-\\d{4}-\\d{4}$`),
    );

    await choisirSegment(page, "Mode de paiement", "Tranches");
    await page.getByLabel(/Montant reçu/).fill("250000");
    await page.getByRole("button", { name: "Enregistrer la vente" }).click();

    // Acceptée tout de suite, et comptée comme non partie.
    const confirmation = contenu(page).getByRole("status");
    await expect(confirmation).toContainText("Vente enregistrée");
    const numero = (await confirmation.locator(".plaque-code").textContent())!.trim();
    expect(numero).toMatch(new RegExp(`^${terrain.code}-`));
    await expect(bandeauEtat(page)).toContainText("en attente");

    // La fiche s'ouvre : la vente est déjà dans le cache local.
    await page.getByRole("link", { name: "Voir la vente" }).click();
    /* Même raison qu'aux deux autres endroits : depuis A6 la fiche est un
       panneau de l'écran des ventes, et l'unique `h1` reste « Ventes ». */
    await expect(contenu(page).getByRole("complementary")).toContainText(client);
    await expect(contenu(page)).toContainText("750 000 FCFA"); // reste dû
    await expect(contenu(page)).toContainText("la moto reste au magasin");

    await context.setOffline(false);
    /* Soixante secondes : après une coupure, le SDK Firestore rétablit sa
       connexion avec une attente croissante que le retour du réseau
       n'interrompt pas (D50, S27 au backlog). Ce qu'on vérifie ici, c'est que
       le lot part **tout seul** — pas en combien de temps. */
    await attendreLaFileVide(page, 90_000);
  });
});
