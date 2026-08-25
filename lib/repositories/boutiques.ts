import {
  collection,
  doc,
  onSnapshot,
  serverTimestamp,
  setDoc,
  updateDoc,
  type DocumentData,
  type DocumentSnapshot,
} from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { db, fonctions } from "@/lib/firebase/client";
import {
  comparerBoutiques,
  normaliserBoutique,
  type Boutique,
  type SaisieBoutique,
} from "@/lib/domain/boutique";
import { suivreEcriture } from "@/lib/reseau/file-ecritures";
import { signalerSourceDonnees } from "@/lib/reseau/source-donnees";

/**
 * Les boutiques.
 *
 * Contrairement aux comptes, elles s’écrivent **directement** depuis le
 * navigateur : ce sont des données ordinaires, aucun droit n’en dépend, et une
 * boutique doit pouvoir se créer ou se corriger sans réseau comme le reste de
 * l’application. Seul le rattachement d’un gérant à une boutique passe par le
 * serveur, parce qu’il déplace un custom claim.
 *
 * L’identifiant du document **est** le code (`boutiques/PTG`). Firestore ne
 * sait pas imposer l’unicité d’un champ ; en faire la clé la donne
 * gratuitement, et le code est de toute façon immuable puisqu’il entre dans les
 * numéros de reçus (`DECISIONS.md` D5 et D30).
 */

type Auteur = { uid: string; nom: string };

function lireBoutique(instantane: DocumentSnapshot<DocumentData>): Boutique {
  const donnees = instantane.data() ?? {};
  return {
    id: instantane.id,
    code: typeof donnees.code === "string" ? donnees.code : instantane.id,
    nom: donnees.nom ?? "",
    adresse: donnees.adresse ?? "",
    telephone: donnees.telephone ?? "",
    actif: donnees.actif !== false,
  };
}

/**
 * Toutes les boutiques, en direct — réservé au responsable par les règles.
 *
 * `includeMetadataChanges` n’est pas du zèle : c’est ce qui fait remonter
 * `fromCache`, la seule réponse fiable à « Firestore atteint-il le serveur ? »
 * (cf. `lib/reseau/source-donnees.ts`).
 */
export function ecouterBoutiques(
  auChangement: (boutiques: Boutique[]) => void,
  enErreur: (cause: unknown) => void,
): () => void {
  return onSnapshot(
    collection(db(), "boutiques"),
    { includeMetadataChanges: true },
    (instantane) => {
      signalerSourceDonnees(instantane.metadata.fromCache);
      auChangement(instantane.docs.map(lireBoutique).sort(comparerBoutiques));
    },
    enErreur,
  );
}

/** La seule boutique qu’un gérant a le droit de lire : la sienne. */
export function ecouterBoutique(
  id: string,
  auChangement: (boutique: Boutique | null) => void,
  enErreur: (cause: unknown) => void,
): () => void {
  return onSnapshot(
    doc(db(), "boutiques", id),
    { includeMetadataChanges: true },
    (instantane) => {
      signalerSourceDonnees(instantane.metadata.fromCache);
      auChangement(instantane.exists() ? lireBoutique(instantane) : null);
    },
    enErreur,
  );
}

/**
 * Crée une boutique.
 *
 * `setDoc` sur un identifiant déjà pris serait une mise à jour déguisée, donc un
 * écrasement silencieux. Les règles l’empêchent : elles exigent que
 * `createdAt` vaille l’heure de la requête, ce qu’une mise à jour ne peut pas
 * produire. Le formulaire, lui, prévient avant d’en arriver là.
 */
export function creerBoutique(saisie: SaisieBoutique, auteur: Auteur): Promise<void> {
  const propre = normaliserBoutique(saisie);
  const horodatage = serverTimestamp();
  return suivreEcriture(
    setDoc(doc(db(), "boutiques", propre.code), {
      ...propre,
      actif: true,
      createdAt: horodatage,
      createdBy: auteur.uid,
      createdByName: auteur.nom,
      updatedAt: horodatage,
      updatedBy: auteur.uid,
      updatedByName: auteur.nom,
    }),
  );
}

/** Modifie le nom, l’adresse ou le téléphone. Le code, lui, ne bouge jamais. */
export function modifierBoutique(
  id: string,
  saisie: SaisieBoutique,
  auteur: Auteur,
): Promise<void> {
  const propre = normaliserBoutique(saisie);
  return suivreEcriture(
    updateDoc(doc(db(), "boutiques", id), {
      nom: propre.nom,
      adresse: propre.adresse,
      telephone: propre.telephone,
      updatedAt: serverTimestamp(),
      updatedBy: auteur.uid,
      updatedByName: auteur.nom,
    }),
  );
}

/**
 * Ouvre ou ferme une boutique.
 *
 * Une boutique ne se supprime pas : des ventes, des reçus et des numéros
 * portent son code. Fermée, elle disparaît des choix de saisie et reste
 * lisible dans l’historique.
 */
export function changerActivationBoutique(
  id: string,
  actif: boolean,
  auteur: Auteur,
): Promise<void> {
  return suivreEcriture(
    updateDoc(doc(db(), "boutiques", id), {
      actif,
      updatedAt: serverTimestamp(),
      updatedBy: auteur.uid,
      updatedByName: auteur.nom,
    }),
  );
}

/**
 * Rattache un gérant à une boutique — ou l’en détache.
 *
 * Seule opération de cet écran qui demande du réseau : le périmètre d’un gérant
 * vit dans son custom claim, que seul le SDK Admin peut poser.
 */
export async function attribuerBoutique(uid: string, boutiqueId: string | null): Promise<void> {
  const appel = httpsCallable<{ uid: string; boutiqueId: string | null }, { uid: string }>(
    fonctions(),
    "attribuerBoutique",
  );
  await appel({ uid, boutiqueId });
}

/** Traduit les refus de Firestore en phrases qui disent quoi faire. */
export function messageErreurBoutique(cause: unknown): string {
  const code = (cause as { code?: string }).code ?? "";
  if (code.includes("permission-denied")) {
    return "Cette action est réservée au responsable.";
  }
  if (code.includes("not-found")) {
    return "Cette boutique n’existe plus.";
  }
  if (code.includes("unauthenticated")) {
    return "Votre session a expiré. Reconnectez-vous.";
  }
  return "L’enregistrement n’a pas abouti.";
}
