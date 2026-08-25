import { HttpsError, onCall, type CallableRequest } from "firebase-functions/v2/https";

/**
 * Les seules opérations du MVP qui passent par le serveur.
 *
 * Elles y passent parce qu'elles ne peuvent pas faire autrement : poser un
 * custom claim ou désactiver un compte demande le SDK Admin, qui n'a rien à
 * faire dans un navigateur. Tout le reste — ventes, versements, stock — écrit
 * directement dans Firestore pour rester utilisable sans réseau (prompt.md
 * §3.4). Ces fonctions-ci sont administratives : le responsable les utilise au
 * calme, connecté, jamais au comptoir en pleine vente.
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
 */
async function admin() {
  const [app, auth, firestore] = await Promise.all([
    import("firebase-admin/app"),
    import("firebase-admin/auth"),
    import("firebase-admin/firestore"),
  ]);
  if (app.getApps().length === 0) app.initializeApp();
  return {
    auth: auth.getAuth(),
    base: firestore.getFirestore(),
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
 * Crée un compte de gérant : compte d'authentification, custom claims et
 * miroir dans `users/{uid}`.
 *
 * Le `boutiqueId` est facultatif ici : les boutiques arrivent avec S3. Un
 * gérant sans boutique peut se connecter mais ne voit aucune donnée, et
 * l'application le lui dit franchement plutôt que d'afficher un écran vide.
 */
export const creerGerant = onCall({ region: REGION }, async (requete) => {
  exigerResponsable(requete);

  const nom = texteObligatoire(requete.data?.nom, "nom");
  const email = texteObligatoire(requete.data?.email, "e-mail").toLowerCase();
  const motDePasse = texteObligatoire(requete.data?.motDePasse, "mot de passe", 128);
  const boutiqueId =
    typeof requete.data?.boutiqueId === "string" && requete.data.boutiqueId.trim()
      ? requete.data.boutiqueId.trim()
      : null;

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
