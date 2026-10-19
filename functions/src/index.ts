import { randomBytes } from "node:crypto";
import { logger } from "firebase-functions";
import { onDocumentCreated, onDocumentWritten } from "firebase-functions/v2/firestore";
import { HttpsError, onCall, onRequest, type CallableRequest } from "firebase-functions/v2/https";
import { QueryDocumentSnapshot, Timestamp } from "firebase-admin/firestore";
import { fermeLesSessions, lireModification } from "./gerants";
import { resoudreCollision, type PieceNumerotee } from "./numerotation";
import { construireSuivi } from "./suivi";

/**
 * Les seules opérations du MVP qui passent par le serveur.
 *
 * Elles y passent parce qu'elles ne peuvent pas faire autrement : poser un
 * custom claim ou désactiver un compte demande le SDK Admin, qui n'a rien à
 * faire dans un navigateur. Tout le reste — ventes, versements, stock — écrit
 * directement dans Firestore pour rester utilisable sans réseau (prompt.md
 * §3.4). Ces fonctions-ci sont administratives : le responsable les utilise au
 * calme, connecté, jamais au comptoir en pleine vente.
 *
 * Une exception à la fin du fichier : les deux réconciliations de numéro ne
 * sont appelées par personne, elles réagissent à une écriture. C'est la
 * contrepartie serveur de la numérotation hors-ligne — la seule chose qu'un
 * appareil isolé ne peut pas faire lui-même.
 */

type Role = "responsable" | "gerant";

const REGION = "europe-west1";

/**
 * Charge le SDK Admin **à l'appel**, jamais à l'import.
 *
 * Chargé au niveau du module, `firebase-admin` mettait près de treize secondes
 * à s'initialiser sur une machine de développement — au-dessus des dix secondes
 * que l'émulateur accorde à la découverte des fonctions. Résultat : les
 * fonctions n'étaient pas servies du tout, et l'application recevait un « le
 * serveur n'a pas répondu » sans plus d'explication.
 *
 * Le chargement paresseux règle la découverte et allège aussi le démarrage à
 * froid en production. Le coût est payé une fois par instance, à la première
 * invocation.
 *
 * **On demande l'application par défaut, on ne compte pas les applications.**
 * « Aucune application » et « aucune application *par défaut* » ne sont pas la
 * même chose : dans un déclencheur Firestore, `firebase-functions` crée sa
 * propre application nommée pour reconstruire l'instantané du document. Un test
 * sur `getApps().length` la voyait, en concluait que tout était initialisé, et
 * la fonction mourait aussitôt sur « The default Firebase app does not exist ».
 * Les fonctions appelables, elles, marchaient — le piège n'apparaissait qu'ici.
 */
async function admin() {
  const [app, auth, firestore] = await Promise.all([
    import("firebase-admin/app"),
    import("firebase-admin/auth"),
    import("firebase-admin/firestore"),
  ]);
  let defaut: import("firebase-admin/app").App;
  try {
    defaut = app.getApp();
  } catch {
    defaut = app.initializeApp();
  }
  return {
    auth: auth.getAuth(defaut),
    base: firestore.getFirestore(defaut),
    horodatage: firestore.FieldValue.serverTimestamp(),
  };
}

/** Vérifie que l'appelant est un responsable authentifié. Sinon, on refuse. */
function exigerResponsable(requete: CallableRequest): void {
  if (!requete.auth) {
    throw new HttpsError("unauthenticated", "Connexion requise.");
  }
  if (requete.auth.token.role !== "responsable") {
    throw new HttpsError("permission-denied", "Réservé au responsable.");
  }
}

function texteObligatoire(valeur: unknown, champ: string, maximum = 200): string {
  if (typeof valeur !== "string" || valeur.trim().length === 0) {
    throw new HttpsError("invalid-argument", `Le champ « ${champ} » est obligatoire.`);
  }
  const propre = valeur.trim();
  if (propre.length > maximum) {
    throw new HttpsError("invalid-argument", `Le champ « ${champ} » est trop long.`);
  }
  return propre;
}

/**
 * Un rattachement de gérant ne vaut que si la boutique existe vraiment.
 *
 * Le `boutiqueId` finit dans un custom claim, que les règles Firestore lisent
 * pour ouvrir des documents. Un claim qui désigne une boutique fantôme n'ouvre
 * rien, mais il laisse un compte dans un état incohérent que personne ne voit.
 */
async function boutiqueExistante(valeur: unknown): Promise<string | null> {
  if (valeur === null || valeur === undefined || valeur === "") return null;
  const code = texteObligatoire(valeur, "boutique", 3);
  if (!/^[A-Z]{3}$/.test(code)) {
    throw new HttpsError("invalid-argument", "Le code de la boutique doit faire trois lettres.");
  }
  const { base } = await admin();
  const boutique = await base.doc(`boutiques/${code}`).get();
  if (!boutique.exists) {
    throw new HttpsError("not-found", "Cette boutique n'existe pas.");
  }
  if (boutique.get("actif") === false) {
    throw new HttpsError("failed-precondition", "Cette boutique est fermée.");
  }
  return code;
}

/**
 * Crée un compte de gérant : compte d'authentification, custom claims et
 * miroir dans `users/{uid}`.
 *
 * Le `boutiqueId` reste facultatif : un responsable peut ouvrir le compte avant
 * d'avoir déclaré la boutique. Un gérant sans boutique se connecte mais ne voit
 * aucune donnée, et l'application le lui dit franchement plutôt que de lui
 * montrer des écrans vides. `attribuerBoutique` répare cela ensuite.
 */
export const creerGerant = onCall({ region: REGION }, async (requete) => {
  exigerResponsable(requete);

  const nom = texteObligatoire(requete.data?.nom, "nom");
  const email = texteObligatoire(requete.data?.email, "e-mail").toLowerCase();
  const motDePasse = texteObligatoire(requete.data?.motDePasse, "mot de passe", 128);
  const boutiqueId = await boutiqueExistante(requete.data?.boutiqueId);

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new HttpsError("invalid-argument", "Adresse e-mail invalide.");
  }
  // Firebase impose 6 caractères ; on demande davantage sans tomber dans la
  // politique de mot de passe qui pousse à l'écrire sur un papier.
  if (motDePasse.length < 10) {
    throw new HttpsError("invalid-argument", "Le mot de passe doit faire au moins 10 caractères.");
  }

  const { auth, base, horodatage } = await admin();

  let uid: string;
  try {
    const compte = await auth.createUser({ email, password: motDePasse, displayName: nom });
    uid = compte.uid;
  } catch (cause) {
    const code = (cause as { code?: string }).code;
    if (code === "auth/email-already-exists") {
      throw new HttpsError("already-exists", "Cette adresse e-mail a déjà un compte.");
    }
    throw new HttpsError("internal", "Le compte n'a pas pu être créé.");
  }

  /* Le rôle vit dans le custom claim : c'est lui que les règles Firestore
     lisent, et lui seul fait autorité. Le document `users/{uid}` en est un
     miroir lisible par l'interface, jamais une source de droits. */
  await auth.setCustomUserClaims(uid, { role: "gerant" satisfies Role, boutiqueId });

  await base.doc(`users/${uid}`).set({
    nom,
    email,
    role: "gerant",
    boutiqueId,
    actif: true,
    createdAt: horodatage,
    createdBy: requete.auth!.uid,
    createdByName: requete.auth!.token.name ?? "",
    updatedAt: horodatage,
    updatedBy: requete.auth!.uid,
    updatedByName: requete.auth!.token.name ?? "",
  });

  return { uid };
});

