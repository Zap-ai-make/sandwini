import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  Timestamp,
  updateDoc,
  where,
  writeBatch,
  type DocumentData,
  type DocumentSnapshot,
} from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { construireCout } from "@/lib/domain/moto";
import type { Arrivage, MotoDuLot, SaisieArrivage } from "@/lib/domain/arrivage";
import { ecrireMotoDansLot } from "./motos";
import { suivreEcriture } from "@/lib/reseau/file-ecritures";
import { signalerSourceDonnees } from "@/lib/reseau/source-donnees";
import { traceCreation, traceModification, type Auteur } from "./referentiels";

/**
 * Les arrivages — les lots de motos entrées ensemble (S42).
 *
 * Un arrivage et ses motos s'écrivent d'un seul `writeBatch` : soit le lot
 * entier arrive, soit rien. Le coût de chaque moto n'est joint que si le
 * responsable l'a saisi — un gérant n'en fournit pas, et aucun document
 * `prive/cout` n'est alors écrit (D2/S39). Les règles Firestore le garantissent
 * de toute façon ; l'interface ne fait que ne pas le tenter.
 */

function lireArrivage(instantane: DocumentSnapshot<DocumentData>): Arrivage {
  const donnees = instantane.data() ?? {};
  const date = donnees.date;
  const creation = donnees.createdAt;
  return {
    id: instantane.id,
    boutiqueId: donnees.boutiqueId ?? "",
    nom: donnees.nom ?? "",
    fournisseurId: donnees.fournisseurId ?? "",
    date: date instanceof Timestamp ? date.toDate() : null,
    description: donnees.description ?? "",
    dateCreation: creation instanceof Timestamp ? creation.toDate() : null,
    annule: donnees.annule === true,
  };
}

export function ecouterArrivages(
  boutiqueId: string | null,
  auChangement: (arrivages: Arrivage[]) => void,
  enErreur: (cause: unknown) => void,
): () => void {
  const base = collection(db(), "arrivages");
  const requete = boutiqueId ? query(base, where("boutiqueId", "==", boutiqueId)) : query(base);

  return onSnapshot(
    requete,
    { includeMetadataChanges: true },
    (instantane) => {
      signalerSourceDonnees(instantane.metadata.fromCache);
      auChangement(
        instantane.docs
          .map(lireArrivage)
          .sort((a, b) => (b.dateCreation?.getTime() ?? 0) - (a.dateCreation?.getTime() ?? 0)),
      );
    },
    enErreur,
  );
}

/**
 * Enregistre un arrivage et les N motos de son lot, en une écriture.
 *
 * Chaque moto porte déjà la marque, le modèle et le prix de son groupe
 * (`preparerLot`) : un lot peut donc mêler plusieurs marques. `voitLesCouts`
 * reste le seul interrupteur du coût : à faux (gérant), `preparerLot` a déjà
 * vidé les prix, et aucun `prive/cout` n'est monté ici. Les motos reçues sont
 * supposées déjà validées.
 */
export function enregistrerArrivage(
  saisie: SaisieArrivage,
  motos: MotoDuLot[],
  boutiqueId: string,
  auteur: Auteur,
  voitLesCouts: boolean,
): { id: string; enregistre: Promise<void> } {
  const lot = writeBatch(db());
  const arrivageRef = doc(collection(db(), "arrivages"));

  lot.set(arrivageRef, {
    nom: saisie.nom.trim(),
    fournisseurId: saisie.fournisseurId,
    boutiqueId,
    date: saisie.date.trim() ? Timestamp.fromDate(new Date(`${saisie.date.trim()}T00:00:00`)) : null,
    description: saisie.description.trim(),
    ...traceCreation(auteur),
  });

  for (const moto of motos) {
    /* Le coût est propre à chaque groupe, et n'est monté que pour le
       responsable dont le prix a survécu à `preparerLot` (D2/S39). */
    const cout =
      voitLesCouts && moto.prixAchat.trim()
        ? construireCout({ prixAchat: moto.prixAchat, fraisEntree: [] })
        : null;

    ecrireMotoDansLot(
      lot,
      {
        boutiqueId,
        etat: "neuve",
        marqueId: moto.marqueId,
        modeleId: moto.modeleId,
        couleur: moto.couleur,
        annee: null,
        numeroChassis: moto.numeroChassis,
        numeroMoteur: "",
        prixVenteConseille: null,
        provenanceId: "",
        arrivageId: arrivageRef.id,
        papiersFournis: [],
      },
      cout,
      auteur,
    );
  }

  return { id: arrivageRef.id, enregistre: suivreEcriture(lot.commit()) };
}

/**
 * Corrige l'entête d'un arrivage (S43) : nom, fournisseur, date, description.
 *
 * Mise à jour partielle : les motos du lot ne bougent pas, seule l'entête change.
 * Déjà permis au responsable comme au gérant de la boutique du lot.
 */
export function modifierArrivage(
  id: string,
  saisie: SaisieArrivage,
  auteur: Auteur,
): { enregistre: Promise<void> } {
  return {
    enregistre: suivreEcriture(
      updateDoc(doc(db(), "arrivages", id), {
        nom: saisie.nom.trim(),
        fournisseurId: saisie.fournisseurId,
        date: saisie.date.trim()
          ? Timestamp.fromDate(new Date(`${saisie.date.trim()}T00:00:00`))
          : null,
        description: saisie.description.trim(),
        ...traceModification(auteur),
      }),
    ),
  };
}

/**
 * Annule (ou rétablit) un lot (S43) — l'annulation douce d'un lot qui porte des
 * motos, qu'on ne peut pas effacer. Réversible : on repasse `annule` à faux.
 */
export function annulerArrivage(
  id: string,
  annule: boolean,
  auteur: Auteur,
): { enregistre: Promise<void> } {
  return {
    enregistre: suivreEcriture(
      updateDoc(doc(db(), "arrivages", id), { annule, ...traceModification(auteur) }),
    ),
  };
}

/**
 * Efface un lot **vide** (S43). L'écran ne l'offre que pour un lot sans moto :
 * aucune cascade, rien à détacher. Une entête créée par erreur s'en va.
 */
export function supprimerArrivage(id: string): { enregistre: Promise<void> } {
  return { enregistre: suivreEcriture(deleteDoc(doc(db(), "arrivages", id))) };
}

export function messageErreurArrivage(cause: unknown): string {
  const code = (cause as { code?: string } | null)?.code ?? "";
  if (code === "permission-denied") return "Vous n’avez pas le droit d’enregistrer cet arrivage.";
  return "L’arrivage n’a pas pu être enregistré. Réessayez.";
}
