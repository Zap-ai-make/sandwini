import { logger } from "firebase-functions";
import { onDocumentCreated } from "firebase-functions/v2/firestore";
import { HttpsError, onCall, type CallableRequest } from "firebase-functions/v2/https";
import { QueryDocumentSnapshot, Timestamp } from "firebase-admin/firestore";
import { resoudreCollision, type PieceNumerotee } from "./numerotation";

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
 * Une exception à la fin du fichier : `reconcilierNumeroVente` n'est appelée
 * par personne, elle réagit à une écriture. C'est la contrepartie serveur de
 * la numérotation hors-ligne — la seule chose qu'un appareil isolé ne peut pas
 * faire lui-même.
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
export const reconcilierNumeroVente = onDocumentCreated(
  /* La région doit rester celle de la base Firestore : un déclencheur déployé
     ailleurs ne se déclenche pas du tout. */
  { region: REGION, document: "ventesMotos/{venteId}" },
  async (evenement) => {
    const creee = evenement.data;
    if (!creee) return;

    const boutiqueId = creee.get("boutiqueId");
    const numeroInitial = creee.get("numeroInitial");
    if (typeof boutiqueId !== "string" || typeof numeroInitial !== "string") return;

    const { base } = await admin();
    const memeNumero = await base
      .collection("ventesMotos")
      .where("boutiqueId", "==", boutiqueId)
      .where("numeroInitial", "==", numeroInitial)
      .get();

    /* Le cas normal, et de très loin le plus fréquent : la pièce est seule à
       porter ce numéro. On sort sans écrire. */
    if (memeNumero.size < 2) return;

    const concurrentes = memeNumero.docs.map(versPiece);
    const moi = concurrentes.find((piece) => piece.id === creee.id);
    if (!moi) return;

    const numero = resoudreCollision(moi, concurrentes);
    if (!numero) return;

    await base.doc(`ventesMotos/${creee.id}`).update({ numero });
    logger.info("Numéro en double réconcilié", {
      boutiqueId,
      numeroInitial,
      numero,
      vente: creee.id,
    });
  },
);

/** Convertit un document de vente en ce que la règle de réconciliation attend, et rien de plus. */
function versPiece(document: QueryDocumentSnapshot): PieceNumerotee {
  const cree = document.get("createdAt");
  return {
    id: document.id,
    numeroInitial: document.get("numeroInitial"),
    /* `createdAt` est un horodatage serveur : au moment où ce déclencheur
       s'exécute, il est déjà résolu. S'il manquait malgré tout, l'identifiant
       du document départage seul — un ordre arbitraire mais stable vaut mieux
       qu'un plantage. */
    recueA: cree instanceof Timestamp ? cree.toMillis() : 0,
  };
}
