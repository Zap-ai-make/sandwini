/**
 * Captures d’écran pour la revue visuelle (DESIGN.md §14 : « prends une capture
 * et regarde le rendu réel »).
 *
 * Suppose l’application servie sur http://127.0.0.1:3000 (npm run build && npm run start).
 *
 *   node scripts/captures.mjs
 */
import { mkdir } from "node:fs/promises";
import { chromium, devices } from "@playwright/test";

const BASE = process.env.BASE_URL ?? "http://127.0.0.1:3000";
const DOSSIER = "captures";

const RESPONSABLE = { email: "responsable@sdi.test", motDePasse: "responsable-sdi-2026" };
const GERANT = { email: "gerant-captures@sdi.test", motDePasse: "gerant-captures-2026", nom: "Gérant des captures" };

/**
 * Le compte gérant des captures, semé au SDK Admin.
 *
 * **Pourquoi il a fallu l'ajouter** (S39). Ce script ne savait ouvrir qu'une
 * session de responsable, et le disait en commentaire sans y remédier. Depuis
 * que le formulaire d'entrée en stock n'affiche plus les mêmes blocs selon le
 * rôle, la revue visuelle de cet écran ne voyait qu'une de ses deux formes —
 * et l'espace pièces (S20) est un espace de gérant de bout en bout.
 *
 * Il est semé ici plutôt que par `amorcer.mjs` : `amorcer` casse la boucle du
 * premier responsable et n'a pas à connaître les besoins d'un outil de revue.
 * On passe par l'Admin SDK plutôt que par `creerGerant`, pour la même raison
 * qu'`amorcer` : un script de développement n'a pas à rejouer l'interface.
 *
 * Il vise une boutique qui porte **les deux métiers** : sans `pieces`, la garde
 * d'espace refuserait l'onglet des pièces, et les captures de S20 montreraient
 * un refus (D62).
 */
