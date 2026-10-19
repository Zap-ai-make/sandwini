import {
  collection,
  doc,
  onSnapshot,
  setDoc,
  updateDoc,
  type DocumentData,
  type DocumentSnapshot,
} from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import {
  normaliserFournisseur,
  type Fournisseur,
  type SaisieFournisseur,
} from "@/lib/domain/fournisseur";
import { suivreEcriture } from "@/lib/reseau/file-ecritures";
import { signalerSourceDonnees } from "@/lib/reseau/source-donnees";
import { traceCreation, traceModification, type Auteur } from "./referentiels";

/**
 * Le fichier des fournisseurs (S42).
 *
 * Un fournisseur se crée en plein formulaire d'arrivage, comme une marque se
 * crée en pleine entrée en stock (S39). L'identifiant est donc tiré avant
 * l'écriture, pour que le `<select>` du lot le retienne dans la foulée — sans
 * réseau, donc sans attendre le serveur.
 */

function lireFournisseur(instantane: DocumentSnapshot<DocumentData>): Fournisseur {
  const donnees = instantane.data() ?? {};
  return {
    id: instantane.id,
    nom: donnees.nom ?? "",
    telephone: donnees.telephone ?? "",
    localite: donnees.localite ?? "",
    actif: donnees.actif ?? true,
  };
}

export function ecouterFournisseurs(
  auChangement: (fournisseurs: Fournisseur[]) => void,
  enErreur: (cause: unknown) => void,
): () => void {
  return onSnapshot(
    collection(db(), "fournisseurs"),
    { includeMetadataChanges: true },
    (instantane) => {
      signalerSourceDonnees(instantane.metadata.fromCache);
      auChangement(
        instantane.docs
          .map(lireFournisseur)
          .sort((a, b) => a.nom.localeCompare(b.nom, "fr")),
      );
    },
    enErreur,
  );
}

/** Crée un fournisseur et rend son identifiant tout de suite (cf. `creerEntree`). */
export function creerFournisseur(
  saisie: SaisieFournisseur,
  auteur: Auteur,
): { id: string; enregistre: Promise<void> } {
  const propre = normaliserFournisseur(saisie);
  const reference = doc(collection(db(), "fournisseurs"));
  return {
    id: reference.id,
    enregistre: suivreEcriture(
      setDoc(reference, { ...propre, actif: true, ...traceCreation(auteur) }),
    ),
  };
}

export function modifierFournisseur(
  id: string,
  saisie: SaisieFournisseur,
  auteur: Auteur,
): Promise<void> {
  return suivreEcriture(
    updateDoc(doc(db(), "fournisseurs", id), {
      ...normaliserFournisseur(saisie),
      ...traceModification(auteur),
    }),
  );
}

export function messageErreurFournisseur(cause: unknown): string {
  const code = (cause as { code?: string } | null)?.code ?? "";
  if (code === "permission-denied") return "Vous n’avez pas le droit d’enregistrer ce fournisseur.";
  return "Le fournisseur n’a pas pu être enregistré. Réessayez.";
}
