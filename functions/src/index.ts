import { logger } from "firebase-functions";
import { onDocumentCreated } from "firebase-functions/v2/firestore";
import { HttpsError, onCall, onRequest, type CallableRequest } from "firebase-functions/v2/https";
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
 * *Limite, à rouvrir le jour où le coût d'une moto deviendra modifiable :* le
 * coût est lu à la synchronisation, pas à la seconde de la vente. Aujourd'hui
 * il est écrit une fois pour toutes à l'entrée en stock, donc les deux valeurs
 * sont la même. Un écran de correction du coût devra soit refuser de toucher
 * une moto vendue, soit laisser cet instantané tranquille.
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

    await base.doc(`ventesMotos/${vente.id}/prive/marge`).set({
      boutiqueId,
      coutMotoSnapshot,
      marge: prixConvenu - coutMotoSnapshot,
      updatedAt: horodatage,
      /* L'auteur est le serveur, et le dire explicitement vaut mieux que
         recopier l'identifiant du gérant : personne n'a saisi ce chiffre. */
      updatedBy: "systeme",
      updatedByName: "Calcul automatique",
    });
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
