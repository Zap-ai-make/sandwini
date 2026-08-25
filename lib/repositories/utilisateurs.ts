import { collection, onSnapshot, orderBy, query } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { db, fonctions } from "@/lib/firebase/client";
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

/* Ces deux appels passent par le serveur : poser un custom claim ou couper un
   compte demande le SDK Admin. Ce sont les seules opérations du MVP qui ne
   fonctionnent pas hors ligne, et c’est acceptable — on ne crée pas un compte
   de gérant au milieu d’une vente. */

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

/** Traduit les codes d’erreur des fonctions appelables en phrases utiles. */
export function messageErreurUtilisateur(cause: unknown): string {
  const code = (cause as { code?: string }).code ?? "";
  const message = (cause as { message?: string }).message ?? "";
  if (code.includes("already-exists")) return "Cette adresse e-mail a déjà un compte.";
  if (code.includes("permission-denied")) return "Cette action est réservée au responsable.";
  if (code.includes("unauthenticated")) return "Votre session a expiré. Reconnectez-vous.";
  if (code.includes("invalid-argument")) return message || "Une information saisie est invalide.";
  if (code.includes("failed-precondition")) return message || "Action impossible.";
  if (code.includes("unavailable") || code.includes("internal")) {
    return "Le serveur n’a pas répondu. Cette action demande du réseau — réessayez une fois connecté.";
  }
  return "L’action n’a pas abouti.";
}