/**
 * Active ou désactive un compte.
 *
 * On ne supprime jamais un utilisateur : ses écritures passées portent son nom
 * et son identifiant, et un historique qui pointe vers un compte disparu n'est
 * plus un historique.
 */
export const changerActivationUtilisateur = onCall({ region: REGION }, async (requete) => {
  exigerResponsable(requete);

  const uid = texteObligatoire(requete.data?.uid, "utilisateur", 128);
  const actif = requete.data?.actif;
  if (typeof actif !== "boolean") {
    throw new HttpsError("invalid-argument", "L'état demandé est invalide.");
  }
  if (uid === requete.auth!.uid) {
    throw new HttpsError(
      "failed-precondition",
      "Vous ne pouvez pas désactiver votre propre compte.",
    );
  }

  const { auth, base, horodatage } = await admin();

  const cible = await auth.getUser(uid).catch(() => null);
  if (!cible) {
    throw new HttpsError("not-found", "Ce compte n'existe pas.");
  }
  if (cible.customClaims?.role === "responsable") {
    throw new HttpsError("permission-denied", "Un compte responsable ne se désactive pas ici.");
  }

  // `disabled` coupe la connexion. La révocation des jetons ferme en plus les
  // sessions déjà ouvertes : sans elle, un gérant désactivé continuerait de
  // travailler jusqu'à l'expiration de son jeton, soit jusqu'à une heure.
  await auth.updateUser(uid, { disabled: !actif });
  if (!actif) await auth.revokeRefreshTokens(uid);

  await base.doc(`users/${uid}`).update({
    actif,
    updatedAt: horodatage,
    updatedBy: requete.auth!.uid,
    updatedByName: requete.auth!.token.name ?? "",
  });

  return { uid, actif };
});

/**
 * Rattache un gérant à une boutique, ou l'en détache.
 *
 * Le périmètre d'un gérant vit dans son custom claim : c'est lui que les règles
 * Firestore lisent pour décider ce qu'il peut ouvrir. Le déplacer est donc une
 * opération de sécurité, pas un simple changement d'affichage.
 *
 * D'où la révocation des jetons : sans elle, le gérant garderait son ancien
 * périmètre jusqu'à l'expiration de son jeton, soit jusqu'à une heure — il
 * continuerait à lire et à écrire dans une boutique qui n'est plus la sienne.
 * Il doit se reconnecter, et l'interface prévient le responsable avant qu'il
 * valide.
 */
export const attribuerBoutique = onCall({ region: REGION }, async (requete) => {
  exigerResponsable(requete);

  const uid = texteObligatoire(requete.data?.uid, "utilisateur", 128);
  const boutiqueId = await boutiqueExistante(requete.data?.boutiqueId);

  const { auth, base, horodatage } = await admin();

  const cible = await auth.getUser(uid).catch(() => null);
  if (!cible) {
    throw new HttpsError("not-found", "Ce compte n'existe pas.");
  }
  const role = cible.customClaims?.role;
  if (role !== "gerant") {
    throw new HttpsError(
      "failed-precondition",
      "Seul un gérant est rattaché à une boutique ; le responsable les voit toutes.",
    );
  }

  await auth.setCustomUserClaims(uid, { role: "gerant" satisfies Role, boutiqueId });
  await auth.revokeRefreshTokens(uid);

  await base.doc(`users/${uid}`).update({
    boutiqueId,
    updatedAt: horodatage,
    updatedBy: requete.auth!.uid,
    updatedByName: requete.auth!.token.name ?? "",
  });

  return { uid, boutiqueId };
});

/**
 * Corrige l'identité d'un gérant : nom affiché, adresse de connexion, mot de passe.
 *
 * **Une seule fonction pour les trois**, parce qu'elles partagent exactement les
 * mêmes gardes et la même cible : les séparer tripliquerait ces gardes sans rien
 * clarifier. Les champs absents ne sont pas touchés — `lireModification` tient
 * cette distinction, et la vérifie sans émulateur.
 *
 * **Ce que la fonction ne corrige pas : l'histoire.** Les ventes déjà
 * enregistrées portent `createdByName`, recopié au moment de la saisie. Elles
 * gardent l'ancien nom, et c'est voulu — un journal ne se réécrit pas. L'écran
 * le dit au responsable avant qu'il valide.
 *
 * La boutique de rattachement, elle, reste chez `attribuerBoutique` : elle
 * déplace un périmètre de sécurité, pas une identité.
 */
export const modifierGerant = onCall({ region: REGION }, async (requete) => {
  exigerResponsable(requete);

  const uid = texteObligatoire(requete.data?.uid, "utilisateur", 128);
  const lecture = lireModification(requete.data);
  if ("invalide" in lecture) {
    throw new HttpsError("invalid-argument", lecture.invalide);
  }
  const { modification } = lecture;

  if (uid === requete.auth!.uid) {
    throw new HttpsError("failed-precondition", "Vous ne pouvez pas modifier votre propre compte.");
  }

  const { auth, base, horodatage } = await admin();

  const cible = await auth.getUser(uid).catch(() => null);
  if (!cible) {
    throw new HttpsError("not-found", "Ce compte n'existe pas.");
  }
  if (cible.customClaims?.role === "responsable") {
    throw new HttpsError("permission-denied", "Un compte responsable ne se modifie pas ici.");
  }
  if (cible.customClaims?.role !== "gerant") {
    throw new HttpsError("failed-precondition", "Ce compte n'est pas un compte de gérant.");
  }

  const versAuth: import("firebase-admin/auth").UpdateRequest = {};
  /* Le miroir ne reçoit jamais le mot de passe : un secret n'a rien à faire
     dans un document que l'interface lit. */
  const versMiroir: Record<string, unknown> = {};
  if (modification.nom !== null) {
    versAuth.displayName = modification.nom;
    versMiroir.nom = modification.nom;
  }
  if (modification.email !== null) {
    versAuth.email = modification.email;
    versMiroir.email = modification.email;
  }
  if (modification.motDePasse !== null) {
    versAuth.password = modification.motDePasse;
  }

  try {
    await auth.updateUser(uid, versAuth);
  } catch (cause) {
    const code = (cause as { code?: string }).code;
    if (code === "auth/email-already-exists") {
      throw new HttpsError("already-exists", "Cette adresse e-mail a déjà un compte.");
    }
    throw new HttpsError("internal", "Le compte n'a pas pu être modifié.");
  }

  const sessionsFermees = fermeLesSessions(modification);
  if (sessionsFermees) await auth.revokeRefreshTokens(uid);

  await base.doc(`users/${uid}`).update({
    ...versMiroir,
    updatedAt: horodatage,
    updatedBy: requete.auth!.uid,
    updatedByName: requete.auth!.token.name ?? "",
  });

  return { uid, sessionsFermees };
});

