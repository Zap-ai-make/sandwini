import {
  collection,
  doc,
  onSnapshot,
  setDoc,
  updateDoc,
  type DocumentData,
  type QueryDocumentSnapshot,
} from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import {
  comparerClients,
  normaliserNom,
  normaliserTelephone,
  type Client,
  type SaisieClient,
} from "@/lib/domain/client";
import { suivreEcriture } from "@/lib/reseau/file-ecritures";
import { signalerSourceDonnees } from "@/lib/reseau/source-donnees";
import { traceCreation, traceModification, type Auteur } from "./referentiels";

/**
 * Le fichier clients.
 *
 * Commun à toutes les boutiques (`DECISIONS.md` D16) : pas de `boutiqueId`,
 * donc pas de filtre de périmètre. C'est la seule collection dans ce cas, et
 * c'est assumé — un client est une personne, pas une opération.
 *
 * Le téléphone est la clé de **recherche**, jamais la clé du document : un
 * numéro se corrige, et s'il était l'identifiant, la correction créerait un
 * second client en orphelinant son historique de ventes.
 */

function lireClient(instantane: QueryDocumentSnapshot<DocumentData>): Client {
  const donnees = instantane.data();
  return {
    id: instantane.id,
    nom: donnees.nom ?? "",
    telephone: donnees.telephone ?? "",
    telephoneNormalise: donnees.telephoneNormalise ?? "",
    telephone2: donnees.telephone2 ?? "",
    adresse: donnees.adresse ?? "",
    note: donnees.note ?? "",
    nomNormalise: donnees.nomNormalise ?? "",
  };
}

export function ecouterClients(
  auChangement: (clients: Client[]) => void,
  enErreur: (cause: unknown) => void,
): () => void {
  return onSnapshot(
    collection(db(), "clients"),
    { includeMetadataChanges: true },
    (instantane) => {
      signalerSourceDonnees(instantane.metadata.fromCache);
      auChangement(instantane.docs.map(lireClient).sort(comparerClients));
    },
    enErreur,
  );
}

/**
 * Les deux formes normalisées accompagnent toujours le texte saisi.
 *
 * Le cahier des charges les demande explicitement (§5.3) : sans elles, le même
 * client écrit « Ouédraogo » puis « ouedraogo », ou « 70123456 » puis
 * « +226 70 12 34 56 », ne se retrouve pas — et se recrée.
 */
function versDocument(saisie: SaisieClient) {
  return {
    nom: saisie.nom.trim(),
    nomNormalise: normaliserNom(saisie.nom),
    telephone: saisie.telephone.trim(),
    telephoneNormalise: normaliserTelephone(saisie.telephone),
    telephone2: saisie.telephone2.trim(),
    adresse: saisie.adresse.trim(),
    note: saisie.note.trim(),
  };
}

/**
 * Crée un client et rend son identifiant tout de suite.
 *
 * L'identifiant existe avant que l'écriture n'aboutisse : hors ligne, la
 * promesse ne se résout qu'au retour du réseau, mais l'écran de vente doit
 * pouvoir rattacher la vente à ce client immédiatement — c'est tout l'intérêt
 * d'une création « à la volée » (`prompt.md` §7).
 */
export function creerClient(
  saisie: SaisieClient,
  auteur: Auteur,
): { id: string; enregistre: Promise<void> } {
  /* `setDoc` sur une référence tirée d'avance, et non `addDoc` : c'est ce qui
     donne l'identifiant sans attendre le serveur. */
  const reference = doc(collection(db(), "clients"));
  const enregistre = suivreEcriture(
    setDoc(reference, { ...versDocument(saisie), ...traceCreation(auteur) }),
  );
  return { id: reference.id, enregistre };
}

export function modifierClient(
  id: string,
  saisie: SaisieClient,
  auteur: Auteur,
): Promise<void> {
  return suivreEcriture(
    updateDoc(doc(db(), "clients", id), {
      ...versDocument(saisie),
      ...traceModification(auteur),
    }),
  );
}

/** Traduit les refus de Firestore en phrases qui disent quoi faire. */
export function messageErreurClient(cause: unknown): string {
  const code = (cause as { code?: string }).code ?? "";
  if (code.includes("permission-denied")) return "Cette action ne vous est pas permise.";
  if (code.includes("not-found")) return "Ce client n’existe plus.";
  if (code.includes("unauthenticated")) return "Votre session a expiré. Reconnectez-vous.";
  return "L’enregistrement n’a pas abouti.";
}
