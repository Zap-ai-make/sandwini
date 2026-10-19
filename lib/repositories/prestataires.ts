import {
  addDoc,
  collection,
  doc,
  onSnapshot,
  updateDoc,
  type DocumentData,
  type QueryDocumentSnapshot,
} from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import {
  estTypeDocument,
  normaliserPrestataire,
  type Prestataire,
  type SaisiePrestataire,
} from "@/lib/domain/prestataire";
import { suivreEcriture } from "@/lib/reseau/file-ecritures";
import { signalerSourceDonnees } from "@/lib/reseau/source-donnees";
import { traceCreation, traceModification, type Auteur } from "./referentiels";

/**
 * Les prestataires.
 *
 * **Le champ `token` du cahier des charges est arrivé** (S56), sous le nom
 * `jetonSuivi`. Il est produit par une Cloud Function, comme annoncé : un
 * secret ne se fabrique pas dans un navigateur (`SECURITY.md` §4), et les
 * règles refusent qu'un navigateur l'écrive. Ce module le **lit** seulement.
 *
 * **Ce qu'il faut savoir en le lisant.** `prestataires` est lisible par tout
 * compte connecté (`allow read: if connecte()`), donc ce jeton l'est aussi. Un
 * gérant ne voit pas l'écran qui l'affiche — il est derrière
 * `gerer_referentiels`, réservé au responsable — mais rien ne l'empêche de lire
 * le document. Ce qu'il y gagnerait est un lien vers des données qu'il voit
 * déjà dans l'application ; le jour où ce ne serait plus vrai, ce champ devrait
 * descendre dans une sous-collection `prive/`, comme les coûts (D2).
 */

function lirePrestataire(instantane: QueryDocumentSnapshot<DocumentData>): Prestataire {
  const donnees = instantane.data();
  const types = Array.isArray(donnees.typesDocuments) ? donnees.typesDocuments : [];
  return {
    id: instantane.id,
    nom: donnees.nom ?? "",
    telephone: donnees.telephone ?? "",
    typesDocuments: types.filter(estTypeDocument),
    actif: donnees.actif !== false,
    jetonSuivi: typeof donnees.jetonSuivi === "string" ? donnees.jetonSuivi : null,
  };
}

export function ecouterPrestataires(
  auChangement: (prestataires: Prestataire[]) => void,
  enErreur: (cause: unknown) => void,
): () => void {
  return onSnapshot(
    collection(db(), "prestataires"),
    { includeMetadataChanges: true },
    (instantane) => {
      signalerSourceDonnees(instantane.metadata.fromCache);
      auChangement(
        instantane.docs.map(lirePrestataire).sort((a, b) => {
          if (a.actif !== b.actif) return a.actif ? -1 : 1;
          return a.nom.localeCompare(b.nom, "fr");
        }),
      );
    },
    enErreur,
  );
}

export function creerPrestataire(saisie: SaisiePrestataire, auteur: Auteur): Promise<unknown> {
  const propre = normaliserPrestataire(saisie);
  return suivreEcriture(
    addDoc(collection(db(), "prestataires"), {
      ...propre,
      actif: true,
      ...traceCreation(auteur),
    }),
  );
}

export function modifierPrestataire(
  id: string,
  saisie: SaisiePrestataire,
  auteur: Auteur,
): Promise<void> {
  return suivreEcriture(
    updateDoc(doc(db(), "prestataires", id), {
      ...normaliserPrestataire(saisie),
      ...traceModification(auteur),
    }),
  );
}

export function changerActivationPrestataire(
  id: string,
  actif: boolean,
  auteur: Auteur,
): Promise<void> {
  return suivreEcriture(
    updateDoc(doc(db(), "prestataires", id), { actif, ...traceModification(auteur) }),
  );
}
