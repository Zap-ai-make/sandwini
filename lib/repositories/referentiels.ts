import {
  collection,
  doc,
  onSnapshot,
  serverTimestamp,
  setDoc,
  updateDoc,
  type DocumentData,
  type QueryDocumentSnapshot,
} from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import {
  comparerReferentiels,
  type CollectionReferentiel,
  type Modele,
  type Referentiel,
} from "@/lib/domain/referentiel";
import { suivreEcriture } from "@/lib/reseau/file-ecritures";
import { signalerSourceDonnees } from "@/lib/reseau/source-donnees";

/**
 * Les référentiels.
 *
 * Écrits directement depuis le navigateur, comme les boutiques : ce sont des
 * données ordinaires, aucun droit n'en dépend, et elles se saisissent hors
 * ligne comme tout le reste.
 *
 * **L'identifiant est tiré au sort, pas dérivé du nom** — à l'inverse du code
 * de boutique (D30). Un nom de marque se corrige (« Yhamaha » un lundi matin) ;
 * s'il était la clé, la correction créerait une seconde marque et couperait le
 * stock en deux. La clé n'a donc aucun sens à part identifier.
 */

export type Auteur = { uid: string; nom: string };

function lireReferentiel(instantane: QueryDocumentSnapshot<DocumentData>): Referentiel {
  const donnees = instantane.data();
  return {
    id: instantane.id,
    nom: donnees.nom ?? "",
    actif: donnees.actif !== false,
  };
}

export function traceCreation(auteur: Auteur) {
  const horodatage = serverTimestamp();
  return {
    createdAt: horodatage,
    createdBy: auteur.uid,
    createdByName: auteur.nom,
    updatedAt: horodatage,
    updatedBy: auteur.uid,
    updatedByName: auteur.nom,
  };
}

export function traceModification(auteur: Auteur) {
  return {
    updatedAt: serverTimestamp(),
    updatedBy: auteur.uid,
    updatedByName: auteur.nom,
  };
}

export function ecouterReferentiel(
  nomCollection: CollectionReferentiel,
  auChangement: (entrees: Referentiel[]) => void,
  enErreur: (cause: unknown) => void,
): () => void {
  return onSnapshot(
    collection(db(), nomCollection),
    { includeMetadataChanges: true },
    (instantane) => {
      signalerSourceDonnees(instantane.metadata.fromCache);
      auChangement(instantane.docs.map(lireReferentiel).sort(comparerReferentiels));
    },
    enErreur,
  );
}

/**
 * Crée une entrée et **rend son identifiant tout de suite**.
 *
 * L'identifiant est tiré avant l'écriture, comme pour une moto : depuis S39 la
 * marque se crée en plein formulaire d'entrée en stock, et le `<select>` doit
 * pouvoir la sélectionner dans la foulée — sans réseau, donc sans attendre le
 * serveur. `addDoc` connaît lui aussi l'identifiant d'avance, mais il ne le
 * rend qu'au bout d'une promesse qui, hors ligne, ne se résout jamais.
 *
 * La promesse reste offerte à part, pour qui veut signaler l'échec.
 */
export function creerEntree(
  nomCollection: CollectionReferentiel,
  nom: string,
  auteur: Auteur,
): { id: string; enregistre: Promise<void> } {
  const reference = doc(collection(db(), nomCollection));
  return {
    id: reference.id,
    enregistre: suivreEcriture(
      setDoc(reference, { nom: nom.trim(), actif: true, ...traceCreation(auteur) }),
    ),
  };
}

export function renommerEntree(
  nomCollection: CollectionReferentiel,
  id: string,
  nom: string,
  auteur: Auteur,
): Promise<void> {
  return suivreEcriture(
    updateDoc(doc(db(), nomCollection, id), { nom: nom.trim(), ...traceModification(auteur) }),
  );
}

/**
 * Active ou désactive une entrée.
 *
 * On ne supprime jamais : des motos citent leur marque, des frais citent leur
 * type. Désactivée, l'entrée disparaît des listes de choix et reste lisible
 * partout où elle a déjà servi.
 */
export function changerActivationEntree(
  nomCollection: CollectionReferentiel,
  id: string,
  actif: boolean,
  auteur: Auteur,
): Promise<void> {
  return suivreEcriture(
    updateDoc(doc(db(), nomCollection, id), { actif, ...traceModification(auteur) }),
  );
}

/* --- Modèles ------------------------------------------------------------- */

export function ecouterModeles(
  auChangement: (modeles: Modele[]) => void,
  enErreur: (cause: unknown) => void,
): () => void {
  return onSnapshot(
    collection(db(), "modeles"),
    { includeMetadataChanges: true },
    (instantane) => {
      signalerSourceDonnees(instantane.metadata.fromCache);
      auChangement(
        instantane.docs
          .map((document) => ({
            ...lireReferentiel(document),
            marqueId: document.data().marqueId ?? "",
          }))
          .sort(comparerReferentiels),
      );
    },
    enErreur,
  );
}

/**
 * Même montage que `creerEntree`, et la même raison (S39).
 *
 * L'ordre compte hors ligne : si la marque vient d'être créée sur le même
 * formulaire, elle est déjà dans la file d'écritures, et Firestore la rejoue
 * avant ce modèle-ci. La règle `exists(marques/{id})` sera donc vraie à
 * l'arrivée, même si les deux documents sont partis du même geste sans réseau.
 */
export function creerModele(
  marqueId: string,
  nom: string,
  auteur: Auteur,
): { id: string; enregistre: Promise<void> } {
  const reference = doc(collection(db(), "modeles"));
  return {
    id: reference.id,
    enregistre: suivreEcriture(
      setDoc(reference, { marqueId, nom: nom.trim(), actif: true, ...traceCreation(auteur) }),
    ),
  };
}

export function renommerModele(id: string, nom: string, auteur: Auteur): Promise<void> {
  return suivreEcriture(
    updateDoc(doc(db(), "modeles", id), { nom: nom.trim(), ...traceModification(auteur) }),
  );
}

export function changerActivationModele(
  id: string,
  actif: boolean,
  auteur: Auteur,
): Promise<void> {
  return suivreEcriture(
    updateDoc(doc(db(), "modeles", id), { actif, ...traceModification(auteur) }),
  );
}

/** Traduit les refus de Firestore en phrases qui disent quoi faire. */
export function messageErreurReferentiel(cause: unknown): string {
  const code = (cause as { code?: string }).code ?? "";
  if (code.includes("permission-denied")) return "Cette action est réservée au responsable.";
  if (code.includes("not-found")) return "Cette entrée n’existe plus.";
  if (code.includes("unauthenticated")) return "Votre session a expiré. Reconnectez-vous.";
  return "L’enregistrement n’a pas abouti.";
}
