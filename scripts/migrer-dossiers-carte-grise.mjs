/**
 * Recopie les cartes grises des ventes vers leur collection à elles (S59).
 *
 * Avant S59, un dossier vivait sous `ventesMotos/{id}/documents/carte_grise` —
 * donc il n'en existait pas sans vente. Le client en confie régulièrement qui
 * viennent du dehors : les dossiers prennent une collection à eux, et ce script
 * y amène l'existant.
 *
 *   node scripts/migrer-dossiers-carte-grise.mjs                  # émulateurs, à blanc
 *   node scripts/migrer-dossiers-carte-grise.mjs --ecrire         # émulateurs, pour de vrai
 *   node scripts/migrer-dossiers-carte-grise.mjs --projet sandwini --ecrire --oui-sur-sandwini
 *
 * **Quatre garde-fous, et ils sont le cœur du script.**
 *
 * 1. **Il ne supprime rien.** Les documents d'origine restent en place et
 *    continuent d'être lus par les écrans d'avant le lot 3. Leur retrait est
 *    une opération distincte, décidée après vérification.
 * 2. **Il écrit avec `create`, jamais `set`.** L'identifiant du dossier est
 *    celui de la vente : relancer le script retombe sur le même document, et
 *    `create` échoue au lieu d'écraser un dossier qu'on aurait fait avancer
 *    entre-temps. C'est ce qui le rend reprenable sans table de correspondance.
 * 3. **Il ne fait rien par défaut.** Sans `--ecrire`, il compte et rapporte.
 * 4. **Il refuse `sandwini` sans un accord écrit sur la ligne de commande.**
 *    Deux drapeaux, parce qu'un seul se tape par habitude.
 *
 * **Ce qu'il refuse d'écrire, et pourquoi c'est important.** Un dossier sans
 * numéro de châssis serait accepté par le SDK Admin — qui passe outre les
 * règles — puis **refusé à chaque modification** par l'application, qui exige
 * un châssis non vide à chaque écriture. Le dossier serait visible et
 * définitivement figé. Le script les laisse donc de côté et les nomme.
 */

const PROJET_EMULATEURS = "sdi-dev";
const FIRESTORE_EMULATEURS = "127.0.0.1:8181";
const AUTEUR = { uid: "migration-s59", nom: "Migration S59" };

/* Les statuts de l'ancien modèle vers le nouveau. `remis_client` devient
   `remis` : S53 avait cessé de l'écrire, mais la préversion en porte, et c'est
   exactement l'étape que S59 réhabilite. */
const STATUTS = {
  a_faire: "a_faire",
  chez_prestataire: "chez_prestataire",
  revenu_magasin: "revenu_magasin",
  remis_client: "remis",
  non_applicable: "non_applicable",
};

const arguments_ = process.argv.slice(2);
const option = (nom) => {
  const rang = arguments_.indexOf(nom);
  return rang === -1 ? null : (arguments_[rang + 1] ?? null);
};
const drapeau = (nom) => arguments_.includes(nom);

const projet = option("--projet") ?? PROJET_EMULATEURS;
const ecrire = drapeau("--ecrire");
const surEmulateurs = projet === PROJET_EMULATEURS;

if (!surEmulateurs && !drapeau("--oui-sur-sandwini")) {
  console.error(
    `Refus : « ${projet} » n’est pas les émulateurs.\n` +
      `Cette migration écrit dans les données réelles du client.\n` +
      `Si c’est bien ce que vous voulez, ajoutez --oui-sur-sandwini.`,
  );
  process.exit(1);
}

if (surEmulateurs) {
  /* Sans cette variable, le SDK Admin viserait un vrai projet. */
  process.env.FIRESTORE_EMULATOR_HOST = FIRESTORE_EMULATEURS;
  try {
    await fetch(`http://${FIRESTORE_EMULATEURS}/`);
  } catch {
    console.error(
      `Les émulateurs ne répondent pas sur ${FIRESTORE_EMULATEURS}.\n` +
        `Lancez « npm run emulators » dans un autre terminal.`,
    );
    process.exit(1);
  }
} else {
  delete process.env.FIRESTORE_EMULATOR_HOST;
}
process.env.GCLOUD_PROJECT = projet;

const { initializeApp } = await import("firebase-admin/app");
const { getFirestore, Timestamp } = await import("firebase-admin/firestore");

