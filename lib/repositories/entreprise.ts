import { doc, onSnapshot, setDoc } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import {
  REGLAGES_DEFAUT,
  SEUIL_INACTIVITE_DEFAUT,
  type ReglagesEntreprise,
} from "@/lib/domain/entreprise";
import { suivreEcriture } from "@/lib/reseau/file-ecritures";
import { signalerSourceDonnees } from "@/lib/reseau/source-donnees";
import { traceModification, type Auteur } from "./referentiels";

/**
 * Les réglages de l'entreprise — un seul document, `entreprise/profil`.
 *
 * Il ne porte plus l'identité : celle-ci est une constante de
 * `lib/domain/entreprise.ts` depuis D71. Ce qui reste ici tient en un entier,
 * le seuil d'inactivité des tranches.
 *
 * Le document garde son chemin plutôt que d'être renommé : les fiches déjà
 * écrites en préversion portent le seuil, et une migration pour changer un nom
 * de collection serait un risque payé pour rien. Les anciens champs d'identité
 * qui y traînent encore ne sont plus lus, et la règle Firestore ne les accepte
 * plus en écriture — ils s'éteindront à la première sauvegarde.
 */

const CHEMIN = ["entreprise", "profil"] as const;

export function ecouterReglages(
  auChangement: (reglages: ReglagesEntreprise) => void,
  enErreur: (cause: unknown) => void,
): () => void {
  return onSnapshot(
    doc(db(), ...CHEMIN),
    { includeMetadataChanges: true },
    (instantane) => {
      signalerSourceDonnees(instantane.metadata.fromCache);
      const donnees = instantane.data();
      auChangement(
        donnees
          ? {
              /* Absent des fiches saisies avant S9 : le défaut du cahier des
                 charges prend le relais plutôt qu'un zéro qui signalerait
                 toutes les tranches comme inactives. */
              seuilInactiviteTranches:
                typeof donnees.seuilInactiviteTranches === "number"
                  ? donnees.seuilInactiviteTranches
                  : SEUIL_INACTIVITE_DEFAUT,
            }
          : REGLAGES_DEFAUT,
      );
    },
    enErreur,
  );
}

export function enregistrerReglages(
  reglages: ReglagesEntreprise,
  auteur: Auteur,
): Promise<void> {
  /* Écriture **sans `merge`**, et c'est le point important. En fusion,
     Firestore évalue la règle sur le document résultant : les anciens champs
     d'identité y seraient encore, et `hasOnly` les refuserait — la sauvegarde
     échouerait sur toute fiche saisie avant D71. Le remplacement complet écrit
     exactement ce que la règle attend, et efface l'identité périmée au
     passage. Il n'y a rien d'autre à préserver dans ce document. */
  return suivreEcriture(
    setDoc(doc(db(), ...CHEMIN), { ...reglages, ...traceModification(auteur) }),
  );
}
