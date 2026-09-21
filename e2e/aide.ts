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

/**
 * Connexion du responsable, suivie de son arrivée effective.
 *
 * Le responsable atterrit sur la supervision, pas sur l'accueil du gérant
 * (D63) : c'est de là qu'il choisit la boutique qu'il regarde.
 */
export async function seConnecterEtEntrer(page: Page) {
  await seConnecter(page);
  await page.waitForURL("**/supervision");
  await expect(page.getByRole("heading", { name: "Supervision", level: 1 })).toBeVisible();
}

/**
 * Attend que **tout ce qui vient d'être écrit soit parti au serveur**.
 *
 * `À jour` au bandeau veut dire : la file d'écritures Firestore est vide. Rien
 * d'autre dans le produit ne dit cela, et c'est exactement la question que le
 * décor doit se poser avant deux gestes précis.
 *
 * **Avant d'ouvrir un second navigateur** (S27, D97). Un navigateur qui vient
 * d'écrire lit son propre cache et n'a rien à attendre — c'est la promesse du
 * produit. Mais le cache n'est pas partagé : le gérant qui se connecte dans un
 * second contexte lit le **serveur**, et ne voit rien tant que la file n'a pas
 * été vidée. Sans cette attente, le test échoue sur une fiche absente, et
 * l'échec accuse le produit d'un défaut de droits qu'il n'a pas.
 *
 * **Avant de couper le réseau.** Même raison, prise par l'autre bout : une
 * écriture encore en file n'est pas durablement en cache, et un rechargement
 * de page la perd. Le test se retrouve alors hors ligne sans la donnée qu'il
 * vient de fabriquer — c'est ce qui a fait échouer le test hors ligne des motos
 * pendant S40, sur une option de liste manquante.
 *
 * **Une fois, à la frontière — jamais document par document.** Attendre le
 * serveur à chaque écriture du décor fabriquerait la contention que S27 mesure
 * (`CAHIER-DU-RESTE` §3.3) : la suite deviendrait plus lente **et** plus
 * fragile, l'attente elle-même finissant par expirer.
 *
 * Le budget est large parce que le SDK Firestore reste dans son cycle de
 * reconnexion à attente croissante (D50) : après une coupure, la file peut
 * mettre près d'une minute à repartir.
 */