/**
 * Les cinq collections où une écriture **engage** — de l'argent ou du stock.
 *
 * Ce sont elles qui décident si un compte s'efface ou se désactive. Toutes
 * portent `createdBy == request.auth.uid`, imposé par `traceCreation` dans
 * `firestore.rules` : la signature n'est pas déclarative, elle est vérifiée à
 * l'écriture.
 *
 * **Les référentiels n'en font pas partie, et c'est un choix.** Avoir créé une
 * entrée « Yamaha » n'est pas une signature : les inclure rendrait quasiment
 * tout compte indéboulonnable et transformerait l'arbitrage du commanditaire —
 * « effacer seulement si rien n'a été signé » — en interdiction pure. On mesure
 * ce qui engage, pas ce qui a été tapé.
 */
const COLLECTIONS_SIGNEES = [
  "ventesMotos",
  "ventesPieces",
  "encaissements",
  "cloturesCaisse",
  "mouvementsPieces",
] as const;

/**
 * La première collection où ce compte a signé, ou `null` s'il n'a rien signé.
 *
 * Cinq requêtes au pire, une au mieux : la boucle s'arrête à la première
 * trouvée, et un gérant qui a vendu quoi que ce soit s'arrête sur la première
 * ligne. Chacune porte sur un seul champ en égalité — aucun index composite à
 * déclarer.
 */
async function premiereSignature(
  base: FirebaseFirestore.Firestore,
  uid: string,
): Promise<string | null> {
  for (const nom of COLLECTIONS_SIGNEES) {
    const lot = await base.collection(nom).where("createdBy", "==", uid).limit(1).get();
    if (!lot.empty) return nom;
  }
  return null;
}

/**
 * Efface pour de bon un compte de gérant — s'il n'a rien signé.
 *
 * **Elle est à part de `modifierGerant` parce qu'elle est irréversible.** La
 * noyer dans un correctif partiel la rendrait atteignable par distraction ;
 * elle mérite son nom, sa garde propre et ses témoins.
 *
 * **Le refus est la règle, l'effacement l'exception.**
 * `changerActivationUtilisateur` dit depuis S2 qu'on ne supprime jamais un
 * utilisateur, et pour une bonne raison : ses écritures passées portent son
 * identifiant, et un historique qui pointe vers un compte disparu n'est plus un
 * historique. Le commanditaire a tranché le cas que cette règle traitait trop
 * large — le compte ouvert par erreur, qui n'a jamais rien enregistré.
 * Celui-là ne tient aucun historique, et le garder n'est qu'une ligne de plus
 * dans une liste à relire.
 */
export const supprimerGerant = onCall({ region: REGION }, async (requete) => {
  exigerResponsable(requete);

  const uid = texteObligatoire(requete.data?.uid, "utilisateur", 128);
  if (uid === requete.auth!.uid) {
    throw new HttpsError("failed-precondition", "Vous ne pouvez pas supprimer votre propre compte.");
  }

  const { auth, base } = await admin();
  const miroir = base.doc(`users/${uid}`);
  const [cible, vu] = await Promise.all([auth.getUser(uid).catch(() => null), miroir.get()]);

  if (!cible && !vu.exists) {
    throw new HttpsError("not-found", "Ce compte n'existe pas.");
  }

  /* Le rôle fait autorité dans le custom claim. Le miroir ne sert de source que
     pour un compte dont l'authentification a déjà disparu — voir l'ordre des
     deux effacements plus bas. */
  const role = cible ? cible.customClaims?.role : vu.get("role");
  if (role === "responsable") {
    throw new HttpsError("permission-denied", "Un compte responsable ne se supprime pas ici.");
  }
  if (role !== "gerant") {
    throw new HttpsError("failed-precondition", "Ce compte n'est pas un compte de gérant.");
  }

  const signature = await premiereSignature(base, uid);
  if (signature) {
    logger.info("Suppression refusée : le compte a signé", { uid, collection: signature });
    throw new HttpsError(
      "failed-precondition",
      "Ce compte a déjà enregistré des opérations : il ne peut pas être effacé. " +
        "Désactivez-le — son nom doit rester lisible dans l'historique.",
    );
  }

  /* **Le compte d'authentification d'abord, le miroir ensuite.** Dans l'autre
     ordre, un échec à mi-chemin laisserait un compte capable de se connecter et
     absent de la liste : vivant et invisible, le pire des deux états. Ici
     l'échec laisse au pire un miroir orphelin — que l'appel suivant achève,
     puisqu'il accepte une cible que seul le miroir atteste. */
  if (cible) await auth.deleteUser(uid);
  await miroir.delete();

  logger.info("Compte de gérant effacé", { uid });
  return { uid };
});

/**
 * Répare les numéros en double, au moment où deux appareils se rejoignent.
 *
 * C'est la seule pièce du serveur qui ne soit pas appelée par quelqu'un : elle
 * réagit. Elle le fait parce que la collision qu'elle traite n'est visible de
 * personne d'autre — l'appareil qui a émis le numéro était hors ligne, celui
 * d'en face aussi, et ni l'un ni l'autre ne saura jamais ce que le voisin a
 * distribué pendant ce temps (`DECISIONS.md` D5).
 *
 * Le rapprochement se fait sur `numeroInitial`, pas sur `numero` : `numero`
 * change quand cette fonction tranche, et une clé qui bouge ne rapproche plus
 * rien. Une troisième pièce en retard doit pouvoir retrouver les deux
 * premières, y compris celle qui porte déjà un `-B`.
 *
 * Ce qu'elle ne fait pas : bloquer, verrouiller, ou attendre. La vente est déjà
 * enregistrée et le reçu peut-être déjà imprimé quand elle s'exécute. Son seul
 * pouvoir est de corriger le numéro de la pièce arrivée en second, et
 * l'application le signale ensuite au gérant.
 */
/**
 * Les deux collections qui puisent dans le **même** compteur (Q1).
 *
 * Un numéro dicté au téléphone désigne une seule pièce comptable, qu'elle porte
 * une moto ou un jeu de plaquettes. La collision se cherche donc à travers les
 * deux, sinon une vente de moto et une vente de pièces pourraient porter
 * éternellement le même numéro sans que rien ne s'en aperçoive — le pire des
 * doublons, puisqu'il est invisible des deux côtés.
 */
