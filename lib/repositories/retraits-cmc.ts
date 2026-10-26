import {
  addDoc,
  collection,
  onSnapshot,
  query,
  Timestamp,
  where,
  type DocumentData,
  type QueryDocumentSnapshot,
} from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import {
  normaliserRetraitCmc,
  type RetraitCmc,
  type SaisieRetraitCmc,
} from "@/lib/domain/retrait-cmc";
import { suivreEcriture } from "@/lib/reseau/file-ecritures";
import { signalerSourceDonnees } from "@/lib/reseau/source-donnees";
import { traceCreation, type Auteur } from "./referentiels";

/**
 * Le registre des CMC retirés (26 octobre 2026).
 *
 * Une collection de premier niveau et non une sous-collection d'une moto :
 * celui qui vient chercher un CMC n'est pas toujours l'acheteur, et la moto
 * n'est pas toujours une moto vendue par la maison. Accrocher la ligne à un
 * document qui peut ne pas exister aurait écarté la moitié des cas.
 *
 * Rien ne se supprime ni ne se réécrit ici en dehors d'une correction : un
 * registre dit ce qui s'est passé au comptoir ce jour-là.
 */

function lireRetrait(instantane: QueryDocumentSnapshot<DocumentData>): RetraitCmc {
  const donnees = instantane.data();
  const date = donnees.date;
  return {
    id: instantane.id,
    boutiqueId: donnees.boutiqueId ?? "",
    nom: donnees.nom ?? "",
    prenom: donnees.prenom ?? "",
    telephone: donnees.telephone ?? "",
    numeroMoto: donnees.numeroMoto ?? "",
    date: date instanceof Timestamp ? date.toDate() : null,
    auteur: donnees.createdByName ?? "",
  };
}

/**
 * Écoute le registre d'une boutique, ou de toutes pour le responsable.
 *
 * Trié du plus récent au plus ancien : on consulte ce registre pour savoir qui
 * est passé, et la question porte presque toujours sur ces jours-ci. Le tri
 * est fait ici plutôt que par une requête ordonnée — le cache local répond
 * alors sans index, hors ligne compris.
 */
export function ecouterRetraitsCmc(
  boutiqueId: string | null,
  auChangement: (retraits: RetraitCmc[]) => void,
  enErreur: (cause: unknown) => void,
): () => void {
  const base = collection(db(), "retraitsCmc");
  const requete = boutiqueId ? query(base, where("boutiqueId", "==", boutiqueId)) : query(base);

  return onSnapshot(
    requete,
    { includeMetadataChanges: true },
    (instantane) => {
      signalerSourceDonnees(instantane.metadata.fromCache);
      auChangement(
        instantane.docs
          .map(lireRetrait)
          .sort((a, b) => (b.date?.getTime() ?? 0) - (a.date?.getTime() ?? 0)),
      );
    },
    enErreur,
  );
}

/**
 * Inscrit une ligne au registre.
 *
 * La date vient de l'appareil (D38) : un CMC remis lundi sans réseau et
 * synchronisé mercredi est sorti lundi. Seuls les horodatages d'audit, qui
 * disent quand la donnée a été écrite, viennent du serveur — et c'est
 * `traceCreation` qui les pose.
 */
export function enregistrerRetraitCmc(
  saisie: SaisieRetraitCmc,
  boutiqueId: string,
  auteur: Auteur,
): { enregistre: Promise<void> } {
  const propre = normaliserRetraitCmc(saisie);
  return {
    enregistre: suivreEcriture(
      addDoc(collection(db(), "retraitsCmc"), {
        boutiqueId,
        ...propre,
        date: Timestamp.fromDate(new Date()),
        ...traceCreation(auteur),
      }).then(() => undefined),
    ),
  };
}

export function messageErreurRetraitCmc(cause: unknown): string {
  const code = (cause as { code?: string } | null)?.code ?? "";
  if (code.includes("permission-denied")) {
    return "Vous n’avez pas le droit d’écrire dans le registre de cette boutique.";
  }
  if (code.includes("unauthenticated")) return "Votre session a expiré. Reconnectez-vous.";
  return "La ligne n’a pas pu être enregistrée. Réessayez.";
}