async function semerLeGerant() {
  process.env.FIREBASE_AUTH_EMULATOR_HOST = "127.0.0.1:9399";
  process.env.FIRESTORE_EMULATOR_HOST = "127.0.0.1:8181";
  process.env.GCLOUD_PROJECT = "sdi-dev";

  const { getApps, initializeApp } = await import("firebase-admin/app");
  const { getAuth } = await import("firebase-admin/auth");
  const { getFirestore, FieldValue } = await import("firebase-admin/firestore");
  if (getApps().length === 0) initializeApp({ projectId: "sdi-dev" });
  const auth = getAuth();
  const base = getFirestore();

  /* La boutique d'abord : un gérant sans boutique se connecte sur une
     application vide, et la capture montrerait « aucune boutique attribuée ». */
  const boutiques = await base.collection("boutiques").where("actif", "==", true).get();
  let code = boutiques.docs.find((d) => (d.get("metiers") ?? []).includes("pieces"))?.id;
  if (!code) {
    code = "CAP";
    const trace = {
      createdAt: FieldValue.serverTimestamp(),
      createdBy: "captures",
      createdByName: "Captures",
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: "captures",
      updatedByName: "Captures",
    };
    await base.doc(`boutiques/${code}`).set({
      nom: "Boutique des captures",
      code,
      metiers: ["motos", "pieces"],
      adresse: "Pouytenga",
      telephone: "70 00 00 00",
      actif: true,
      ...trace,
    });
  }

  let compte;
  try {
    compte = await auth.getUserByEmail(GERANT.email);
    await auth.updateUser(compte.uid, { password: GERANT.motDePasse, disabled: false });
  } catch {
    compte = await auth.createUser({
      email: GERANT.email,
      password: GERANT.motDePasse,
      displayName: GERANT.nom,
    });
  }
  await auth.setCustomUserClaims(compte.uid, { role: "gerant", boutiqueId: code });
  await base.doc(`users/${compte.uid}`).set(
    {
      nom: GERANT.nom,
      email: GERANT.email,
      role: "gerant",
      boutiqueId: code,
      actif: true,
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );
  await semerLeStock(base, FieldValue, code);
  return code;
}

/**
 * Deux motos, dont une sans coût.
 *
 * **Un écran photographié vide ne se revoit pas.** `/supervision/couts` existe
 * pour lister ce qui attend un prix d'achat : sans stock, la revue visuelle ne
 * voit qu'un état vide — utile à vérifier une fois, inutile pour juger des
 * colonnes, du repli en cartes et du formulaire de pose.
 *
 * L'une porte son coût, l'autre non : c'est exactement la situation que S39
 * crée, et les deux lignes doivent se distinguer d'un coup d'œil.
 *
 * Rien n'est écrasé si le décor est déjà là — relancer la campagne ne doit pas
 * multiplier les motos.
 */
async function semerLeStock(base, FieldValue, code) {
  const marque = "marque-captures";
  const modele = "modele-captures";
  const provenance = "provenance-captures";
  const trace = () => ({
    createdAt: FieldValue.serverTimestamp(),
    createdBy: "captures",
    createdByName: "Captures",
    updatedAt: FieldValue.serverTimestamp(),
    updatedBy: "captures",
    updatedByName: "Captures",
  });

  await base.doc(`marques/${marque}`).set({ nom: "Apsonic", actif: true, ...trace() });
  await base
    .doc(`modeles/${modele}`)
    .set({ nom: "AP 125", marqueId: marque, actif: true, ...trace() });
  await base.doc(`provenances/${provenance}`).set({ nom: "Lomé", actif: true, ...trace() });

  const motos = [
    { id: "moto-captures-1", chassis: "LC6PCJ1A9K0000111", cout: 850_000 },
    { id: "moto-captures-2", chassis: "LC6PCJ1A9K0000222", cout: null },
  ];
  for (const { id, chassis, cout } of motos) {
    await base.doc(`motos/${id}`).set({
      boutiqueId: code,
      etat: "neuve",
      marqueId: marque,
      modeleId: modele,
      couleur: "Rouge",
      annee: 2025,
      numeroChassis: chassis,
      numeroMoteur: "",
      prixVenteConseille: 1_100_000,
      provenanceId: provenance,
      papiersFournis: [],
      photos: [],
      statut: "en_stock",
      dateEntree: new Date("2026-09-01T09:00:00Z"),
      quittanceChemin: null,
      cmcChemin: null,
      ...trace(),
    });
    if (cout === null) {
      await base.doc(`motos/${id}/prive/cout`).delete();
      continue;
    }
    await base.doc(`motos/${id}/prive/cout`).set({
      boutiqueId: code,
      prixAchat: cout,
      fraisEntree: [],
      coutTotal: cout,
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: "captures",
      updatedByName: "Captures",
    });
  }
}

/** Ouvre une session : la plupart des écrans en exigent une depuis S2. */
async function seConnecter(page, identifiants = RESPONSABLE, arrivee = "**/supervision") {
  await page.goto(`${BASE}/login`, { waitUntil: "load" });
  await page.getByLabel("Adresse e-mail").fill(identifiants.email);
  await page.getByLabel("Mot de passe", { exact: true }).fill(identifiants.motDePasse);
  await page.getByRole("button", { name: /Se connecter/ }).click();
  await page.waitForURL(arrivee);
}

const PRISES = [
  { nom: "connexion-mobile-clair", chemin: "/login", theme: "light", mobile: true, publique: true },
  { nom: "connexion-mobile-sombre", chemin: "/login", theme: "dark", mobile: true, publique: true },
  /* Le panneau de marque, et le numéro de version qu'il porte (`a1:25`),
     n'existent qu'au-delà du seuil `md` : sur mobile, la page de connexion est
     le seul formulaire. Sans ces deux prises, la moitié de l'écran validé par
     le commanditaire n'était jamais regardée (S34). */
  { nom: "connexion-bureau-clair", chemin: "/login", theme: "light", mobile: false, publique: true },
  { nom: "connexion-bureau-sombre", chemin: "/login", theme: "dark", mobile: false, publique: true },
  { nom: "reglages-mobile-clair", chemin: "/parametres", theme: "light", mobile: true },
  { nom: "reglages-bureau-clair", chemin: "/parametres", theme: "light", mobile: false },
  { nom: "reglages-bureau-sombre", chemin: "/parametres", theme: "dark", mobile: false },
  { nom: "boutiques-mobile-clair", chemin: "/parametres/boutiques", theme: "light", mobile: true },
  { nom: "boutiques-bureau-sombre", chemin: "/parametres/boutiques", theme: "dark", mobile: false },
  { nom: "entreprise-mobile-clair", chemin: "/parametres/entreprise", theme: "light", mobile: true },
  { nom: "catalogue-mobile-clair", chemin: "/parametres/catalogue", theme: "light", mobile: true },
  { nom: "catalogue-bureau-sombre", chemin: "/parametres/catalogue", theme: "dark", mobile: false },
  { nom: "referentiels-mobile-clair", chemin: "/parametres/referentiels", theme: "light", mobile: true },
  { nom: "prestataires-bureau-clair", chemin: "/parametres/prestataires", theme: "light", mobile: false },
  { nom: "utilisateurs-mobile-clair", chemin: "/parametres/utilisateurs", theme: "light", mobile: true },
  { nom: "utilisateurs-bureau-sombre", chemin: "/parametres/utilisateurs", theme: "dark", mobile: false },
  /* Le responsable atterrit sur sa supervision, pas sur l'accueil du gérant
     (D63) : c'est donc cet écran-là qu'une session de responsable photographie.
     L'accueil du gérant, lui, est vérifié par la suite bout en bout, qui sait
     ouvrir une session de gérant — ce script ne le sait pas. */
  { nom: "supervision-mobile-clair", chemin: "/supervision", theme: "light", mobile: true },
  { nom: "supervision-mobile-sombre", chemin: "/supervision", theme: "dark", mobile: true },
  { nom: "supervision-bureau-clair", chemin: "/supervision", theme: "light", mobile: false },
  { nom: "supervision-bureau-sombre", chemin: "/supervision", theme: "dark", mobile: false },
  { nom: "clients-mobile-clair", chemin: "/clients", theme: "light", mobile: true },
  { nom: "clients-bureau-sombre", chemin: "/clients", theme: "dark", mobile: false },
  { nom: "motos-mobile-clair", chemin: "/motos", theme: "light", mobile: true },
  /* Le stock est le premier écran à porter un vrai tableau : il se regarde en
     clair comme en sombre, sur bureau — c'est là que les colonnes existent.
     Sur mobile, la même prise montre le repli en cartes. */
  { nom: "motos-bureau-clair", chemin: "/motos", theme: "light", mobile: false },
  { nom: "motos-bureau-sombre", chemin: "/motos", theme: "dark", mobile: false },
  { nom: "motos-nouvelle-mobile-clair", chemin: "/motos/nouvelle", theme: "light", mobile: true, boutique: true },
  { nom: "motos-nouvelle-bureau-sombre", chemin: "/motos/nouvelle", theme: "dark", mobile: false, boutique: true },
  /* **Le même écran vu par un gérant** (S39). Il n'y a plus le bloc « Ce
     qu'elle a coûté » : le prix d'achat se pose depuis la supervision. Sans
     cette prise, la revue visuelle ne verrait qu'une des deux formes de cet
     écran — et c'est celle que personne n'utilise au comptoir. */
  { nom: "motos-nouvelle-gerant-mobile-clair", chemin: "/motos/nouvelle", theme: "light", mobile: true, gerant: true },
  { nom: "motos-nouvelle-gerant-bureau-sombre", chemin: "/motos/nouvelle", theme: "dark", mobile: false, gerant: true },
  /* La liste de choix ouverte sur sa saisie : c'est l'état que S39 ajoute, et
     il ne se voit sur aucune prise au repos. */
  { nom: "motos-nouvelle-gerant-ajout-marque", chemin: "/motos/nouvelle", theme: "light", mobile: true, gerant: true, ajoutMarque: true },
  /* **Le bas des formulaires, et pourquoi il lui faut sa propre prise.** La
     coquille fixe la barre latérale et le bandeau, et fait défiler une zone
     intérieure : la hauteur du document vaut celle de la fenêtre, `fullPage`
     rend donc la même image qu'une prise ordinaire, et viser l'élément ne
     peint pas ce que le conteneur clippe. Un formulaire de dix champs se
     laissait photographier jusqu'au quatrième, et la revue croyait l'avoir vu
     en entier (S39). On fait défiler, comme le fait la personne devant
     l'écran, et on prend la seconde moitié. */
  { nom: "motos-nouvelle-bas-bureau-clair", chemin: "/motos/nouvelle", theme: "light", mobile: false, boutique: true, bas: true },
  { nom: "motos-nouvelle-gerant-bas-bureau-clair", chemin: "/motos/nouvelle", theme: "light", mobile: false, gerant: true, bas: true },
  { nom: "motos-nouvelle-gerant-bas-mobile-sombre", chemin: "/motos/nouvelle", theme: "dark", mobile: true, gerant: true, bas: true },
  /* Les prix d'achat, l'écran que S39 crée pour que le responsable pose ce que
     le gérant ne saisit plus. */
  { nom: "couts-mobile-clair", chemin: "/supervision/couts", theme: "light", mobile: true },
  { nom: "couts-bureau-clair", chemin: "/supervision/couts", theme: "light", mobile: false },
  { nom: "couts-bureau-sombre", chemin: "/supervision/couts", theme: "dark", mobile: false },
  { nom: "ventes-mobile-clair", chemin: "/motos/ventes", theme: "light", mobile: true, boutique: true },
  { nom: "ventes-bureau-sombre", chemin: "/motos/ventes", theme: "dark", mobile: false, boutique: true },
  { nom: "vente-nouvelle-mobile-clair", chemin: "/motos/ventes/nouvelle", theme: "light", mobile: true, boutique: true },
  { nom: "vente-nouvelle-mobile-sombre", chemin: "/motos/ventes/nouvelle", theme: "dark", mobile: true, boutique: true },
  { nom: "vente-nouvelle-bureau-clair", chemin: "/motos/ventes/nouvelle", theme: "light", mobile: false, boutique: true },
  { nom: "vente-nouvelle-bureau-sombre", chemin: "/motos/ventes/nouvelle", theme: "dark", mobile: false, boutique: true },
  /* Sans choix de boutique : le périmètre « toutes » est celui du responsable,
     et c'est le seul qui montre des listes garnies quel que soit l'état de la
     base. Un écran de suivi photographié vide ne se revoit pas. */
  { nom: "paiements-mobile-clair", chemin: "/motos/paiements", theme: "light", mobile: true },
  { nom: "paiements-bureau-sombre", chemin: "/motos/paiements", theme: "dark", mobile: false },
  /* La fiche d'une vente n'a pas d'adresse fixe : c'est un panneau ouvert par
     `?vente=`. On ouvre donc la première de la liste, comme le ferait un
     gérant — sans quoi l'écran qui porte le formulaire de versement ne serait
     jamais regardé. */
  { nom: "vente-fiche-mobile-clair", chemin: "/motos/ventes", theme: "light", mobile: true, premiereVente: true },
  { nom: "vente-fiche-bureau-sombre", chemin: "/motos/ventes", theme: "dark", mobile: false, premiereVente: true },
  { nom: "recus-mobile-clair", chemin: "/motos/recus", theme: "light", mobile: true },
  { nom: "recus-bureau-sombre", chemin: "/motos/recus", theme: "dark", mobile: false },
  /* Le reçu lui-même : un panneau ouvert par `?recu=`, donc atteint en cliquant
     la première ligne de la liste, comme le ferait un gérant. */
  { nom: "recu-mobile-clair", chemin: "/motos/recus", theme: "light", mobile: true, premierRecu: true },
  { nom: "recu-bureau-sombre", chemin: "/motos/recus", theme: "dark", mobile: false, premierRecu: true },
  /* **Le rendu imprimé, qui est le vrai livrable de S10.** Un `@media print`
     cassé ne se voit sur aucune capture ordinaire : sans cette prise, la revue
     visuelle regarderait un écran et croirait avoir vu le papier. */
  { nom: "recu-papier", chemin: "/motos/recus", theme: "light", mobile: false, premierRecu: true, impression: true },
  { nom: "diagnostic-mobile-clair", chemin: "/diagnostic", theme: "light", mobile: true, boutique: true },
  { nom: "diagnostic-bureau-sombre", chemin: "/diagnostic", theme: "dark", mobile: false, boutique: true },
  { nom: "hors-ligne-mobile-clair", chemin: "/hors-ligne", theme: "light", mobile: true },
  // Le bandeau en alerte : l’état signature du produit.
  { nom: "supervision-mobile-coupe", chemin: "/supervision", theme: "light", mobile: true, coupe: true },
  { nom: "supervision-mobile-sombre-coupe", chemin: "/supervision", theme: "dark", mobile: true, coupe: true },
];

/* Un filtre facultatif : `node scripts/captures.mjs connexion` ne reprend que
   les prises dont le nom correspond. La série entière ouvre une cinquantaine de
   sessions ; en revoir deux après un changement ne doit pas coûter la série. */
const filtre = process.argv[2] ? new RegExp(process.argv[2]) : null;
const aPrendre = filtre ? PRISES.filter(({ nom }) => filtre.test(nom)) : PRISES;

await mkdir(DOSSIER, { recursive: true });
if (aPrendre.some((prise) => prise.gerant || prise.chemin.startsWith("/supervision/couts"))) {
  const code = await semerLeGerant();
  console.log(`compte gérant prêt : ${GERANT.email} (boutique ${code})`);
}
const navigateur = await chromium.launch();

for (const {
  nom,
  chemin,
  theme,
  mobile,
  coupe,
  publique,
  boutique,
  premiereVente,
  premierRecu,
  impression,
  gerant,
  ajoutMarque,
  bas,
} of aPrendre) {
  const contexte = await navigateur.newContext({
    ...(mobile ? devices["Pixel 7"] : { viewport: { width: 1280, height: 820 } }),
    colorScheme: theme,
  });
  const page = await contexte.newPage();
  let boutiqueChoisie = null;
  if (gerant) {
    /* Le gérant atterrit sur son accueil, pas sur la supervision (D63), et son
       périmètre est sa boutique : rien à choisir dans le bandeau. */
    await seConnecter(page, GERANT, "**/dashboard");
  } else if (!publique) {
    await seConnecter(page);
  }

  /* Certains écrans n'ont de sens que dans une boutique précise : le formulaire
     d'entrée en stock demande où ranger la moto. On en choisit une, comme le
     ferait le responsable avant de saisir. */
  if (boutique) {
    const selecteur = page.getByRole("banner").getByRole("combobox", { name: "Boutique affichée" });
    /* On attend une option qui porte vraiment un code : la première, « Toutes
       les boutiques », existe avant que la liste soit chargée. */
    await selecteur.locator('option[value]:not([value=""])').first().waitFor({
      state: "attached",
      timeout: 20000,
    });
    const codes = await selecteur.locator("option").evaluateAll((options) =>
      options.map((option) => option.value).filter(Boolean),
    );
    await selecteur.selectOption(codes[0]);
    boutiqueChoisie = codes[0];
  }

  await page.goto(`${BASE}${chemin}`, { waitUntil: "load" });
  await page.locator("h1").first().waitFor({ timeout: 20000 });

  /* Le périmètre se vérifie **après** la navigation, pas avant.
     Le choix est mémorisé tout de suite, mais l'écran d'arrivée le relit à son
     propre rythme : photographié trop tôt, il montre encore « Toutes les
     boutiques ». La version précédente ne vérifiait rien du tout, et avalait
     même l'échec du choix — depuis S5, les captures de `motos/nouvelle`
     montraient l'invitation à choisir une boutique, et la revue visuelle
     portait sur un écran vide sans que cela se voie. Un outil de revue qui ne
     montre pas ce qu'on croit est pire que pas d'outil. */
  if (boutiqueChoisie) {
    const selecteur = page.getByRole("banner").getByRole("combobox", { name: "Boutique affichée" });
    let applique = false;
    for (let essai = 0; essai < 40 && !applique; essai += 1) {
      applique = (await selecteur.inputValue().catch(() => "")) === boutiqueChoisie;
      if (!applique) await page.waitForTimeout(500);
    }
    if (!applique) {
      throw new Error(`Le périmètre ne s'est pas appliqué à « ${nom} » (attendu ${boutiqueChoisie}).`);
    }
  }
  /* Une capture prise pendant « Chargement… » ne dit rien du rendu réel : on
     attend que les listes en direct soient arrivées (DESIGN.md §14). */
  await page
    .getByText(/Chargement/)
    .first()
    .waitFor({ state: "detached", timeout: 15000 })
    .catch(() => {});
  /* Le patron `Tableau` ne dit pas "Chargement" : il occupe la place du
     contenu a venir avec des lignes fantomes (`.squelette`). La campagne les
     photographiait donc comme si c'etait le rendu -- un ecran gris, et une
     revue qui croit avoir vu un tableau. */
  await page
    .locator(".squelette")
    .first()
    .waitFor({ state: "detached", timeout: 20000 })
    .catch(() => {});
  if (premiereVente || premierRecu) {
    /* Dans le contenu, pas n'importe où : la navigation principale est elle
       aussi une liste, et sa première entrée renvoyait à l'accueil.

       Une ligne de tableau **ou** un élément de liste : depuis S29 les ventes
       sont un tableau (A6) et les reçus une liste. La campagne cherchait un
       `listitem` sur les deux et s'arrêtait net sur la fiche de vente — elle
       n'avait pas été rejouée depuis. Un outil de revue qui ne suit pas les
       écrans qu'il photographie ne revoit plus rien. */
    const premiere = page
      .getByRole("main")
      .locator("tbody tr, li")
      .first()
      .getByRole("link")
      .first();
    await premiere.waitFor({ timeout: 20000 });
    await premiere.click();
    await page.locator("h1").first().waitFor({ timeout: 20000 });
    /* Un panneau se remplit après son ouverture, et plus lentement que la
       liste qui l'a appelé : quinze secondes ne suffisaient pas, et la
       campagne photographiait « Chargement de la vente… » — c'est-à-dire
       rien. On regarde le rendu réel, ou on ne regarde pas (`DESIGN.md` §14). */
    await page
      .getByText(/Chargement/)
      .first()
      .waitFor({ state: "detached", timeout: 30000 })
      .catch(() => {});
    await page.waitForTimeout(1500);
  }
  /* « + Ajouter une marque… » remplace le select par un champ : c'est l'état
     que S39 ajoute, et il n'existe sur aucune capture au repos. */
  if (ajoutMarque) {
    await page.getByLabel("Marque", { exact: true }).selectOption("__nouvelle__");
    await page.getByLabel(/^Nouvelle marque/).fill("Apsonic");
    await page.waitForTimeout(300);
  }
  if (coupe) {
    await contexte.setOffline(true);
    await page.getByRole("status").getByText("Hors ligne").waitFor({ timeout: 5000 });
  }
  /* On regarde ce qui sortira de l'imprimante, pas ce qui est à l'écran : la
     feuille `@media print` retire la coquille, repasse la palette en clair et
     ajoute les traits de signature (DESIGN.md §14 — regarder le rendu réel). */
  if (impression) await page.emulateMedia({ media: "print" });

  if (bas) {
    await page.getByRole("button", { name: /Faire entrer en stock/ }).scrollIntoViewIfNeeded();
    await page.waitForTimeout(400);
  }
  await page.screenshot({ path: `${DOSSIER}/${nom}.png`, fullPage: !mobile });
  console.log(`capturé  ${DOSSIER}/${nom}.png`);
  await contexte.close();
}

await navigateur.close();