const COLLECTIONS_NUMEROTEES = ["ventesMotos", "ventesPieces"] as const;

type CollectionNumerotee = (typeof COLLECTIONS_NUMEROTEES)[number];

/**
 * Le corps commun des deux déclencheurs, paramétré par la collection écrite.
 *
 * Un seul corps et deux déclencheurs, parce qu'un déclencheur Firestore ne
 * surveille qu'un chemin. Les dupliquer laisserait les deux moitiés diverger,
 * et c'est exactement la divergence qui vient d'être corrigée ici.
 */
function reconciliationDe(collectionCreee: CollectionNumerotee) {
  return async (evenement: { data: QueryDocumentSnapshot | undefined }) => {
    const creee = evenement.data;
    if (!creee) return;

    const boutiqueId = creee.get("boutiqueId");
    const numeroInitial = creee.get("numeroInitial");
    if (typeof boutiqueId !== "string" || typeof numeroInitial !== "string") return;

    const { base } = await admin();
    const parCollection = await Promise.all(
      COLLECTIONS_NUMEROTEES.map(async (nom) => {
        const lot = await base
          .collection(nom)
          .where("boutiqueId", "==", boutiqueId)
          .where("numeroInitial", "==", numeroInitial)
          .get();
        return lot.docs.map((document) => versPiece(nom, document));
      }),
    );
    const concurrentes = parCollection.flat();

    /* Le cas normal, et de très loin le plus fréquent : la pièce est seule à
       porter ce numéro. On sort sans écrire. */
    if (concurrentes.length < 2) return;

    const moi = concurrentes.find((piece) => piece.id === `${collectionCreee}/${creee.id}`);
    if (!moi) return;

    const numero = resoudreCollision(moi, concurrentes);
    if (!numero) return;

    await base.doc(`${collectionCreee}/${creee.id}`).update({ numero });
    logger.info("Numéro en double réconcilié", {
      collection: collectionCreee,
      boutiqueId,
      numeroInitial,
      numero,
      vente: creee.id,
    });
  };
}

/* La région doit rester celle de la base Firestore : un déclencheur déployé
   ailleurs ne se déclenche pas du tout. */
export const reconcilierNumeroVente = onDocumentCreated(
  { region: REGION, document: "ventesMotos/{venteId}" },
  reconciliationDe("ventesMotos"),
);

export const reconcilierNumeroVentePiece = onDocumentCreated(
  { region: REGION, document: "ventesPieces/{venteId}" },
  reconciliationDe("ventesPieces"),
);

/**
 * Convertit un document de vente en ce que la règle de réconciliation attend,
 * et rien de plus.
 *
 * L'identifiant est **préfixé de sa collection** : les concurrentes viennent
 * maintenant de deux collections, et deux documents homonymes s'y
 * confondraient — au mieux en départageant mal une égalité, au pire en faisant
 * croire à un document qu'il est l'autre.
 */
function versPiece(collection: CollectionNumerotee, document: QueryDocumentSnapshot): PieceNumerotee {
  const cree = document.get("createdAt");
  return {
    id: `${collection}/${document.id}`,
    numeroInitial: document.get("numeroInitial"),
    /* `createdAt` est un horodatage serveur : au moment où ce déclencheur
       s'exécute, il est déjà résolu. S'il manquait malgré tout, l'identifiant
       du document départage seul — un ordre arbitraire mais stable vaut mieux
       qu'un plantage. */
    recueA: cree instanceof Timestamp ? cree.toMillis() : 0,
  };
}

/**
 * Fige le coût de la moto sur la vente, et calcule la marge.
 *
 * **C'est le seul acteur du système qui voit les deux côtés.** Le cahier des
 * charges veut un `coutMotoSnapshot` figé au moment de la vente (§5.4), et le
 * §8 réserve la marge au responsable. Ces deux exigences se contredisent dès
 * qu'un gérant vend : le coût vit dans `motos/{id}/prive/cout`, que les règles
 * lui refusent en lecture (`DECISIONS.md` D2) — il ne peut donc pas le recopier
 * dans la vente qu'il enregistre. Un navigateur ne peut pas figer ce qu'il n'a
 * pas le droit de lire.
 *
 * D'où ce déclencheur. Il ne fait rien qu'un appareil pourrait faire, ce qui
 * est la seule justification acceptable pour mettre du serveur dans un produit
 * hors-ligne d'abord (§3.4) : la vente, elle, est déjà écrite et le reçu déjà
 * remis quand il s'exécute. Son retard ne bloque personne — la marge est un
 * chiffre de pilotage, lu au calme par le responsable, jamais au comptoir.
 *
 * Il écrit dans une sous-collection qu'**aucun navigateur ne peut écrire** (les
 * règles la ferment en écriture). La marge n'est donc pas seulement cachée au
 * gérant : elle est infalsifiable, y compris par un responsable qui voudrait la
 * retoucher depuis l'application.
 *
 * *La limite annoncée ici s'est réalisée avec S39*, et elle est traitée juste
 * en dessous par `rattraperMargeDuCout`. Le coût n'est plus écrit à l'entrée en
 * stock — le gérant ne le saisit plus — donc une vente peut très bien précéder
 * son coût. Le choix retenu est celui que ce commentaire nommait en second :
 * **laisser l'instantané tranquille**. Une marge déjà figée ne se réécrit
 * jamais ; seule une marge absente se remplit.
 */
export const figerMargeVente = onDocumentCreated(
  { region: REGION, document: "ventesMotos/{venteId}" },
  async (evenement) => {
    const vente = evenement.data;
    if (!vente) return;

    const motoId = vente.get("motoId");
    const prixConvenu = vente.get("prixConvenu");
    const boutiqueId = vente.get("boutiqueId");
    if (typeof motoId !== "string" || typeof prixConvenu !== "number") return;

    const { base, horodatage } = await admin();
    const cout = await base.doc(`motos/${motoId}/prive/cout`).get();

    /* Aucun coût connu : on n'écrit rien. Poser un zéro annoncerait une marge
       égale au prix de vente entier — un chiffre faux est plus dangereux qu'un
       chiffre absent, parce qu'il ne se remarque pas. */
    if (!cout.exists) {
      logger.warn("Marge non figée : la moto n'a pas de coût enregistré", {
        vente: vente.id,
        moto: motoId,
      });
      return;
    }

    const coutMotoSnapshot = cout.get("coutTotal");
    if (typeof coutMotoSnapshot !== "number") {
      logger.warn("Marge non figée : coût illisible", { vente: vente.id, moto: motoId });
      return;
    }

    /* **`create` et non `set`, comme dans `rattraperMargeDuCout`.** Les deux
       declencheurs ecrivent au meme endroit, et rien ne garantit leur ordre :
       celui-ci lit le cout de la moto puis ecrit, et si le responsable corrige
       ce cout entre les deux, il ecrirait le cout corrige par-dessus la marge
       deja figee. Vu au banc, valeur a l'appui.

       Une marge s'ecrit une fois et ne se reecrit jamais (D51, D91). Faire
       porter l'invariant par l'ecriture plutot que par l'ordre d'arrivee est
       la seule facon de le tenir sous concurrence. */
    try {
      await base.doc(`ventesMotos/${vente.id}/prive/marge`).create({
        boutiqueId,
        coutMotoSnapshot,
        marge: prixConvenu - coutMotoSnapshot,
        updatedAt: horodatage,
        /* L'auteur est le serveur, et le dire explicitement vaut mieux que
           recopier l'identifiant du gérant : personne n'a saisi ce chiffre. */
        updatedBy: "systeme",
        updatedByName: "Calcul automatique",
      });
    } catch (cause) {
      // 6 = ALREADY_EXISTS : le rattrapage est passe avant, la marge est figee.
      if ((cause as { code?: number }).code !== 6) throw cause;
    }
  },
);

