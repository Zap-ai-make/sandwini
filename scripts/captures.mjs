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
  await semerDesArrivages(base, FieldValue, code);
  await semerLesPieces(base, FieldValue, code);
  await semerUneBoutiqueDePieces(base, FieldValue);
  await semerDesVentes(base, FieldValue, code);
  return code;
}

/**
 * Deux ventes qui ne se ressemblent pas — et c'est tout l'enjeu de S48.
 *
 * **Sans elles, trois écrans se photographiaient à vide.** Les émulateurs
 * démarrent sans rien : `/motos/ventes`, `/motos/paiements` et
 * `/motos/dossiers` montraient leur état vide, et la campagne prétendait avoir
 * regardé le filtre de période, la liste unique des paiements et le dossier à
 * trois documents. *Un écran vide ne prouve pas qu'on a regardé, il prouve
 * qu'on n'avait rien à voir.*
 *
 * L'une est **à crédit** — la moto est partie, le client doit l'argent ; l'autre
 * en **tranches** — la moto dort au magasin, qui détient ce qui est versé.
 * `AGENTS.md` appelle la confusion de ces deux notions la plus coûteuse du
 * projet, et S48 vient précisément de les réunir dans une seule liste : la
 * campagne doit donc pouvoir montrer les deux côte à côte, avec leur colonne
 * « Mode » et leurs deux totaux qu'on ne somme jamais.
 *
 * On écrit **ce que le produit écrit**, et rien de plus : la vente, ses trois
 * documents de dossier, son versement, son encaissement. Pas d'agrégat calculé
 * à la main — `totalPaye` et `resteDu` sont posés parce que le client les pose
 * aussi (`enregistrerVente`), et les déclencheurs feront le reste sur
 * l'émulateur, comme en vrai. C'est la règle de D84, déjà suivie par
 * `semerLesPieces` : semer ce que le produit n'écrit pas, c'est semer un décor
 * qui ne vérifie rien.
 *
 * Les motos vendues sont **les siennes**, et pas celles de `semerLeStock` :
 * celles-là servent à `/supervision/couts`, qui a besoin de motos *en stock*.
 * Les vendre viderait l'écran qu'elles existent pour garnir.
 */
