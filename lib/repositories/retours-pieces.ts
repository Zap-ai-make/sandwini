import {
  collection,
  doc,
  onSnapshot,
  query,
  Timestamp,
  where,
  writeBatch,
  type DocumentData,
  type QueryDocumentSnapshot,
} from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import type { LigneVentePiece, VentePiece } from "@/lib/domain/vente-piece";
import {
  lignesReprises,
  totalRembourse,
  type RetourPiece,
  type SaisieRetour,
} from "@/lib/domain/retour";
import { signalerSourceDonnees } from "@/lib/reseau/source-donnees";
import { suivreEcriture } from "@/lib/reseau/file-ecritures";
import { traceCreation, type Auteur } from "./referentiels";
import { versDate } from "./ventes";

/**
 * Le retour d'une vente de pièces, côté base (S67).
 *
 * **Tout part en un seul lot** : le retour, un mouvement `retour_vente` par
 * ligne reprise (stock qui remonte), et un encaissement `sortie` d'origine
 * `remboursement_piece` (argent qui ressort). Un stock qui remonte sans argent
 * rendu — ou l'inverse — serait un mensonge, et hors ligne le lot voyage comme
 * une écriture unique. La vente d'origine n'est jamais touchée : le retour la
 * cite, il ne la retouche pas (D58).
 */

function lireLigne(brut: DocumentData): LigneVentePiece {
  return {
    pieceId: (brut.pieceId as string) ?? "",
    reference: (brut.reference as string) ?? "",
    designation: (brut.designation as string) ?? "",
    quantite: typeof brut.quantite === "number" ? brut.quantite : 0,
    prixUnitaire: typeof brut.prixUnitaire === "number" ? brut.prixUnitaire : 0,
    prixAchatUnitaire: typeof brut.prixAchatUnitaire === "number" ? brut.prixAchatUnitaire : null,
    total: typeof brut.total === "number" ? brut.total : 0,
  };
}

function lireRetourPiece(instantane: QueryDocumentSnapshot<DocumentData>): RetourPiece {
  const donnees = instantane.data();
  return {
    id: instantane.id,
    venteId: (donnees.venteId as string) ?? "",
    venteNumero: (donnees.venteNumero as string) ?? "",
    boutiqueId: (donnees.boutiqueId as string) ?? "",
    date: versDate(donnees.date),
    lignes: Array.isArray(donnees.lignes) ? donnees.lignes.map(lireLigne) : [],
    total: typeof donnees.total === "number" ? donnees.total : 0,
    moyenPaiement: (donnees.moyenPaiement as RetourPiece["moyenPaiement"]) ?? "especes",
    motif: (donnees.motif as string) ?? "",
    operateur: (donnees.createdByName as string) ?? "",
  };
}

/** Les retours du périmètre — la supervision les retranche de la recette. */
export function ecouterRetoursPieces(
  boutiqueId: string | null,
  auChangement: (retours: RetourPiece[]) => void,
  enErreur: (cause: unknown) => void,
): () => void {
  const base = collection(db(), "retoursPieces");
  const requete = boutiqueId ? query(base, where("boutiqueId", "==", boutiqueId)) : query(base);

  return onSnapshot(
    requete,
    { includeMetadataChanges: true },
    (instantane) => {
      signalerSourceDonnees(instantane.metadata.fromCache);
      auChangement(instantane.docs.map(lireRetourPiece));
    },
    enErreur,
  );
}

/** Les retours faits sur une vente précise — affichés sur son reçu. */
export function ecouterRetoursDeVente(
  venteId: string,
  auChangement: (retours: RetourPiece[]) => void,
  enErreur: (cause: unknown) => void,
): () => void {
  const requete = query(collection(db(), "retoursPieces"), where("venteId", "==", venteId));
  return onSnapshot(
    requete,
    { includeMetadataChanges: true },
    (instantane) => {
      signalerSourceDonnees(instantane.metadata.fromCache);
      auChangement(instantane.docs.map(lireRetourPiece));
    },
    enErreur,
  );
}

/**
 * Enregistre le retour, ses entrées de stock et son remboursement — en un lot.
 *
 * L'identifiant existe tout de suite : hors ligne, la promesse ne se résout
 * qu'au retour du réseau, mais le gérant peut déjà imprimer le reçu de retour
 * (D76).
 */
export function enregistrerRetour(
  saisie: SaisieRetour,
  vente: VentePiece,
  boutiqueId: string,
  auteur: Auteur,
): { id: string; enregistre: Promise<void> } {
  const reference = doc(collection(db(), "retoursPieces"));
  const lignes = lignesReprises(saisie, vente);
  const total = totalRembourse(saisie, vente);
  const maintenant = Timestamp.fromDate(new Date());
  const lot = writeBatch(db());

  lot.set(reference, {
    venteId: vente.id,
    venteNumero: vente.numero,
    boutiqueId,
    date: maintenant,
    lignes,
    total,
    moyenPaiement: saisie.moyenPaiement,
    motif: saisie.motif.trim(),
    ...traceCreation(auteur),
  });

  /* Une pièce qui revient, par ligne, portant le numéro de la vente dans sa
     note — on remonte du stock au retour sans jointure. */
  for (const ligne of lignes) {
    lot.set(doc(collection(db(), "mouvementsPieces")), {
      boutiqueId,
      pieceId: ligne.pieceId,
      type: "retour_vente",
      quantite: ligne.quantite,
      note: `Retour ${vente.numero}`,
      date: maintenant,
      ...traceCreation(auteur),
    });
  }

  lot.set(doc(collection(db(), "encaissements")), {
    boutiqueId,
    date: maintenant,
    sens: "sortie",
    montant: total,
    moyenPaiement: saisie.moyenPaiement,
    origine: "remboursement_piece",
    origineRefId: reference.id,
    libelle: `Remboursement ${vente.numero}`,
    categorieTranches: false,
    ...traceCreation(auteur),
  });

  return { id: reference.id, enregistre: suivreEcriture(lot.commit()) };
}