export async function attendreLaFileVide(page: Page) {
  await expect(bandeauEtat(page)).toContainText("À jour", { timeout: 120_000 });
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

/**
 * Déclare une boutique par le formulaire de S3, avec ses métiers.
 *
 * Passer par l'interface plutôt que par le SDK Admin : c'est le vrai chemin
 * d'un premier jour d'utilisation, et c'est le seul qui vérifie que les cases à
 * cocher écrivent bien ce que les règles attendent.
 */
export async function creerBoutique(
  page: Page,
  code: string,
  metiers: readonly ("Motos" | "Pièces détachées")[] = ["Motos"],
) {
  await page.goto("/parametres/boutiques", { waitUntil: "load" });
  const formulaire = page.locator("form").filter({
    has: page.getByRole("button", { name: "Créer la boutique" }),
  });
  await formulaire.getByLabel("Nom de la boutique").fill(`Boutique ${code}`);
  await formulaire.getByLabel(/^Code/).fill(code);
  for (const metier of metiers) {
    await formulaire.getByRole("checkbox", { name: metier, exact: true }).check();
  }
  await formulaire.getByRole("button", { name: "Créer la boutique" }).click();
  await expect(ligneDeBoutique(page, code)).toBeVisible();

  /* La ligne apparaît dès que le cache local a pris l'écriture — c'est toute la
     promesse hors-ligne, et ce n'est pas une preuve que le serveur l'a vue.
     Or rattacher un gérant à cette boutique passe par une Cloud Function qui
     lit le serveur, elle : enchainer trop vite répond « Cette boutique
     n'existe pas ». Le bandeau dit quand la file d'écritures est vidée, et
     c'est le seul signal qui le dise. */
  await expect(bandeauEtat(page)).toContainText("À jour", { timeout: 30_000 });
}

/** Ajoute une marque et l'un de ses modèles au catalogue, par l'écran de S39. */
export async function ajouterMarqueEtModele(page: Page, marque: string, modele: string) {
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

  await creerBoutique(page, code, ["Motos"]);

  await ajouterMarqueEtModele(page, marque, modele);

  await page.goto("/parametres/referentiels", { waitUntil: "load" });
  const provenances = page
    .locator("section")
    .filter({ has: page.getByRole("heading", { name: "Provenances" }) });
  await provenances.getByLabel("Ajouter une provenance").fill(provenance);
  await provenances.getByRole("button", { name: "Ajouter" }).click();
  await expect(provenances.getByRole("listitem").filter({ hasText: provenance })).toBeVisible();

  // On se place dans la boutique : une moto entre quelque part de précis.
  await selecteurPerimetre(page).selectOption(code);

  /* **Une fois, à la sortie du décor** (S27, D97). Ce qui vient d'être écrit
     l'a été de façon optimiste : l'écran le montre avant que Firestore l'ait
     posé durablement. Le prochain `page.goto` recharge la page entière et
     repart du cache sur disque — une écriture encore en vol n'y est pas, et le
     modèle disparaît de la liste des choix. Mesuré pendant S40 : le serveur
     avait le document, le navigateur ne l'avait plus. */
  await attendreLaFileVide(page);

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

  /* **Le champ n'existe que pour le responsable depuis S39.** Le gérant fait
     entrer la moto ; la supervision pose ce qu'elle a coûté. L'aide ne force
     donc rien : elle renseigne le prix là où on le lui demande, et laisse la
     moto entrer sans coût partout ailleurs — ce qui est le trajet réel du
     comptoir. Le test qui vérifie que ce champ est absent chez le gérant vit
     dans `motos.spec.ts`, pas ici : une aide ne prouve rien. */
  const prixAchat = page.getByLabel("Prix d’achat");
  if (await prixAchat.count()) await prixAchat.fill(options.prixAchat ?? "850000");
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
/**
 * Choisit la moto et le client dans la modale de vente déjà ouverte.
 *
 * **Les deux listes sont vides tant qu'on n'a pas tapé** (S44) : ce n'est pas
 * une commodité du décor, c'est le comportement même de l'écran. Remplir le
 * champ de recherche est donc la seule façon de faire apparaître le bouton
 * radio — et c'est aussi ce qui donne au test un point d'attente réel.
 */
export async function ouvrirLaVente(
  page: Page,
  { chassis, client }: { chassis: string; client: string },
) {
  await page.getByLabel("Chercher dans le stock").fill(chassis);
  await page.getByRole("radio", { name: new RegExp(chassis) }).check();
  await page.getByLabel("Chercher un client").fill(client);
  await page.getByRole("radio", { name: new RegExp(client) }).check();
}

/**
 * Choisit une option dans un groupe segmenté (`components/patrons/Segmente`).
 *
 * **On clique l'étiquette, pas le bouton radio.** Le radio y est `sr-only` —
 * un carré d'un pixel que Playwright refuse de cliquer, parce que le point
 * qu'il vise tombe sur le cadre qui le recouvre. C'est déjà la convention du
 * dépôt pour les deux radios de `PanneauPiece` (`pieces.spec.ts`), et c'est
 * aussi le geste réel : personne ne vise un pixel, on touche le segment.
 *
 * Le groupe est nommé parce que la modale de vente en porte deux — le mode et
 * le moyen de paiement — et que « Espèces » ne doit pas se chercher dans le
 * mauvais.
 */
export async function choisirSegment(page: Page, groupe: string, option: string) {
  await page
    .getByRole("radiogroup", { name: groupe })
    .getByText(option, { exact: true })
    .click();
}

export async function vendre(
  page: Page,
  options: { mode: "Crédit" | "Tranches"; prix: string; encaisse: string },
): Promise<{ terrain: Terrain; client: string; chassis: string; numero: string }> {
  const terrain = await preparerTerrain(page);
  const chassis = chassisUnique("PAIE");
  await saisirMoto(page, terrain, chassis, { prixAchat: "700000", conseille: options.prix });

  const client = `Zongo ${Date.now().toString(36)}`;
  await creerClientDepuisLeFichier(page, client, `78${String(Date.now()).slice(-6)}`);

  /* **La frontière de ce décor-ci**, et elle a coûté quatre échecs par passe
     avant d'être vue (S27). L'écran de saisie s'ouvre par un chargement complet
     et cherche ensuite la moto puis le client dans le cache Firestore. Le
     client vient d'être créé ; sa confirmation à l'écran est optimiste, et ne
     dit rien de sa persistance. Sans cette attente, le test expirait sur un
     `radio` de client qui n'existait nulle part — ni au cache, ni au serveur —
     et l'échec ressemblait trait pour trait à de la lenteur. */
  await attendreLaFileVide(page);

  /* Depuis S44 la vente s'enregistre dans une modale posée sur le registre,
     et non plus sur une page à elle. Le paramètre d'écran l'ouvre directement :
     c'est le chemin qu'un raccourci emprunte, et il évite au décor de dépendre
     de la place d'un bouton. */
  await page.goto("/motos/ventes?nouvelle=1", { waitUntil: "load" });
  await ouvrirLaVente(page, { chassis, client });
  await page.getByLabel("Prix convenu", { exact: true }).fill(options.prix);
  await choisirSegment(page, "Mode de paiement", options.mode);
  await page.getByLabel(/Montant reçu/).fill(options.encaisse);
  await page.getByRole("button", { name: "Enregistrer la vente" }).click();

  const confirmation = contenu(page).getByRole("status");
  await expect(confirmation).toContainText("Vente enregistrée", { timeout: 20_000 });
  const numero = (await confirmation.locator(".plaque-code").textContent())!.trim();

  await page.getByRole("link", { name: "Voir la vente" }).click();
  /* Depuis A6, la fiche est un panneau de l'écran des ventes et non plus une
     page : l'unique `h1` reste « Ventes », et c'est le repère `complementary`,
     nommé « Vente <numéro> », qui porte la vente ouverte. */
  await expect(contenu(page).getByRole("complementary")).toContainText(client);

  return { terrain, client, chassis, numero };
}

/** Encaisse un versement depuis la fiche de vente ouverte. */
export async function encaisser(page: Page, montant: string) {
  await page.getByLabel("Montant reçu").fill(montant);
  await page.getByRole("button", { name: "Enregistrer le versement" }).click();
}

/**
 * Déclare un prestataire qui traite la carte grise.
 *
 * Attend la synchronisation : la liste du formulaire de dépôt lit le serveur,
 * et un prestataire encore dans la file d'écriture n'y apparaît pas (D64).
 */
export async function creerPrestataire(page: Page, nom: string) {
  await page.goto("/parametres/prestataires", { waitUntil: "load" });
  const formulaire = page.locator("form").filter({ hasText: "Ajouter un prestataire" });
  await formulaire.getByLabel("Nom", { exact: true }).fill(nom);
  await formulaire.getByLabel("Téléphone").fill("70112233");
  /* Un seul type depuis S48 : la plaque a quitté le dossier, l'immatriculation
     étant obtenue avec la carte grise et chez le même prestataire. */
  await formulaire.getByLabel("Carte grise").check();
  await formulaire.getByRole("button", { name: "Enregistrer le prestataire" }).click();
  /* Sur le message de confirmation, pas sur la liste : le nom apparaît aux deux
     endroits, et Playwright refuse l'ambiguïté. Même piège qu'en D55, et même
     remède — viser le `role="status"`, qui n'existe qu'une fois. */
  await expect(contenu(page).getByRole("status")).toContainText("est enregistré");
  await expect(bandeauEtat(page)).toContainText("À jour", { timeout: 30_000 });
}
