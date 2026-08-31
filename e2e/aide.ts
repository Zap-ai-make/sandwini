import { expect, type Page } from "@playwright/test";

/**
 * Outils partagés par les tests bout en bout.
 *
 * Deux régions vivantes coexistent dans l'application : le bandeau d'état, qui
 * annonce le réseau en permanence, et les messages des formulaires. Toutes deux
 * portent légitimement `role="status"` ou `role="alert"` — un lecteur d'écran
 * doit entendre les deux. Les tests visent donc la zone de contenu plutôt que
 * la page entière, sans quoi ils lisent le bandeau à la place du formulaire.
 * Next ajoute par-dessus son propre annonceur de route, également `role=alert`.
 */

export const RESPONSABLE = {
  email: "responsable@sdi.test",
  motDePasse: "responsable-sdi-2026",
};

/** Le contenu de l'écran, à l'exclusion du bandeau et de la navigation. */
export function contenu(page: Page) {
  return page.getByRole("main");
}

/** Le message d'erreur du formulaire affiché à l'écran. */
export function messageErreur(page: Page) {
  return contenu(page).getByRole("alert");
}

/** Le message de confirmation du formulaire affiché à l'écran. */
export function messageSucces(page: Page) {
  return contenu(page).getByRole("status");
}

/** L'indicateur réseau du bandeau, qui vit hors de la zone de contenu. */
export function bandeauEtat(page: Page) {
  return page.getByRole("banner").getByRole("status");
}

export async function seConnecter(
  page: Page,
  email: string = RESPONSABLE.email,
  motDePasse: string = RESPONSABLE.motDePasse,
) {
  await page.goto("/login");
  await page.getByLabel("Adresse e-mail").fill(email);
  await page.getByLabel("Mot de passe", { exact: true }).fill(motDePasse);
  await page.getByRole("button", { name: /Se connecter/ }).click();
}

/** Connexion suivie de l'arrivée effective sur l'accueil. */
export async function seConnecterEtEntrer(page: Page) {
  await seConnecter(page);
  await page.waitForURL("**/dashboard");
  await expect(page.getByRole("heading", { name: "Accueil", level: 1 })).toBeVisible();
}

/** L'indicateur de périmètre du bandeau : sélecteur pour le responsable, texte pour le gérant. */
export function selecteurPerimetre(page: Page) {
  return page.getByRole("banner").getByRole("combobox", { name: "Boutique affichée" });
}

/**
 * Un code de boutique neuf par exécution.
 *
 * Les boutiques ne se suppriment pas — leur code vit dans des numéros de reçus —
 * et les émulateurs gardent leurs données d'un test à l'autre. Réutiliser un
 * code ferait échouer la deuxième exécution pour une raison qui n'est pas celle
 * qu'on teste.
 */
export function codeUnique(): string {
  const lettres = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  return Array.from({ length: 3 }, () => lettres[Math.floor(Math.random() * 26)]).join("");
}

/** Un e-mail neuf par exécution : les comptes ne se suppriment jamais. */
export function emailUnique(prefixe: string) {
  return `${prefixe}-${Date.now()}-${Math.floor(Math.random() * 1000)}@sdi.test`;
}

/**
 * Un libellé neuf par exécution.
 *
 * Les référentiels ne se suppriment pas — ils sont cités par des motos et des
 * dossiers — et les émulateurs gardent leurs données d'un test à l'autre.
 * Réutiliser un nom ferait échouer la deuxième exécution sur le contrôle de
 * doublon, c'est-à-dire pour une raison qui n'est pas celle qu'on teste.
 */
export function nomUnique(prefixe: string): string {
  return `${prefixe} ${Date.now().toString(36)}${Math.floor(Math.random() * 100)}`;
}

/**
 * Attend que le service worker **contrôle** la page — actif ne suffit pas — puis
 * recharge une fois en ligne.
 *
 * La toute première visite passe à côté du service worker, qui n'existait pas
 * encore quand le document a été demandé. Ce second passage est celui qui met
 * la page en cache. C'est aussi le trajet réel d'un gérant : il ouvre
 * l'application au magasin, puis perd le réseau.
 */
export async function prendreLaMainEtMettreEnCache(page: Page, chemin: string) {
  await page.waitForFunction(() => Boolean(navigator.serviceWorker?.controller), null, {
    timeout: 30_000,
  });
  await page.reload({ waitUntil: "load" });
  await page.waitForURL(`**${chemin}`);
}

/**
 * La ligne de liste qui porte ce code de boutique.
 *
 * Le code est cherché en **début de mot**, pas n'importe où dans le texte.
 * `hasText` avec une chaîne cherche une sous-chaîne, sans tenir compte de la
 * casse : le code « NTR » se retrouvait ainsi au milieu de « Marché central »,
 * et l'assertion échouait sur six lignes à la fois. Un code tiré au hasard
 * finit tôt ou tard par se cacher dans un libellé fixe — le test doit demander
 * le code, pas une suite de lettres.
 */
export function ligneDeBoutique(page: Page, code: string) {
  return page.getByRole("listitem").filter({ hasText: new RegExp(`\\b${code}`) });
}

export type Terrain = { code: string; marque: string; modele: string; provenance: string };

/**
 * Met en place ce qu'une moto exige avant d'exister : une boutique où la ranger,
 * une marque, un modèle et une provenance. Tout passe par l'interface — c'est
 * le vrai chemin d'un premier jour d'utilisation.
 *
 * Partagé par les suites du stock (S5) et des ventes (S8) : une vente a besoin
 * du même décor, et en tenir deux copies, c'était s'assurer qu'elles divergent.
 */