/**
 * Rattrape la marge d'une vente dont le coût est arrivé après elle (S39).
 *
 * **Pourquoi il a fallu l'écrire.** `figerMargeVente` se déclenche à la
 * création de la vente et lit le coût de la moto. Tant que le coût était écrit
 * dans le même lot que l'entrée en stock, il était toujours là. Depuis S39 le
 * gérant ne le saisit plus : une moto peut entrer, se vendre, et ne recevoir
 * son prix d'achat que le soir, quand le responsable descend sa liste. Sans ce
 * déclencheur, cette vente-là n'aurait **jamais** de marge — le seul acteur qui
 * savait la calculer était déjà passé.
 *
 * **Ce qu'il ne fait pas, et c'est le point délicat.** Il ne réécrit aucune
 * marge existante — garanti par `create`, qui échoue si le document est là,
 * et non par une lecture préalable qui se court-circuite sous concurrence. Le cahier des charges veut un coût *figé au moment de la
 * vente* (§5.4) : corriger un prix d'achat trois mois plus tard ne doit pas
 * réviser en silence la marge d'une vente déjà analysée. Une marge s'écrit une
 * fois et ne se réécrit jamais (D51) — ce déclencheur comble un trou, il ne
 * révise rien.
 *
 * **Il ne tourne que quand il peut servir.** Une moto encore en stock n'a
 * aucune vente : la requête ne rend rien et la fonction s'arrête. Le cas
 * courant — le responsable renseigne le coût d'une moto invendue — coûte une
 * requête et aucune écriture.
 */
export const rattraperMargeDuCout = onDocumentWritten(
  { region: REGION, document: "motos/{motoId}/prive/{section}" },
  async (evenement) => {
    if (evenement.params.section !== "cout") return;

    const apres = evenement.data?.after;
    if (!apres?.exists) return;

    const coutMotoSnapshot = apres.get("coutTotal");
    if (typeof coutMotoSnapshot !== "number") return;

    const { base, horodatage } = await admin();
    const ventes = await base
      .collection("ventesMotos")
      .where("motoId", "==", evenement.params.motoId)
      .get();
    if (ventes.empty) return;

    for (const vente of ventes.docs) {
      const prixConvenu = vente.get("prixConvenu");
      if (typeof prixConvenu !== "number") continue;

      /* **`create` et non `set`, et c'est toute la différence.** La première
         version lisait le document puis décidait d'écrire — deux opérations,
         donc une fenêtre entre les deux. Le banc l'a trouvée : une marge déjà
         figée à 800 000 s'est fait réécrire à 100 000 par un rattrapage dont
         la lecture était passée avant qu'elle existe.

         `create` échoue si le document est là. L'invariant de D91 — une marge
         se comble mais ne se révise jamais — cesse d'être une intention portée
         par un `if` et devient une propriété de l'écriture elle-même. Un `if`
         se court-circuite sous concurrence ; un `create` non. */
      try {
        await base.doc(`ventesMotos/${vente.id}/prive/marge`).create({
          boutiqueId: vente.get("boutiqueId"),
          coutMotoSnapshot,
          marge: prixConvenu - coutMotoSnapshot,
          updatedAt: horodatage,
          updatedBy: "systeme",
          updatedByName: "Calcul automatique",
        });
      } catch (cause) {
        /* 6 = ALREADY_EXISTS : la marge était déjà figée, on la laisse. Tout
           autre code est une vraie panne et doit remonter. */
        if ((cause as { code?: number }).code !== 6) throw cause;
        continue;
      }

      logger.info("Marge rattrapée : le coût est arrivé après la vente", {
        vente: vente.id,
        moto: evenement.params.motoId,
      });
    }
  },
);

/**
 * Recalcule les agrégats de paiement d'une vente depuis ses versements.
 *
 * **Le problème qu'il résout est le pendant exact de la marge, côté argent.**
 * `totalPaye` et `resteDu` vivent sur le document de vente, où le cahier des
 * charges les met (§5.4). Deux gérants hors ligne qui encaissent chacun un
 * versement sur la même vente écrivent tous deux ce champ : la dernière
 * écriture gagne (§3.4), et un versement disparaît des totaux alors que son
 * reçu est entre les mains du client. Les sous-documents, eux, survivent tous
 * les deux — une sous-collection n'a pas de dernière écriture gagnante.
 *
 * D'où le partage retenu (`DECISIONS.md` D56) : **les versements font foi, le
 * parent est un cache d'affichage**. L'appareil écrit le cache tout de suite
 * pour que l'écran soit juste sans réseau ; ce déclencheur le recalcule depuis
 * la sous-collection dès que l'écriture parvient au serveur.
 *
 * Il ne fait rien qu'un appareil pourrait faire — seul le serveur voit les
 * versements de *tous* les appareils — ce qui est la seule justification
 * acceptable de mettre du serveur dans un produit hors-ligne d'abord (§3.4).
 * Et il n'a besoin d'aucun verrou : il relit la collection entière et écrit une
 * valeur absolue, jamais un incrément. Deux exécutions concurrentes tombent
 * donc sur le même résultat.
 */