initializeApp({ projectId: projet });
const base = getFirestore();

console.log(
  `Projet : ${projet}${surEmulateurs ? " (émulateurs)" : ""} — ` +
    `${ecrire ? "ÉCRITURE" : "à blanc, rien ne sera écrit"}\n`,
);

/* Les référentiels tiennent en quelques dizaines de lignes : on les charge une
   fois plutôt que de les relire moto par moto. */
async function chargerReferentiel(nom) {
  const instantane = await base.collection(nom).get();
  return new Map(instantane.docs.map((entree) => [entree.id, entree.data().nom ?? ""]));
}
const marques = await chargerReferentiel("marques");
const modeles = await chargerReferentiel("modeles");

const cacheClients = new Map();
const cacheMotos = new Map();

/** `getAll` par paquets : une liste de mille références en un appel serait refusée. */
async function lirePlusieurs(references, cache) {
  const manquantes = references.filter((reference) => !cache.has(reference.path));
  for (let depart = 0; depart < manquantes.length; depart += 100) {
    const tranche = manquantes.slice(depart, depart + 100);
    const instantanes = await base.getAll(...tranche);
    for (const instantane of instantanes) {
      cache.set(instantane.ref.path, instantane.exists ? instantane.data() : null);
    }
  }
}

/**
 * La date d'un passage, relue dans le journal du document.
 *
 * Rien n'enregistrait ces dates sur le document : seul le journal des passages
 * les a toujours portées. Les lire ici donne un historique juste dès le premier
 * jour — et le fichier du client ne parle que de dates.
 */
async function daterLesPassages(referenceDocument) {
  const instantane = await referenceDocument.collection("historique").get();
  const dates = {};
  for (const entree of instantane.docs) {
    const donnees = entree.data();
    const le = donnees.le ?? null;
    if (!le) continue;
    const connu = dates[donnees.vers];
    if (!connu || le.toMillis() > connu.toMillis()) dates[donnees.vers] = le;
  }
  return dates;
}

const bilan = {
  ventes: 0,
  cartes: 0,
  crees: 0,
  dejaLa: 0,
  sansChassis: [],
  statutInconnu: [],
  sansClient: 0,
  sansLibelle: 0,
};

