import { collection, onSnapshot, orderBy, query } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { db, fonctions } from "@/lib/firebase/client";
import { phraseDuServeur } from "@/lib/firebase/erreur-appelable";
import type { Role } from "@/lib/domain/roles";

export type FicheUtilisateur = {
  uid: string;
  nom: string;
  email: string;
  role: Role;
  boutiqueId: string | null;
  actif: boolean;
};

/**
 * Liste des comptes, en direct.
 *
 * Lecture seule : rien ici ne modifie `users/{uid}`. Les règles Firestore
 * l’interdisent d’ailleurs à tout le monde — seules les Cloud Functions
 * écrivent dans cette collection, parce qu’un rôle qu’on peut modifier depuis
 * le navigateur n’est pas un rôle.
 */
export function ecouterUtilisateurs(
  auChangement: (utilisateurs: FicheUtilisateur[]) => void,
  enErreur: (cause: unknown) => void,
): () => void {
  const requete = query(collection(db(), "users"), orderBy("nom"));
  return onSnapshot(
    requete,
    (instantane) => {
      auChangement(
        instantane.docs.map((document) => {
          const donnees = document.data();
          return {
            uid: document.id,
            nom: donnees.nom ?? "",
            email: donnees.email ?? "",
            role: donnees.role as Role,
            boutiqueId: donnees.boutiqueId ?? null,
            actif: donnees.actif !== false,
          };
        }),
      );
    },
    enErreur,
  );
}

export type NouveauGerant = {
  nom: string;
  email: string;
  motDePasse: string;
  boutiqueId?: string | null;
};

/* Ces appels passent par le serveur : poser un custom claim, couper un compte
   ou l’effacer demande le SDK Admin. Ce sont les seules opérations du MVP qui
   ne fonctionnent pas hors ligne, et c’est acceptable — on n’administre pas un
   compte de gérant au milieu d’une vente. */

export async function creerGerant(gerant: NouveauGerant): Promise<{ uid: string }> {
  const appel = httpsCallable<NouveauGerant, { uid: string }>(fonctions(), "creerGerant");
  const reponse = await appel(gerant);
  return reponse.data;
}

export async function changerActivation(uid: string, actif: boolean): Promise<void> {
  const appel = httpsCallable<{ uid: string; actif: boolean }, { uid: string; actif: boolean }>(
    fonctions(),
    "changerActivationUtilisateur",
  );
  await appel({ uid, actif });
}

/**
 * Ce qu’on demande de corriger sur un compte (S52).
 *
 * **Un champ omis veut dire « n’y touche pas ».** C’est le serveur qui tient
 * cette distinction (`functions/src/gerants.ts`), et elle est stricte : un
 * champ présent mais vide est refusé plutôt qu’ignoré, pour qu’un formulaire
 * n’annonce jamais un enregistrement qu’il n’a pas fait.
 *
 * La boutique de rattachement n’est pas ici : elle a sa propre fonction
 * (`attribuerBoutique`), parce qu’elle déplace un périmètre de sécurité et non
 * une identité.
 */
export type ModificationGerant = {
  uid: string;
  nom?: string;
  email?: string;
  motDePasse?: string;
};

/**
 * Corrige l’identité d’un gérant.
 *
 * Rend `sessionsFermees` : vrai quand l’adresse ou le mot de passe a changé,
 * donc quand le gérant devra se reconnecter. L’écran le dit avec ses mots —
 * c’est une information que le responsable doit transmettre, souvent pendant
 * que le gérant est en train de vendre.
 */
export async function modifierGerant(
  modification: ModificationGerant,
): Promise<{ sessionsFermees: boolean }> {
  const appel = httpsCallable<ModificationGerant, { uid: string; sessionsFermees: boolean }>(
    fonctions(),
    "modifierGerant",
  );
  const reponse = await appel(modification);
  return { sessionsFermees: reponse.data.sessionsFermees };
}

/**
 * Efface un compte de gérant — le serveur refuse s’il a signé quelque chose.
 *
 * Le refus arrive en `failed-precondition`, avec la phrase qui dit quoi faire à
 * la place : désactiver. `messageErreurUtilisateur` la laisse passer telle
 * quelle, parce que seul le serveur sait si ce compte a enregistré des
 * opérations.
 */
export async function supprimerGerant(uid: string): Promise<void> {
  const appel = httpsCallable<{ uid: string }, { uid: string }>(fonctions(), "supprimerGerant");
  await appel({ uid });
}

/** Traduit les codes d’erreur des fonctions appelables en phrases utiles. */
export function messageErreurUtilisateur(cause: unknown): string {
  const code = (cause as { code?: string } | null | undefined)?.code ?? "";
  /* Le SDK colle le code HTTP à la fin de chaque message appelable : sans ce
     nettoyage, le refus d’effacement se lit « … doit rester lisible dans
     l’historique. [400] » — vu à l’écran en S52. */
  const message = phraseDuServeur(cause);
  if (code.includes("already-exists")) return "Cette adresse e-mail a déjà un compte.";
  /* Le message du serveur passe quand il y en a un : depuis S52, un refus de
     permission ne dit plus seulement « réservé au responsable » — il dit aussi
     « un compte responsable ne se gère pas ici », ce qui vise autre chose. */
  if (code.includes("permission-denied")) {
    return message || "Cette action est réservée au responsable.";
  }
  if (code.includes("unauthenticated")) return "Votre session a expiré. Reconnectez-vous.";
  if (code.includes("invalid-argument")) return message || "Une information saisie est invalide.";
  if (code.includes("not-found")) return message || "Ce compte ou cette boutique n’existe plus.";
  if (code.includes("failed-precondition")) return message || "Action impossible.";
  if (code.includes("unavailable") || code.includes("internal")) {
    return "Le serveur n’a pas répondu. Cette action demande du réseau — réessayez une fois connecté.";
  }
  return "L’action n’a pas abouti.";
}