export const recalculerPaiementsVente = onDocumentCreated(
  { region: REGION, document: "ventesMotos/{venteId}/versements/{versementId}" },
  async (evenement) => {
    const venteId = evenement.params.venteId;
    const { base, horodatage } = await admin();

    const venteRef = base.doc(`ventesMotos/${venteId}`);
    const vente = await venteRef.get();
    if (!vente.exists) {
      logger.warn("Recalcul impossible : la vente n'existe pas", { vente: venteId });
      return;
    }

    const prixConvenu = vente.get("prixConvenu");
    if (typeof prixConvenu !== "number") return;

    const versements = await venteRef.collection("versements").get();

    let totalPaye = 0;
    let dernierVersementAt: Timestamp | null = null;
    for (const versement of versements.docs) {
      const montant = versement.get("montant");
      if (typeof montant === "number") totalPaye += montant;
      const date = versement.get("date");
      if (date instanceof Timestamp && (!dernierVersementAt || date > dernierVersementAt)) {
        dernierVersementAt = date;
      }
    }

    /* Jamais de reste négatif : un trop-perçu vient de deux appareils qui ont
       encaissé chacun de leur côté, et l'afficher en négatif ferait croire que
       le magasin doit de l'argent au client. Le total, lui, dit la vérité. */
    const resteDu = Math.max(prixConvenu - totalPaye, 0);
    const statutPaiement = resteDu === 0 ? "solde" : totalPaye > 0 ? "partiel" : "impaye";

    /* On n'écrit que si quelque chose a changé. Sans ce test, chaque versement
       déclencherait une écriture de vente, donc rien du tout de plus — mais une
       facture Firestore pour rien, sur le document le plus écrit du produit. */
    if (
      vente.get("totalPaye") === totalPaye &&
      vente.get("resteDu") === resteDu &&
      vente.get("statutPaiement") === statutPaiement
    ) {
      return;
    }

    await venteRef.update({
      totalPaye,
      resteDu,
      statutPaiement,
      dernierVersementAt,
      updatedAt: horodatage,
      /* Personne n'a saisi ces chiffres : ils sont la somme de ce que d'autres
         ont saisi. Le dire vaut mieux que recopier l'auteur du dernier
         versement, qui n'a pas décidé du total. */
      updatedBy: "systeme",
      updatedByName: "Recalcul automatique",
    });

    /* Le nombre de versements suffit à diagnostiquer : c'est lui qui dit si le
       déclencheur a vu ce qu'il devait voir. Les montants, eux, n'ont rien à
       faire dans un journal de serveur (`SECURITY.md` §13). */
    logger.info("Agrégats de paiement recalculés", {
      vente: venteId,
      versements: versements.size,
    });
  },
);

/**
 * Amorçage du tout premier responsable, sur un projet réel.
 *
 * Le rôle est un custom claim, lu dans le jeton (`lib/auth/session.tsx`). Or la
 * console Firebase ne sait pas poser de claim, et `creerGerant` exige déjà un
 * responsable pour en créer un autre : sans cette fonction, un projet neuf est
 * une boucle fermée. `scripts/amorcer.mjs` la casse en local, mais il refuse —
 * à raison — de viser autre chose que les émulateurs.
 *
 * **Trois conditions**, qui échouent toutes **fermé** :
 *
 * 1. L'appelant présente un jeton d'identité valide, et c'est **lui-même**
 *    qu'il promeut. Il faut donc connaître le mot de passe du compte.
 * 2. Elle refuse s'il y a plus d'un compte dans le projet.
 * 3. Elle refuse dès que ce compte porte un rôle — inerte après le premier
 *    succès.
 *
 * La première condition est celle qui compte, et elle a été ajoutée après coup.
 * Sans elle, la sûreté reposait sur l'**ordre des commandes** : créer le compte
 * administrateur avant de déployer. Déployée d'abord sur un projet vide, la
 * fonction aurait promu le premier inscrit — l'inscription par e-mail et mot de
 * passe étant ouverte à quiconque détient la clé d'API publique, qui part dans
 * chaque navigateur. Une procédure écrite n'est pas une garantie : ce que le
 * code n'impose pas, personne ne l'impose.
 *
 * Le jeton s'obtient sans rien confier à personne :
 *
 * ```
 * curl "https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=<API_KEY>" \
 *   -H "Content-Type: application/json" \
 *   -d '{"email":"...","password":"...","returnSecureToken":true}'
 * ```
 *
 * Une fois le responsable en place, elle ne peut plus rien faire. La supprimer
 * reste plus propre : `firebase functions:delete amorcerResponsable`.
 */
export const amorcerResponsable = onRequest({ region: REGION, cors: false }, async (requete, reponse) => {
  const { auth, base, horodatage } = await admin();

  const entete = requete.get("authorization") ?? "";
  const jetonBrut = entete.startsWith("Bearer ") ? entete.slice(7).trim() : "";
  if (!jetonBrut) {
    reponse.status(401).json({
      erreur: "Jeton d'identité requis : en-tête « Authorization: Bearer <idToken> ».",
    });
    return;
  }

  const jeton = await auth.verifyIdToken(jetonBrut).catch(() => null);
  if (!jeton) {
    reponse.status(401).json({ erreur: "Jeton d'identité invalide ou expiré." });
    return;
  }

  /* Deux comptes suffisent à trancher : inutile de lister au-delà. */
  const comptes = await auth.listUsers(2);

  if (comptes.users.length === 0) {
    reponse.status(412).json({
      erreur: "Aucun compte n'existe encore. Créez-le d'abord dans la console Firebase, section Authentication.",
    });
    return;
  }
  if (comptes.users.length > 1) {
    reponse.status(412).json({
      erreur: "Plus d'un compte existe : l'amorçage ne choisit pas qui promouvoir.",
    });
    return;
  }

  const compte = comptes.users[0];

  /* On ne promeut que l'appelant lui-même. Sans cela, la fonction distribuerait
     un rôle à qui la trouve, au seul motif qu'un compte sans rôle existe. */
  if (jeton.uid !== compte.uid) {
    reponse.status(403).json({
      erreur: "L'amorçage ne promeut que le compte qui l'appelle.",
    });
    return;
  }
  if (compte.customClaims?.role) {
    reponse.status(409).json({
      erreur: `Ce compte porte déjà le rôle « ${compte.customClaims.role} ». L'amorçage est terminé.`,
    });
    return;
  }

  const nom = compte.displayName ?? compte.email ?? "Responsable";
  await auth.setCustomUserClaims(compte.uid, { role: "responsable", boutiqueId: null });
  await base.doc(`users/${compte.uid}`).set(
    {
      nom,
      email: compte.email ?? "",
      role: "responsable",
      boutiqueId: null,
      actif: true,
      createdAt: horodatage,
      createdBy: "amorcage",
      createdByName: "Amorçage du premier responsable",
      updatedAt: horodatage,
      updatedBy: "amorcage",
      updatedByName: "Amorçage du premier responsable",
    },
    { merge: true },
  );

  logger.info("Premier responsable amorcé", { uid: compte.uid });
  reponse.json({
    fait: true,
    email: compte.email,
    message:
      "Rôle « responsable » posé. Déconnectez-vous et reconnectez-vous : le jeton gardé sur l'appareil ne porte pas encore le rôle.",
  });
});

/* --- Clôture automatique du dossier (§7.1) -------------------------------- */

/* La liste des types a disparu d'ici le 16 octobre 2026 : la cloture ne regarde
   plus qu'un seul document, la carte grise. Un dossier ancien qui porte encore
   un `plaque` ou une quittance a `a_faire` se cloture donc desormais — c'est
   l'effet voulu, et c'est ce que le commanditaire a demande. */