export async function preparerTerrain(page: Page): Promise<Terrain> {
  const code = codeUnique();
  const marque = nomUnique("Yamaha");
  const modele = nomUnique("Crux");
  const provenance = nomUnique("Import");

  await page.goto("/parametres/boutiques", { waitUntil: "load" });
  const formulaire = page.locator("form").filter({
    has: page.getByRole("button", { name: "Créer la boutique" }),
  });
  await formulaire.getByLabel("Nom de la boutique").fill(`Boutique ${code}`);
  await formulaire.getByLabel(/^Code/).fill(code);
  await formulaire.getByRole("button", { name: "Créer la boutique" }).click();
  await expect(ligneDeBoutique(page, code)).toBeVisible();

  await page.goto("/parametres/catalogue", { waitUntil: "load" });
  const marques = page
    .locator("section")
    .filter({ has: page.getByRole("heading", { name: "Marques" }) });
  await marques.getByLabel("Ajouter une marque").fill(marque);
  await marques.getByRole("button", { name: "Ajouter" }).click();
  await expect(marques.getByRole("listitem").filter({ hasText: marque })).toBeVisible();

  const modeles = page
    .locator("section")
    .filter({ has: page.getByRole("heading", { name: "Modèles" }) });
  await modeles.getByLabel("Marque").selectOption({ label: marque });
  await modeles.getByLabel(/^Ajouter un modèle/).fill(modele);
  await modeles.getByRole("button", { name: "Ajouter" }).click();
  await expect(modeles.getByRole("listitem").filter({ hasText: modele })).toBeVisible();

  await page.goto("/parametres/referentiels", { waitUntil: "load" });
  const provenances = page
    .locator("section")
    .filter({ has: page.getByRole("heading", { name: "Provenances" }) });
  await provenances.getByLabel("Ajouter une provenance").fill(provenance);
  await provenances.getByRole("button", { name: "Ajouter" }).click();
  await expect(provenances.getByRole("listitem").filter({ hasText: provenance })).toBeVisible();

  // On se place dans la boutique : une moto entre quelque part de précis.
  await selecteurPerimetre(page).selectOption(code);

  return { code, marque, modele, provenance };
}

/** Fait entrer une moto en stock par le formulaire de S5. */
export async function saisirMoto(
  page: Page,
  terrain: Terrain,
  chassis: string,
  options: { prixAchat?: string; conseille?: string; refusAttendu?: boolean } = {},
) {
  await page.goto("/motos/nouvelle", { waitUntil: "load" });
  await page.getByLabel("Marque").selectOption({ label: terrain.marque });
  await page.getByLabel("Modèle").selectOption({ label: terrain.modele });
  await page.getByLabel("Numéro de châssis").fill(chassis);
  await page.getByLabel("Provenance").selectOption({ label: terrain.provenance });
  await page.getByLabel("Prix d’achat").fill(options.prixAchat ?? "850000");
  if (options.conseille) {
    await page.getByLabel(/Prix de vente conseillé/).fill(options.conseille);
  }
  await page.getByRole("button", { name: "Faire entrer en stock" }).click();

  if (options.refusAttendu) return;

  /* On attend la confirmation avant de quitter l'écran, comme le ferait
     quelqu'un qui la lit. Enchaîner deux saisies sans l'attendre quittait la
     page pendant que Firestore écrivait encore dans son cache local. */
  await expect(contenu(page).getByRole("status")).toContainText(
    chassis.replace(/[\s-]+/g, "").toUpperCase(),
    { timeout: 20_000 },
  );
}

/** Crée un client depuis l'écran du fichier clients (S6). */
export async function creerClientDepuisLeFichier(page: Page, nom: string, telephone: string) {
  await page.goto("/clients", { waitUntil: "load" });
  await page.getByRole("button", { name: "Nouveau client" }).click();
  const formulaire = page.locator("form").filter({
    has: page.getByRole("button", { name: "Créer le client" }),
  });
  await formulaire.getByLabel("Nom", { exact: true }).fill(nom);
  await formulaire.getByLabel("Téléphone", { exact: true }).fill(telephone);
  await formulaire.getByRole("button", { name: "Créer le client" }).click();
  await expect(contenu(page).getByRole("status")).toContainText(nom, { timeout: 20_000 });
}

/** Un numéro de châssis neuf par exécution, sur le même principe. */
export function chassisUnique(prefixe: string): string {
  return `${prefixe}${Date.now().toString(36).toUpperCase()}`;
}

/**
 * Enregistre une vente de bout en bout et ouvre sa fiche.
 *
 * Monté pour S9, repris tel quel par S10 : un reçu a besoin exactement du même
 * décor qu'un versement — boutique, référentiels, moto, client, vente — et en
 * tenir deux copies, c'était s'assurer qu'elles divergent (même raison que
 * `preparerTerrain`).
 *
 * `encaisse` est le montant déposé le jour de la vente, celui que S8 écrit dans
 * le lot. Tout le reste vient après.
 */
export async function vendre(
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

/** Encaisse un versement depuis la fiche de vente ouverte. */
export async function encaisser(page: Page, montant: string) {
  await page.getByLabel("Montant reçu").fill(montant);
  await page.getByRole("button", { name: "Enregistrer le versement" }).click();
}