async function semerDesVentes(base, FieldValue, code) {
  const trace = () => ({
    createdAt: FieldValue.serverTimestamp(),
    createdBy: "captures",
    createdByName: "Captures",
    updatedAt: FieldValue.serverTimestamp(),
    updatedBy: "captures",
    updatedByName: "Captures",
  });

  await base.doc("clients/client-captures").set({
    nom: "Ouédraogo",
    prenom: "Salif",
    nip: "",
    nomNormalise: "ouedraogo salif",
    telephone: "70 11 22 33",
    telephoneNormalise: "70112233",
    telephone2: "",
    adresse: "Pouytenga",
    note: "",
    ...trace(),
  });

  /* Le jour du mois courant, pour que « Ce mois-ci » ne rende pas une liste
     vide : c'est la pastille que la campagne engage pour S46. */
  const date = new Date();

  const ventes = [
    {
      id: "vente-captures-credit",
      numero: `${code}-CAP-0001`,
      moto: "moto-captures-vendue-1",
      chassis: "LC6PCJ1A9K0000333",
      mode: "credit",
      prix: 1_100_000,
      verse: 300_000,
    },
    {
      id: "vente-captures-tranches",
      numero: `${code}-CAP-0002`,
      moto: "moto-captures-vendue-2",
      chassis: "LC6PCJ1A9K0000444",
      mode: "tranches",
      prix: 950_000,
      verse: 400_000,
    },
  ];

  for (const { id, numero, moto, chassis, mode, prix, verse } of ventes) {
    /* La moto d'abord : une vente qui désigne un `motoId` introuvable donne
       une ligne sans modèle ni châssis, et la capture montrerait un tiret là
       où l'écran montre une moto. */
    await base.doc(`motos/${moto}`).set({
      boutiqueId: code,
      etat: "neuve",
      marqueId: "marque-captures",
      modeleId: "modele-captures",
      couleur: "Noire",
      annee: 2025,
      numeroChassis: chassis,
      numeroMoteur: "",
      prixVenteConseille: prix,
      provenanceId: "provenance-captures",
      papiersFournis: [],
      photos: [],
      /* En tranches la moto n'est pas partie : elle est *réservée*, et c'est
         la moitié visible de la distinction que S48 devait préserver. */
      statut: mode === "tranches" ? "reservee" : "vendue",
      dateEntree: new Date("2026-09-02T09:00:00Z"),
      quittanceChemin: null,
      cmcChemin: null,
      ...trace(),
    });

    const motoRemise = mode !== "tranches";
    await base.doc(`ventesMotos/${id}`).set({
      numero,
      numeroInitial: numero,
      boutiqueId: code,
      motoId: moto,
      clientId: "client-captures",
      date,
      prixConvenu: prix,
      modePaiement: mode,
      carteGrise: true,
      casque: true,
      totalPaye: verse,
      resteDu: prix - verse,
      statutPaiement: "partiel",
      dernierVersementAt: date,
      motoRemise,
      dateRemiseMoto: motoRemise ? date : null,
      tokenSuivi: `captures-${id}`,
      lienSuiviEnvoyeAt: null,
      statutDossier: "ouvert",
      dateClotureDossier: null,
      ...trace(),
    });

    /* Trois documents depuis S48, et leur type est leur identifiant — c'est ce
       qui interdit structurellement deux cartes grises dans un dossier. */
    for (const type of ["quittance", "cmc", "carte_grise"]) {
      await base.doc(`ventesMotos/${id}/documents/${type}`).set({
        boutiqueId: code,
        venteId: id,
        type,
        statut: "a_faire",
        ...trace(),
      });
    }

    /* Le versement est un vrai sous-document, et pas un champ de la vente :
       c'est lui que le filtre de période des paiements interroge depuis S46 —
       « si c'est un versement de la période, on l'affiche ». */
    await base.doc(`ventesMotos/${id}/versements/versement-1`).set({
      boutiqueId: code,
      venteId: id,
      numeroRecu: numero,
      date,
      montant: verse,
      moyenPaiement: "especes",
      reference: "",
      encaissementId: `encaissement-${id}`,
      ...trace(),
    });

    await base.doc(`encaissements/encaissement-${id}`).set({
      boutiqueId: code,
      date,
      sens: "entree",
      montant: verse,
      moyenPaiement: "especes",
      origine: "vente_moto",
      origineRefId: id,
      libelle: `Vente ${numero}`,
      /* L'argent d'une vente en tranches est un engagement, pas une recette :
         la moto dort au magasin et cet argent peut revenir au client. Le champ
         existe pour que la caisse n'ait pas à le redécouvrir, et l'omettre
         ici sèmerait une recette là où le produit écrit une dette. */
      categorieTranches: mode === "tranches" && !motoRemise,
      ...trace(),
    });
  }
}

/**
 * Une boutique qui ne vend **que** des pièces — le sujet de S47.
 *
 * La boutique des captures porte les deux métiers, et sa carte de supervision
 * montre donc les deux groupes de faits. C'est un cas à regarder, mais ce n'est
 * pas *celui-là* : le défaut signalé par le commanditaire était une boutique de
 * pièces détachées qui annonçait « Motos en stock : 0 » et « Reste dû : — ».
 * Zéro moto n'est pas un chiffre bas, c'est une question mal posée.
 *
 * Sans cette boutique-ci, la campagne ne peut pas montrer la correction : elle
 * photographierait une rangée de cartes à deux métiers et conclurait que tout
 * va bien. Elle reste vide de stock — une boutique de pièces sans référence
 * annonce « Aucune pièce à réapprovisionner », et c'est déjà la bonne phrase,
 * posée au bon métier.
 */