/**
 * Le dossier est-il fini ?
 *
 * Réplique de `dossierCloturable` dans `lib/domain/dossier.ts`. La duplication
 * est le prix du cloisonnement des paquets : `functions/` a son propre
 * `tsconfig` et ses propres dépendances, et n'importe pas le code de
 * l'application web. La règle tient en trois lignes et ne bouge pas — c'est ce
 * qui rend le coût acceptable. Les deux copies sont couvertes par des tests.
 */
async function dossierFini(
  base: FirebaseFirestore.Firestore,
  venteId: string,
  vente: FirebaseFirestore.DocumentData,
): Promise<boolean> {
  if (vente.statutPaiement !== "solde" || vente.motoRemise !== true) return false;

  /* **Le dossier, c'est la carte grise** (demande du 16 octobre 2026). La
     quittance et le CMC se cochent sur le lot a l'arrivee, et cela suffit : ils
     ont quitte le dossier. Ce que le client a emporte reste ecrit sur la vente
     et s'imprime sur son recu, mais ne decide plus de la cloture.

     **La cloture ne lit toujours jamais la moto**, et c'est la propriete qui
     rend ce declencheur econome : rien a reveiller quand une case est cochee
     sur un arrivage. */
  const documents = await base.collection(`ventesMotos/${venteId}/documents`).get();
  const carteGrise = documents.docs.find((document) => document.get("type") === "carte_grise");

  /* Une carte grise absente compte `a_faire` : un dossier dont les documents ne
     sont pas encore ecrits ne doit pas passer pour un dossier complet. */
  const statut = carteGrise?.get("statut") ?? "a_faire";
  if (statut === "non_applicable") return true;
  /* `remis_client` ne s'ecrit plus, mais la preversion en porte : l'ignorer
     laisserait les dossiers les plus anciens ouverts pour toujours. */
  return statut === "revenu_magasin" || statut === "remis_client";
}

/**
 * Clôt le dossier dès que tout est réglé.
 *
 * Trois écritures peuvent achever un dossier — le dernier document remis, le
 * dernier versement, la remise de la moto — et elles se font sur trois écrans
 * différents. Évaluer la condition dans chacun d'eux, c'est trois occasions de
 * l'oublier ; on l'évalue donc une fois, ici, sur écriture.
 *
 * **La boucle est bornée par la condition elle-même** : on n'écrit que si le
 * dossier est encore `ouvert`. L'écriture de clôture rappelle la fonction, qui
 * voit `clos` et s'arrête. Sans cette garde, un déclencheur qui écrit sur le
 * document qui le déclenche tourne indéfiniment — et se facture.
 */
async function cloturerSiFini(venteId: string): Promise<void> {
  const { base, horodatage } = await admin();
  const reference = base.doc(`ventesMotos/${venteId}`);
  const vente = await reference.get();
  if (!vente.exists || vente.get("statutDossier") !== "ouvert") return;

  if (!(await dossierFini(base, venteId, vente.data() as FirebaseFirestore.DocumentData))) return;

  await reference.update({
    statutDossier: "clos",
    dateClotureDossier: horodatage,
    updatedAt: horodatage,
    /* Personne n'a décidé cette clôture : elle découle de trois faits déjà
       saisis par d'autres. Recopier l'auteur du dernier geste lui attribuerait
       une décision qu'il n'a pas prise. */
    updatedBy: "systeme",
    updatedByName: "Clôture automatique",
  });

  logger.info("Dossier clos", { vente: venteId });
}

export const cloturerSurDocument = onDocumentWritten(
  { region: REGION, document: "ventesMotos/{venteId}/documents/{type}" },
  async (evenement) => cloturerSiFini(evenement.params.venteId),
);

export const cloturerSurVente = onDocumentWritten(
  { region: REGION, document: "ventesMotos/{venteId}" },
  async (evenement) => cloturerSiFini(evenement.params.venteId),
);

/* --- Le portail du prestataire (S56) -------------------------------------- */

/**
 * La taille de l'aléa d'un jeton de suivi.
 *
 * Même valeur que `OCTETS_JETON` dans `lib/domain/jeton-suivi.ts`, recopiée
 * parce que `functions/` ne peut pas importer `lib/` — son `tsconfig` a
 * `rootDir: "src"`, donc le paquet déployé ne compile rien d'extérieur. C'est la
 * situation de `numerotation`, et la réponse est la même : les deux moitiés sont
 * nouées par un test, pas par un import.
 */
const OCTETS_JETON = 32;

/** La forme d'un jeton écrit : 32 octets en base64url, sans remplissage. */
const FORME_JETON = /^[A-Za-z0-9_-]{43}$/;

/**
 * Le refus unique du portail.
 *
 * **Un jeton inconnu, révoqué ou malformé rend exactement ceci.** Les
 * distinguer dirait à qui essaie des liens au hasard lequel a existé — et
 * « ce prestataire n'a pas de lien » renseignerait déjà sur l'existence du
 * prestataire. Du point de vue de celui qui consulte, les trois situations sont
 * de toute façon la même : il n'y a rien à lire.
 */
const REFUS_PORTAIL = { erreur: "Ce lien n’est plus valide." };

/**
 * Émet le lien de suivi d'un prestataire, et révoque le précédent.
 *
 * **Un secret ne se fabrique pas dans un navigateur** (`SECURITY.md` §4), et
 * c'est la seule raison pour laquelle cette fonction existe : `randomBytes` n'a
 * pas d'équivalent de confiance côté client, et les règles Firestore interdisent
 * d'écrire `jetonSuivi` depuis l'application.
 *
 * **La révocation est l'écrasement.** Il n'y a jamais deux liens valides pour un
 * même prestataire parce qu'il n'y a jamais deux champs : réémettre efface. Rien
 * à expirer, rien à balayer, aucune liste de jetons morts à tenir.
 */
export const emettreJetonSuivi = onCall({ region: REGION }, async (requete) => {
  exigerResponsable(requete);

  const prestataireId = String(requete.data?.prestataireId ?? "").trim();
  if (!prestataireId) {
    throw new HttpsError("invalid-argument", "Indiquez le prestataire.");
  }

  const { base, horodatage } = await admin();
  const reference = base.doc(`prestataires/${prestataireId}`);
  if (!(await reference.get()).exists) {
    throw new HttpsError("not-found", "Ce prestataire n'existe pas.");
  }

  /* `base64url` : le jeton vit dans un segment d'URL, où `+`, `/` et `=` ne
     survivent pas. Trente-deux octets rendent quarante-trois caractères. */
  const jeton = randomBytes(OCTETS_JETON).toString("base64url");

  await reference.update({
    jetonSuivi: jeton,
    jetonEmisLe: horodatage,
    updatedAt: horodatage,
    /* Le responsable a décidé d'ouvrir un lien, mais c'est le serveur qui a
       fabriqué le secret. Lui attribuer l'écriture laisserait croire qu'il a
       choisi la valeur. */
    updatedBy: "systeme",
    updatedByName: "Émission d'un lien de suivi",
  });

  logger.info("Lien de suivi émis", { prestataire: prestataireId });
  return { jeton };
});