let derniere = null;
for (;;) {
  let requete = base.collection("ventesMotos").orderBy("__name__").limit(200);
  if (derniere) requete = requete.startAfter(derniere);
  const page = await requete.get();
  if (page.empty) break;
  derniere = page.docs[page.docs.length - 1];
  bilan.ventes += page.docs.length;

  const cartes = page.docs.map((vente) =>
    vente.ref.collection("documents").doc("carte_grise"),
  );
  const presentes = [];
  for (let depart = 0; depart < cartes.length; depart += 100) {
    const instantanes = await base.getAll(...cartes.slice(depart, depart + 100));
    for (const instantane of instantanes) if (instantane.exists) presentes.push(instantane);
  }
  bilan.cartes += presentes.length;
  if (presentes.length === 0) continue;

  /* Le nom du client et le libellé de la moto se **recopient** sur le dossier :
     la personne des cartes grises ne lit ni le fichier des clients ni le stock,
     et sans cette copie sa liste afficherait des identifiants. */
  const parVente = new Map(page.docs.map((vente) => [vente.id, vente.data()]));
  const aLire = presentes
    .map((carte) => parVente.get(carte.ref.parent.parent.id))
    .filter(Boolean);
  await lirePlusieurs(
    aLire.filter((vente) => vente.clientId).map((vente) => base.doc(`clients/${vente.clientId}`)),
    cacheClients,
  );
  await lirePlusieurs(
    aLire.filter((vente) => vente.motoId).map((vente) => base.doc(`motos/${vente.motoId}`)),
    cacheMotos,
  );

  for (const carte of presentes) {
    const venteId = carte.ref.parent.parent.id;
    const vente = parVente.get(venteId) ?? {};
    const donnees = carte.data();

    const statut = STATUTS[donnees.statut];
    if (!statut) {
      bilan.statutInconnu.push(`${venteId} (${donnees.statut})`);
      continue;
    }

    const client = vente.clientId ? cacheClients.get(`clients/${vente.clientId}`) : null;
    const moto = vente.motoId ? cacheMotos.get(`motos/${vente.motoId}`) : null;

    const clientNom = client
      ? [client.nom ?? "", client.prenom ?? ""]
          .map((part) => String(part).trim())
          .filter(Boolean)
          .join(" ")
      : "";
    if (!clientNom) bilan.sansClient += 1;

    const motoLibelle = moto
      ? [marques.get(moto.marqueId) ?? "", modeles.get(moto.modeleId) ?? ""]
          .map((part) => part.trim())
          .filter(Boolean)
          .join(" ")
      : "";
    if (!motoLibelle) bilan.sansLibelle += 1;

    const numeroChassis = String(moto?.numeroChassis ?? "").trim();
    if (!numeroChassis) {
      bilan.sansChassis.push(venteId);
      continue;
    }

    /* On ne va chercher les dates que là où elles existent : un dossier encore
       au magasin n'a ni retour ni remise à dater. */
    const passages =
      statut === "revenu_magasin" || statut === "remis"
        ? await daterLesPassages(carte.ref)
        : {};

    const dossier = {
      boutiqueId: donnees.boutiqueId ?? vente.boutiqueId ?? "",
      venteId,
      origine: "vente",
      clientNom,
      motoLibelle,
      numeroChassis,
      statut,
      prestataireId: donnees.prestataireId ?? null,
      prestataireNom: donnees.prestataireNom ?? "",
      deposeLe: donnees.deposeLe ?? null,
      avance: typeof donnees.avance === "number" ? donnees.avance : null,
      disponibleLe: donnees.disponibleLe ?? null,
      /* Le numéro de plaque n'existe nulle part dans l'ancien modèle : il
         s'inscrira au prochain retour. */
      immatriculation: "",
      revenuLe: passages.revenu_magasin ?? null,
      remisLe: donnees.remisLe ?? passages.remis_client ?? null,
      /* Qui est venu chercher n'était pas demandé avant S59. On ne l'invente
         pas : la ligne restera muette sur les dossiers déjà remis. */
      remisANom: "",
      remisATelephone: "",
      /* La création d'origine est conservée telle quelle : c'est elle qui dit
         quand le dossier est né, et les règles exigent qu'elle ne bouge plus. */
      createdAt: donnees.createdAt ?? Timestamp.now(),
      createdBy: donnees.createdBy ?? AUTEUR.uid,
      createdByName: donnees.createdByName ?? AUTEUR.nom,
      updatedAt: Timestamp.now(),
      updatedBy: AUTEUR.uid,
      updatedByName: AUTEUR.nom,
    };

    if (!ecrire) {
      bilan.crees += 1;
      continue;
    }

    try {
      await base.collection("dossiersCarteGrise").doc(venteId).create(dossier);
      bilan.crees += 1;
    } catch (cause) {
      /* Déjà migré, ou déjà avancé depuis : on ne touche pas. C'est ce qui rend
         une seconde exécution sans effet. */
      if (cause?.code === 6 || String(cause?.message ?? "").includes("ALREADY_EXISTS")) {
        bilan.dejaLa += 1;
      } else {
        throw cause;
      }
    }
  }
}

console.log(`Ventes parcourues        : ${bilan.ventes}`);
console.log(`Cartes grises trouvées   : ${bilan.cartes}`);
console.log(`Dossiers ${ecrire ? "créés          " : "à créer        "} : ${bilan.crees}`);
console.log(`Déjà présents, intacts   : ${bilan.dejaLa}`);
if (bilan.sansClient) console.log(`Sans nom de client       : ${bilan.sansClient} (écrits quand même)`);
if (bilan.sansLibelle) console.log(`Sans modèle de moto      : ${bilan.sansLibelle} (écrits quand même)`);

if (bilan.sansChassis.length) {
  console.log(
    `\nLaissés de côté, sans châssis : ${bilan.sansChassis.length}\n` +
      `  ${bilan.sansChassis.join(", ")}\n` +
      `  L'application refuse toute modification d'un dossier sans châssis : les\n` +
      `  écrire les figerait. Corrigez le châssis de la moto, puis relancez.`,
  );
}

if (bilan.statutInconnu.length) {
  console.log(
    `\nLaissés de côté, statut inconnu : ${bilan.statutInconnu.length}\n` +
      `  ${bilan.statutInconnu.join(", ")}`,
  );
}

if (!ecrire) {
  console.log(`\nRien n’a été écrit. Ajoutez --ecrire pour que ce soit le cas.`);
}