async function semerUneBoutiqueDePieces(base, FieldValue) {
  const trace = {
    createdAt: FieldValue.serverTimestamp(),
    createdBy: "captures",
    createdByName: "Captures",
    updatedAt: FieldValue.serverTimestamp(),
    updatedBy: "captures",
    updatedByName: "Captures",
  };
  await base.doc("boutiques/PCS").set({
    nom: "Pièces Pouytenga",
    code: "PCS",
    metiers: ["pieces"],
    adresse: "Pouytenga",
    telephone: "70 00 00 01",
    actif: true,
    ...trace,
  });
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
/**
 * Un fournisseur et ses lots (S50).
 *
 * L'historique d'un fournisseur se photographiait sur une base sans aucun
 * arrivage : l'ecran rendait son etat vide, et la revue aurait cru avoir
 * regarde une liste de lots. Il faut donc de quoi voir ce que l'ecran doit
 * montrer -- plusieurs lots, des dates differentes, un ecoulement partiel, et
 * un lot annule, qui reste dans l'histoire precisement parce qu'on l'a pris.
 *
 * L'identifiant du fournisseur est fixe : la prise vise son adresse
 * directement, sans avoir a cliquer dans un tableau pour la decouvrir.
 */
const FOURNISSEUR_CAPTURES = "fournisseur-captures";

async function semerDesArrivages(base, FieldValue, code) {
  const trace = () => ({
    createdAt: FieldValue.serverTimestamp(),
    createdBy: "captures",
    createdByName: "Captures",
    updatedAt: FieldValue.serverTimestamp(),
    updatedBy: "captures",
    updatedByName: "Captures",
  });

  await base.doc(`fournisseurs/${FOURNISSEUR_CAPTURES}`).set({
    nom: "HAOJUE Import",
    telephone: "70 11 22 33",
    localite: "Lomé",
    actif: true,
    ...trace(),
  });

  const marque = "marque-captures-haojue";
  const modele = "modele-captures-a7";
  const provenance = "provenance-captures";

  const lots = [
    { id: "lot-captures-1", nom: "Lot de septembre", date: new Date("2026-09-12T09:00:00Z"), annule: false, motos: 3, vendues: 1 },
    { id: "lot-captures-2", nom: "Lot de juin", date: new Date("2026-06-04T09:00:00Z"), annule: false, motos: 2, vendues: 2 },
    { id: "lot-captures-3", nom: "Lot saisi en double", date: new Date("2026-05-02T09:00:00Z"), annule: true, motos: 1, vendues: 0 },
  ];

  let n = 400;
  for (const lot of lots) {
    await base.doc(`arrivages/${lot.id}`).set({
      nom: lot.nom,
      fournisseurId: FOURNISSEUR_CAPTURES,
      boutiqueId: code,
      date: lot.date,
      description: "",
      annule: lot.annule,
      ...trace(),
    });
    for (let i = 0; i < lot.motos; i += 1) {
      n += 1;
      await base.doc(`motos/moto-lot-${n}`).set({
        boutiqueId: code,
        etat: "neuve",
        marqueId: marque,
        /* La derniere moto de chaque lot n'a pas de modele : c'est le cas que
           S50 a ouvert, et il doit se voir ici aussi. */
        modeleId: i === lot.motos - 1 ? "" : modele,
        couleur: "Bleu",
        annee: 2026,
        numeroChassis: `LC6PCJ1A9K0000${n}`,
        numeroMoteur: "",
        prixVenteConseille: 900_000,
        provenanceId: provenance,
        arrivageId: lot.id,
        papiersFournis: [],
        photos: [],
        statut: i < lot.vendues ? "vendue" : "en_stock",
        dateEntree: lot.date,
        quittanceChemin: null,
        cmcChemin: null,
        cmcRecu: i % 2 === 0,
        ...trace(),
      });
    }
  }
}

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

  /* Deux marques de plus, et une moto sans modele (S50).
     La repartition par marque se photographiait sur un stock a une marque et
     un modele : elle montrait une ligne egale a son propre total, ce qui ne
     prouve rien. Il faut un ecart a voir -- plusieurs marques, des modeles
     inegaux, et surtout le cas que S50 vient d'ouvrir : une moto dont le
     modele n'a pas ete saisi, qui doit se lire « Modele non precise » et non
     disparaitre du compte. */
  const marqueYamaha = "marque-captures-yamaha";
  const marqueHaojue = "marque-captures-haojue";
  const modeleCrypton = "modele-captures-crypton";
  const modeleA7 = "modele-captures-a7";

  await base.doc(`marques/${marqueYamaha}`).set({ nom: "Yamaha", actif: true, ...trace() });
  await base.doc(`marques/${marqueHaojue}`).set({ nom: "Haojue", actif: true, ...trace() });
  await base
    .doc(`modeles/${modeleCrypton}`)
    .set({ nom: "Crypton", marqueId: marqueYamaha, actif: true, ...trace() });
  await base
    .doc(`modeles/${modeleA7}`)
    .set({ nom: "A7", marqueId: marqueHaojue, actif: true, ...trace() });

  const varietes = [
    { id: "moto-rep-1", chassis: "LC6PCJ1A9K0000301", marqueId: marqueYamaha, modeleId: modeleCrypton },
    { id: "moto-rep-2", chassis: "LC6PCJ1A9K0000302", marqueId: marqueYamaha, modeleId: modeleCrypton },
    { id: "moto-rep-3", chassis: "LC6PCJ1A9K0000303", marqueId: marqueYamaha, modeleId: modeleCrypton },
    /* Celle-ci n'a pas de modele : c'est le temoin visuel de S50. */
    { id: "moto-rep-4", chassis: "LC6PCJ1A9K0000304", marqueId: marqueYamaha, modeleId: "" },
    { id: "moto-rep-5", chassis: "LC6PCJ1A9K0000305", marqueId: marqueHaojue, modeleId: modeleA7 },
    { id: "moto-rep-6", chassis: "LC6PCJ1A9K0000306", marqueId: marqueHaojue, modeleId: modeleA7 },
  ];
  for (const { id, chassis, marqueId, modeleId } of varietes) {
    await base.doc(`motos/${id}`).set({
      boutiqueId: code,
      etat: "neuve",
      marqueId,
      modeleId,
      couleur: "Noir",
      annee: 2026,
      numeroChassis: chassis,
      numeroMoteur: "",
      prixVenteConseille: 950_000,
      provenanceId: provenance,
      papiersFournis: [],
      photos: [],
      statut: "en_stock",
      dateEntree: new Date("2026-09-15T09:00:00Z"),
      quittanceChemin: null,
      cmcChemin: null,
      cmcRecu: false,
      ...trace(),
    });
  }

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

/**
 * Un catalogue de trois références, et trois états de stock (S20).
 *
 * Un pour chaque colonne « Statut » : en stock, stock bas, épuisé. Une liste
 * qui ne montre qu'un seul état ne dit rien des trois, et c'est justement la
 * colonne que la maquette `c1` met en avant.
 *
 * La quantité n'est écrite nulle part : on sème des **mouvements**, et l'écran
 * en fait la somme. Semer une quantité serait semer ce que le produit n'écrit
 * pas — ce que D84 appelle un semis qui ne vérifie rien.
 */
async function semerLesPieces(base, FieldValue, code) {
  const trace = () => ({
    createdAt: FieldValue.serverTimestamp(),
    createdBy: "captures",
    createdByName: "Captures",
    updatedAt: FieldValue.serverTimestamp(),
    updatedBy: "captures",
    updatedByName: "Captures",
  });

  const catalogue = [
    { id: "piece-captures-1", reference: "PLQ-0142", designation: "Plaquette de frein avant", categorie: "Freinage", prixVente: 3500, seuilAlerte: 5, entree: 42 },
    { id: "piece-captures-2", reference: "CHN-0088", designation: "Chaîne 428H · 118 maillons", categorie: "Transmission", prixVente: 9000, seuilAlerte: 4, entree: 3 },
    { id: "piece-captures-3", reference: "FLT-0003", designation: "Filtre à air", categorie: "Moteur", prixVente: null, seuilAlerte: 2, entree: 0 },
  ];

  for (const piece of catalogue) {
    const { id, entree, ...champs } = piece;
    await base.doc(`pieces/${id}`).set({ ...champs, actif: true, ...trace() });
    if (entree === 0) continue;
    await base.doc(`mouvementsPieces/mvt-${id}`).set({
      boutiqueId: code,
      pieceId: id,
      type: "entree",
      quantite: entree,
      note: "Arrivage",
      date: new Date("2026-09-02T08:00:00Z"),
      ...trace(),
    });
  }
  /* Une sortie, pour que l'historique du panneau ne montre pas qu'une ligne. */
  await base.doc("mouvementsPieces/mvt-sortie-captures").set({
    boutiqueId: code,
    pieceId: "piece-captures-1",
    type: "sortie_autre",
    quantite: 2,
    note: "Casse atelier",
    date: new Date("2026-09-05T15:00:00Z"),
    ...trace(),
  });
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

  /* L'état « pas encore lu » du contrôle d'unicité (S40, D96). Le bouton
     annonce la lecture au lieu de laisser croire qu'il est prêt ; sans ces deux
     prises, c'est le seul état du produit que personne ne regarderait jamais. */
  { nom: "catalogue-lecture-en-cours-mobile-clair", chemin: "/parametres/catalogue", theme: "light", mobile: true, lectureEnCours: true },
  { nom: "clients-lecture-en-cours-bureau-sombre", chemin: "/clients", theme: "dark", mobile: false, lectureEnCours: true, nouveauClient: true },
  { nom: "motos-nouvelle-gerant-bas-mobile-sombre", chemin: "/motos/nouvelle", theme: "dark", mobile: true, gerant: true, bas: true },
  /* Les prix d'achat, l'écran que S39 crée pour que le responsable pose ce que
     le gérant ne saisit plus. */
  { nom: "couts-mobile-clair", chemin: "/supervision/couts", theme: "light", mobile: true },
  { nom: "couts-bureau-clair", chemin: "/supervision/couts", theme: "light", mobile: false },
  { nom: "couts-bureau-sombre", chemin: "/supervision/couts", theme: "dark", mobile: false },
  { nom: "couts-modale-bureau-clair", chemin: "/supervision/couts", theme: "light", mobile: false, ouvrirCout: true },
  { nom: "couts-modale-mobile-sombre", chemin: "/supervision/couts", theme: "dark", mobile: true, ouvrirCout: true },
  /* L'espace pieces (S20). Le gerant est le vrai destinataire : le catalogue
     lui sert a vendre, et c'est lui qui fait bouger le stock. Le responsable
     le voit aussi, avec en plus le bouton de creation d'une reference. */
  { nom: "pieces-gerant-mobile-clair", chemin: "/pieces", theme: "light", mobile: true, gerant: true },
  { nom: "pieces-gerant-bureau-clair", chemin: "/pieces", theme: "light", mobile: false, gerant: true },
  { nom: "pieces-gerant-bureau-sombre", chemin: "/pieces", theme: "dark", mobile: false, gerant: true },
  { nom: "pieces-piece-ouverte-bureau-clair", chemin: "/pieces", theme: "light", mobile: false, gerant: true, ouvrirPiece: true },
  { nom: "pieces-piece-ouverte-mobile-sombre", chemin: "/pieces", theme: "dark", mobile: true, gerant: true, ouvrirPiece: true },
  /* Fenêtre haute plutôt que défilement : la coquille fixe ses bords et fait
     défiler une zone intérieure, et trois approches du défilement n'ont pas
     rendu le bas du panneau photographiable. Un écran de 1400 px de haut est
     un rendu réel, pas un artifice — et c'est le seul moyen de regarder ce
     panneau en entier plutôt que de dire qu'on l'a regardé. */
  { nom: "pieces-piece-geste-bureau-clair", chemin: "/pieces", theme: "light", mobile: false, gerant: true, ouvrirPiece: true, hauteur: 1400 },
  { nom: "pieces-nouvelle-bureau-clair", chemin: "/pieces/nouvelle", theme: "light", mobile: false },
  { nom: "pieces-nouvelle-mobile-sombre", chemin: "/pieces/nouvelle", theme: "dark", mobile: true },
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

  /* **S46 — le filtre de période, engagé.** Les prises ci-dessus le montrent
     au repos. Ce qui n'existe sur aucune d'elles : une période *choisie*, où
     les quatre cartes de tête portent son nom, et la plage libre dépliée, qui
     ajoute deux champs de date sous la rangée. À 390 px, c'est là qu'on
     regarde si ces deux champs passent sur deux lignes plutôt que de rétrécir
     sous la cible tactile. */
  { nom: "ventes-periode-mois-bureau-clair", chemin: "/motos/ventes", theme: "light", mobile: false, periode: "Ce mois-ci" },
  { nom: "ventes-periode-mois-mobile-sombre", chemin: "/motos/ventes", theme: "dark", mobile: true, periode: "Ce mois-ci" },
  { nom: "ventes-periode-plage-mobile-clair", chemin: "/motos/ventes", theme: "light", mobile: true, periode: "Du… au…" },
  { nom: "ventes-periode-plage-bureau-sombre", chemin: "/motos/ventes", theme: "dark", mobile: false, periode: "Du… au…" },
  { nom: "paiements-periode-mois-bureau-clair", chemin: "/motos/paiements", theme: "light", mobile: false, periode: "Ce mois-ci" },

  /* **S48 — la liste unique, filtrée.** Le bureau est à 1280 px, et ce n'est
     pas un détail : la liste porte neuf colonnes, et c'est à cette largeur que
     le dépôt a déjà vu « Action » sortir du cadre — c'est écrit dans
     `paiements/page.tsx`, à propos du prix convenu qu'on y a retiré pour cette
     raison. Deux pastilles engagées plutôt qu'une : « Crédit » dit où est la
     moto, « Soldées » où en est l'argent — les deux axes que la rangée porte
     depuis qu'elle a perdu « Tranches » et « Impayées », chacune doublant une
     colonne déjà visible. « Soldées » est aussi la prise qui prouve que la
     liste garde les ventes terminées : avant, elles en disparaissaient. */
  { nom: "paiements-credit-bureau-clair", chemin: "/motos/paiements", theme: "light", mobile: false, filtrePaiement: "Crédit" },
  { nom: "paiements-soldees-bureau-sombre", chemin: "/motos/paiements", theme: "dark", mobile: false, filtrePaiement: "Soldées" },
  { nom: "paiements-credit-mobile-clair", chemin: "/motos/paiements", theme: "light", mobile: true, filtrePaiement: "Crédit" },

  /* **Le dossier, que la campagne n'avait jamais photographié** — et c'est
     l'écran que S48 change le plus : la plaque en est sortie, la carte grise
     portant déjà l'immatriculation. Trois lignes de papier au lieu de quatre,
     et c'est le débordement horizontal signalé par le commanditaire qui doit
     avoir disparu. Un écran jamais regardé est un écran dont personne ne sait
     rien, quel que soit le vert de sa suite. */
  // L'historique d'un fournisseur (S50) : tous les lots pris avec lui.
  { nom: "fournisseur-historique-bureau-clair", chemin: "/motos/fournisseurs/fournisseur-captures", theme: "light", mobile: false },
  { nom: "fournisseur-historique-mobile-sombre", chemin: "/motos/fournisseurs/fournisseur-captures", theme: "dark", mobile: true },
  { nom: "arrivages-fournisseur-lien", chemin: "/motos/arrivages", theme: "light", mobile: false },
  // La repartition par marque (S50), depliee : repliee elle ne montre qu'un titre.
  { nom: "stock-repartition-bureau-clair", chemin: "/motos", theme: "light", mobile: false, ouvrirRepartition: true },
  { nom: "stock-repartition-mobile-sombre", chemin: "/motos", theme: "dark", mobile: true, ouvrirRepartition: true },
  { nom: "dossiers-bureau-clair", chemin: "/motos/dossiers", theme: "light", mobile: false },
  { nom: "dossiers-bureau-sombre", chemin: "/motos/dossiers", theme: "dark", mobile: false },
  { nom: "dossiers-mobile-clair", chemin: "/motos/dossiers", theme: "light", mobile: true },
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
/* `/supervision` tout court est dans la liste depuis S47 : sa carte de boutique
   montre désormais les faits du métier, et sans décor elle n'a aucun métier à
   montrer. La garde ne visait que `/supervision/couts`, si bien que les prises
   de supervision se prenaient sur une base vide.
   `/motos` y entre en S50, et le constat est le même en pire : les prises
   `motos-bureau-clair`, `motos-bureau-sombre` et `motos-mobile-clair` ne
   semaient rien, donc photographiaient « Aucune boutique n'est déclarée ».
   Trois prises du stock qui ne montraient aucun stock — exactement ce que le
   commentaire de `semerDesVentes` reproche deux cents lignes plus bas : un
   écran vide ne prouve pas qu'on a regardé, il prouve qu'on n'avait rien à
   voir. */
if (aPrendre.some((prise) => prise.gerant || /\/supervision|\/pieces|\/motos/.test(prise.chemin))) {
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
  nouveauClient,
  bas,
  ouvrirPiece,
  ouvrirCout,
  ouvrirRepartition,
  lectureEnCours,
  hauteur,
  periode,
  filtrePaiement,
} of aPrendre) {
  const contexte = await navigateur.newContext({
    ...(mobile
      ? devices["Pixel 7"]
      : { viewport: { width: 1280, height: hauteur ?? 820 } }),
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

  /**
   * L'état « je n'ai pas encore lu », figé pour qu'on puisse le regarder.
   *
   * **Pourquoi il a fallu l'outiller** (S40). Sept formulaires refusent de
   * décider d'un doublon tant que leur liste n'est pas arrivée, et le disent
   * sur leur bouton : « Lecture du stock… », « Lecture du fichier… ». Cet état
   * dure quelques dizaines de millisecondes sur des émulateurs locaux — jamais
   * une campagne ne l'attrape, et il serait donc le seul état du produit que
   * personne n'aurait jamais vu. C'est exactement là que `DESIGN.md` §10 se
   * perd : un bouton désactivé dont on n'a pas vérifié le contraste, un
   * libellé qui déborde.
   *
   * On suspend le canal d'écoute de Firestore — la requête n'est ni servie ni
   * refusée, elle attend — ce qui laisse l'écran dans l'état qu'il aurait au
   * comptoir sur une connexion lente. L'authentification passe par un autre
   * port et n'est pas touchée : la session s'ouvre, seules les listes manquent.
   */
  /**
   * **Le gel ne vaut qu'avant la navigation**, et c'est une contrainte de
   * transport, pas un choix : Firestore multiplexe toutes ses écoutes sur un
   * seul canal ouvert une fois pour toutes. Une interception posée après le
   * chargement ne voit plus rien passer — essayée, mesurée, sans effet.
   *
   * Conséquence : les écrans qui ont besoin de la liste des boutiques pour
   * savoir où ils sont ne peuvent pas être photographiés dans cet état par ce
   * moyen — ils répondraient « choisissez une boutique », c'est-à-dire autre
   * chose. Le formulaire d'entrée en stock en fait partie ; son bouton suit le
   * même patron que ceux photographiés ici, et c'est le test bout en bout qui
   * l'atteste, en l'attendant par son nom.
   */
  if (lectureEnCours) {
    await page.route("**/google.firestore.v1.Firestore/Listen/**", () => {});
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
     attend que les listes en direct soient arrivées (DESIGN.md §14).
     Sauf quand c'est **cet état-là** qu'on vient photographier. */
  if (!lectureEnCours) {
    await page
      .getByText(/Chargement/)
      .first()
      .waitFor({ state: "detached", timeout: 15000 })
      .catch(() => {});
  }
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
    /* Et l'attente qui ne depend pas d'une formulation : `EtatChargement` porte
       `role="status"`. Le filtre par texte ci-dessus ne voyait que les ecrans
       qui disent litteralement « Chargement » -- l'historique d'un fournisseur
       dit « Lecture des lots… », et se photographiait donc en plein vol.

       **On attend qu'il apparaisse avant d'attendre qu'il parte**, et c'est
       tout le piege : interroge trop tot, l'indicateur n'est pas encore monte,
       Playwright le declare « deja detache » et rend la main aussitot. La page
       etait alors photographiee a 1,5 s, pendant que les ecoutes Firestore
       mettaient plusieurs secondes -- d'ou une capture de chargement prise pour
       un ecran fini. */
    /* **La quiescence applicative, pas le silence reseau.** Firestore tient une
       requete `Listen/channel` ouverte en permanence, donc `networkidle` est
       inatteignable ici. On interroge donc la page elle-meme : la zone de
       travail a du contenu, et plus aucun `role="status"` -- le role ARIA que
       porte `EtatChargement`.

       Les deux formes plus simples ont echoue, et c'est instructif. Attendre le
       texte « Chargement » ne voit que les ecrans qui emploient ce mot-la.
       Attendre que `role=status` se detache rend la main *immediatement* quand
       on interroge avant que React ait hydrate : l'element n'existe pas encore,
       Playwright le declare deja detache. Un `waitForFunction` n'a pas ce
       defaut puisqu'il reinterroge jusqu'a ce que la condition tienne. */
    await page
      .waitForFunction(
        () => {
          const travail = document.querySelector("main");
          if (!travail) return false;
          if (travail.querySelector('[role="status"]')) return false;
          return travail.innerText.trim().length > 0;
        },
        null,
        { timeout: 30000 },
      )
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
  /* Le formulaire de création vit derrière un bouton : sans ce clic, la
     capture montre la liste et pas le formulaire dont on vient regarder
     l'état. */
  if (nouveauClient) {
    await page.getByRole("button", { name: "Nouveau client" }).click();
    await page.waitForTimeout(300);
  }
  /* Le filtre de période, **engagé** (S46). Au repos, la rangée de pastilles
     se voit déjà sur les prises ordinaires ; ce qui ne se voit nulle part,
     c'est une période choisie — les quatre cartes de tête portent alors son
     nom — et la plage libre dépliée, qui pousse deux champs de date sous la
     rangée. C'est à 390 px que ces deux-là se jugent. */
  if (periode) {
    const groupe = page.getByRole("main").getByRole("group", { name: "Filtrer par période" });
    await groupe.getByRole("button", { name: periode, exact: true }).click();
    await page.waitForTimeout(800);
  }

  /* Les pastilles de la liste unique des paiements (S48). Les deux sections
     d'avant — les dettes d'un côté, les tranches de l'autre — ont fusionné :
     ce qui les distinguait passe par une colonne « Mode » et par deux totaux
     qu'on ne somme jamais. Cette rangée-ci remplace les deux titres, et c'est
     précisément ce qu'il faut regarder : se lit-elle comme un tri, ou comme un
     formulaire à remplir avant d'avoir droit à la liste ? */
  if (filtrePaiement) {
    const groupe = page.getByRole("main").getByRole("group", { name: "Filtrer les paiements" });
    await groupe.getByRole("button", { name: filtrePaiement, exact: true }).click();
    await page.waitForTimeout(800);
  }

  if (coupe) {
    await contexte.setOffline(true);
    await page.getByRole("status").getByText("Hors ligne").waitFor({ timeout: 5000 });
  }
  /* On regarde ce qui sortira de l'imprimante, pas ce qui est à l'écran : la
     feuille `@media print` retire la coquille, repasse la palette en clair et
     ajoute les traits de signature (DESIGN.md §14 — regarder le rendu réel). */
  if (impression) await page.emulateMedia({ media: "print" });

  /* Le panneau d'une piece : la quantite, son histoire et les deux gestes qui
     la changent. Il n'existe sur aucune prise au repos, et c'est pourtant la
     que S20 se joue. */
  if (ouvrirPiece) {
    const ligne = page.locator("tbody tr").first().getByRole("button").first();
    await ligne.waitFor({ timeout: 20000 });
    await ligne.click();
    await page.getByRole("region", { name: /^Pièce / }).waitFor({ timeout: 20000 });
    await page.waitForTimeout(600);
  }

  /* Le formulaire de prix d'achat, passé du panneau sous le tableau à une
     modale. Il n'existait sur aucune prise, et c'est exactement le genre de
     changement qui ne se juge pas au diff : un pied d'actions qui ne défile
     plus, une feuille qui monte du bas sur téléphone, et le tableau rendu
     inerte derrière. */
  if (ouvrirCout) {
    const ligne = page.locator("tbody tr").first().getByRole("button").first();
    await ligne.waitFor({ timeout: 20000 });
    await ligne.click();
    await page.getByRole("dialog").waitFor({ timeout: 20000 });
    await page.waitForTimeout(600);
  }
  /* La repartition par marque est un `<details>` replie par defaut : c'est
     voulu, le tableau du stock repond a la question la plus frequente. Replie,
     il ne se photographie qu'en titre -- on l'ouvre donc pour regarder ce que
     la revue doit juger : les comptes, leur ordre, et la ligne « Modele non
     precise » que S50 vient de rendre possible. */
  if (ouvrirRepartition) {
    const resume = page.getByText("Répartition par marque");
    await resume.waitFor({ timeout: 20000 });
    await resume.click();
    await page.waitForTimeout(600);
  }
  /* `bas` fait defiler jusqu'au dernier bouton du contenu : la coquille fixe
     la barre laterale et fait defiler une zone interieure, donc `fullPage` ne
     montre jamais le bas d'un long formulaire. On regarde ce que la personne
     voit apres avoir fait defiler. */
  if (bas) {
    /* La molette, pas `scrollIntoViewIfNeeded` : la zone qui defile est un
       conteneur interieur de la coquille, et faire « entrer dans la vue » un
       element qui y est deja ne bouge rien. On fait ce que fait la main. */
    /* `scrollIntoView` execute DANS la page : le navigateur y trouve seul le
       bon ancetre defilant, la ou la molette scrolle ce qui est sous le
       curseur -- c'est-a-dire le tableau, qui a sa propre zone. */
    await page.evaluate(() => {
      const contenu = document.querySelector("main");
      const dernier = contenu?.lastElementChild?.lastElementChild ?? contenu?.lastElementChild;
      dernier?.scrollIntoView({ block: "end" });
    });
    await page.waitForTimeout(600);
  }
  await page.screenshot({ path: `${DOSSIER}/${nom}.png`, fullPage: !mobile });
  console.log(`capturé  ${DOSSIER}/${nom}.png`);
  await contexte.close();
}

await navigateur.close();