/** Un `Timestamp` Firestore en millisecondes. La préversion porte parfois des `Date` nues. */
function horodatageEnMillisecondes(valeur: unknown): number | null {
  if (valeur instanceof Timestamp) return valeur.toMillis();
  if (valeur instanceof Date) return valeur.getTime();
  return null;
}

/**
 * Répond à un lien de suivi.
 *
 * **La seule porte du portail.** Aucune règle Firestore n'est assouplie par
 * S56 : un visiteur non authentifié ne lit rien de la base, et un test de règles
 * le prouve. Tout passe par ici, avec les droits du serveur, et ce qui sort est
 * exactement la charge utile que `construireSuivi` fabrique.
 *
 * **Le jeton arrive dans le CORPS, jamais dans l'URL de la fonction.** Une URL
 * se retrouve dans les journaux d'accès ; un corps non. Le lien du prestataire,
 * lui, porte forcément le jeton dans son URL — mais cette URL est servie par le
 * produit, et c'est justement le rendu côté serveur qui évite de le faire
 * traverser une seconde fois.
 *
 * `cors: false`, comme `amorcerResponsable` : cette fonction n'est appelée que
 * par le serveur Next, jamais par un navigateur. Lui ouvrir CORS serait ouvrir
 * une porte dont personne n'a l'usage.
 */
export const suiviPrestataire = onRequest(
  { region: REGION, cors: false },
  async (requete, reponse) => {
    if (requete.method !== "POST") {
      reponse.status(405).json({ erreur: "Méthode non autorisée." });
      return;
    }

    const jeton: unknown = requete.body?.jeton;

    /* **La forme se vérifie AVANT toute lecture**, et ce n'est pas une
       optimisation. Sans ce filtre, n'importe quelle valeur trouvée dans une URL
       partirait en requête — une lecture offerte par essai à qui tape au hasard.
       Et surtout : une fiche jamais émise n'a pas de `jetonSuivi`, donc
       `where('jetonSuivi', '==', null)` rendrait TOUTES ces fiches. Un portail
       devenu annuaire, par un appel sans argument. */
    if (typeof jeton !== "string" || !FORME_JETON.test(jeton)) {
      reponse.status(404).json(REFUS_PORTAIL);
      return;
    }

    const { base } = await admin();
    const fiches = await base
      .collection("prestataires")
      .where("jetonSuivi", "==", jeton)
      .limit(1)
      .get();

    if (fiches.empty) {
      reponse.status(404).json(REFUS_PORTAIL);
      return;
    }

    const fiche = fiches.docs[0];

    /* **Une seule requête pour les cartes, sur `prestataireId` seul.** Le type
       n'est pas filtré : seule une carte grise part chez un prestataire, donc ce
       champ ne vaut jamais rien d'autre. Ajouter `type` ferait deux égalités sur
       un groupe de collections, c'est-à-dire un index composite de plus pour un
       filtre qui ne retire aucune ligne.

       Cette requête exige en revanche un index de portée « groupe de
       collections » sur `prestataireId`, déclaré dans `firestore.indexes.json`.
       L'émulateur crée ses index tout seul et ne l'aurait jamais signalé : c'est
       en production que l'oubli se serait vu. */
    const cartes = await base
      .collectionGroup("documents")
      .where("prestataireId", "==", fiche.id)
      .get();

    /**
     * Le nom d'une ligne de référentiel, lue une seule fois.
     *
     * **Une moto ne porte pas sa marque, elle porte `marqueId`** — et le
     * portail affichait « Moto inconnue » sur toutes ses lignes parce qu'il
     * demandait un `marqueNom` qui n'a jamais existé. Le défaut était muet : un
     * champ absent rend une chaîne vide, et le repli de libellé faisait le
     * reste.
     *
     * La promesse est mise en cache, pas son résultat : les lignes se
     * construisent en parallèle, et deux motos de la même marque ne doivent
     * déclencher qu'une lecture.
     */
    const nomsLus = new Map<string, Promise<string>>();
    const nomDuReferentiel = (chemin: string | null): Promise<string> => {
      if (!chemin) return Promise.resolve("");
      const dejaLu = nomsLus.get(chemin);
      if (dejaLu) return dejaLu;
      const lecture = base
        .doc(chemin)
        .get()
        .then((ligne) => String(ligne.get("nom") ?? ""))
        .catch(() => "");
      nomsLus.set(chemin, lecture);
      return lecture;
    };

    const lignes = await Promise.all(
      cartes.docs.map(async (carte) => {
        const venteId = carte.ref.parent.parent?.id ?? "";
        const vente = venteId ? await base.doc(`ventesMotos/${venteId}`).get() : null;

        const motoId = vente?.get("motoId");
        const clientId = vente?.get("clientId");
        /* Les deux lectures partent ensemble : une par ligne suffirait à rendre
           un prestataire de deux cents cartes désagréable à consulter. */
        const [moto, client] = await Promise.all([
          motoId ? base.doc(`motos/${motoId}`).get() : null,
          clientId ? base.doc(`clients/${clientId}`).get() : null,
        ]);

        const [marque, modele] = await Promise.all([
          nomDuReferentiel(moto?.get("marqueId") ? `marques/${moto.get("marqueId")}` : null),
          nomDuReferentiel(moto?.get("modeleId") ? `modeles/${moto.get("modeleId")}` : null),
        ]);

        /* Une vente, une moto ou un client devenu illisible ne fait pas tomber
           le portail : la ligne se construit et dit ce qu'elle ne sait pas.
           `construireSuivi` porte les replis de libellé. */
        return {
          venteId,
          statut: String(carte.get("statut") ?? ""),
          deposeLe: horodatageEnMillisecondes(carte.get("deposeLe")),
          remisLe: horodatageEnMillisecondes(carte.get("remisLe")),
          avance: typeof carte.get("avance") === "number" ? (carte.get("avance") as number) : null,
          numeroVente: String(vente?.get("numero") ?? ""),
          client: String(client?.get("nom") ?? ""),
          moto: [marque, modele].filter(Boolean).join(" "),
          /* `numeroChassis`, et non `chassis` : l'autre nom n'existe pas, et
             le portail n'a donc jamais affiché le numéro gravé — celui-là
             même qu'un prestataire dicte au téléphone pour lever un doute. */
          chassis: String(moto?.get("numeroChassis") ?? ""),
        };
      }),
    );

    /* **La vente n'est jamais lue au-delà de son numéro, et `prive/` n'est
       jamais ouverte.** Ce n'est pas une précaution qu'il faudrait maintenir :
       c'est l'absence de code pour le faire. Le mur de D2 tient par
       construction, et un test de déclencheur sème un coût pour le prouver. */
    reponse.status(200).json(construireSuivi(String(fiche.get("nom") ?? ""), lignes, Date.now()));
  },
);
