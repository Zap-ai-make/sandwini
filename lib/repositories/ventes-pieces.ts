"use client";

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
import { signalerSourceDonnees } from "@/lib/reseau/source-donnees";
import type { Piece } from "@/lib/domain/piece";
import {
  figerLignes,
  libelleEncaissement,
  totalPanier,
  type LigneVentePiece,
  type SaisiePanier,
  type VentePiece,
} from "@/lib/domain/vente-piece";
import { reserverNumero, type Numeroteur } from "@/lib/numerotation/compteur";
import { suivreEcriture } from "@/lib/reseau/file-ecritures";
import { traceCreation, type Auteur } from "./referentiels";
import { versDate } from "./ventes";

/**
 * La vente de pièces, côté base (S21).
 *
 * **Tout part en un seul lot**, et c'est l'arbitrage central de ce module : la
 * vente, un mouvement `sortie_vente` par ligne, et l'encaissement. Un stock qui
 * descend sans recette enregistrée — ou l'inverse — est un mensonge, et hors
 * ligne le lot voyage dans la file comme une écriture unique. Aucune règle
 * Firestore ne peut exiger ce lien : une règle ne voit qu'un document à la
 * fois. C'est donc le lot qui le tient — **seul**, tant que le test bout en
 * bout qui le prouverait n'est pas écrit : c'est le critère resté ouvert de
 * `specs/S21-vente-pieces.md`. Qui touche à cette fonction n'a donc aucun filet
 * sous lui, et doit le savoir.
 */

function lireLigne(brut: DocumentData): LigneVentePiece {
  return {
    pieceId: (brut.pieceId as string) ?? "",
    reference: (brut.reference as string) ?? "",
    designation: (brut.designation as string) ?? "",
    quantite: typeof brut.quantite === "number" ? brut.quantite : 0,
    prixUnitaire: typeof brut.prixUnitaire === "number" ? brut.prixUnitaire : 0,
    total: typeof brut.total === "number" ? brut.total : 0,
  };
}

function lireVentePiece(instantane: QueryDocumentSnapshot<DocumentData>): VentePiece {
  const donnees = instantane.data();
  return {
    id: instantane.id,
    numero: (donnees.numero as string) ?? "",
    boutiqueId: (donnees.boutiqueId as string) ?? "",
    date: versDate(donnees.date),
    clientId: (donnees.clientId as string) ?? "",
    lignes: Array.isArray(donnees.lignes) ? donnees.lignes.map(lireLigne) : [],
    total: typeof donnees.total === "number" ? donnees.total : 0,
    moyenPaiement: (donnees.moyenPaiement as VentePiece["moyenPaiement"]) ?? "especes",
  };
}

/**
 * Les ventes de pièces du périmètre, en direct.
 *
 * Aucun tri demandé au serveur, comme partout ailleurs : un tri combiné à un
 * filtre exigerait un index composite, et trier en mémoire marche aussi hors
 * ligne — ce qu'une requête ne fait pas.
 */
export function ecouterVentesPieces(
  boutiqueId: string | null,
  auChangement: (ventes: VentePiece[]) => void,
  enErreur: (cause: unknown) => void,
): () => void {
  const base = collection(db(), "ventesPieces");
  const requete = boutiqueId ? query(base, where("boutiqueId", "==", boutiqueId)) : query(base);

  return onSnapshot(
    requete,
    /* `includeMetadataChanges` sert l'indicateur « données du cache » : sans
       `signalerSourceDonnees`, on paierait les réveils supplémentaires sans
       que personne n'en lise le résultat — comme les neuf autres écoutes du
       dossier, celle-ci répond donc à l'indicateur. */
    { includeMetadataChanges: true },
    (instantane) => {
      signalerSourceDonnees(instantane.metadata.fromCache);
      auChangement(instantane.docs.map(lireVentePiece));
    },
    enErreur,
  );
}

export type ContexteVentePiece = {
  boutique: Numeroteur;
  /**
   * Les numéros déjà connus de cet appareil, **des deux collections**.
   *
   * Q1, tranchée par le commanditaire : un reçu de pièces et un reçu de moto ne
   * portent jamais le même numéro. Le compteur est donc partagé, et l'appelant
   * doit lui donner l'union — sinon la première vente de pièces du mois
   * reprendrait le numéro d'une vente de moto, et deux pièces comptables
   * différentes répondraient au même numéro dicté au téléphone.
   */
  numerosConnus: string[];
  /** Recopié dans le libellé de l'encaissement, s'il y a un client (S35). */
  nomClient: string;
};

/**
 * Enregistre la vente, ses sorties de stock et sa recette — en un seul lot.
 *
 * Le numéro et l'identifiant existent **tout de suite** : hors ligne, la
 * promesse ne se résout qu'au retour du réseau, mais le gérant peut déjà
 * annoncer le numéro et imprimer le reçu (D76).
 */
export function enregistrerVentePiece(
  panier: SaisiePanier,
  pieces: ReadonlyMap<string, Piece>,
  contexte: ContexteVentePiece,
  auteur: Auteur,
): { id: string; numero: string; enregistre: Promise<void> } {
  const boutiqueId = contexte.boutique.boutiqueId;
  const reference = doc(collection(db(), "ventesPieces"));
  const numero = reserverNumero(contexte.boutique, contexte.numerosConnus);

  const lignes = figerLignes(panier, pieces);
  const total = totalPanier(panier.lignes);
  const maintenant = Timestamp.fromDate(new Date());
  const lot = writeBatch(db());

  lot.set(reference, {
    numero,
    numeroInitial: numero,
    boutiqueId,
    date: maintenant,
    clientId: panier.clientId,
    lignes,
    total,
    moyenPaiement: panier.moyenPaiement,
    ...traceCreation(auteur),
  });

  /* Un mouvement par ligne, portant le numéro de la vente dans sa note : c'est
     ce qui permet de remonter du stock à la pièce comptable sans jointure, et
     de relire un mouvement six mois plus tard sans avoir à chercher pourquoi il
     existe. */
  for (const ligne of lignes) {
    lot.set(doc(collection(db(), "mouvementsPieces")), {
      boutiqueId,
      pieceId: ligne.pieceId,
      type: "sortie_vente",
      quantite: ligne.quantite,
      note: `Vente ${numero}`,
      date: maintenant,
      ...traceCreation(auteur),
    });
  }

  lot.set(doc(collection(db(), "encaissements")), {
    boutiqueId,
    date: maintenant,
    sens: "entree",
    montant: total,
    moyenPaiement: panier.moyenPaiement,
    origine: "vente_piece",
    origineRefId: reference.id,
    libelle: libelleEncaissement(numero, contexte.nomClient),
    /* Une vente de pièces est payée comptant et repart avec le client : ce
       n'est jamais un engagement de tranches, qui ne concerne que les motos
       retenues au magasin (§6.2). */
    categorieTranches: false,
    ...traceCreation(auteur),
  });

  return { id: reference.id, numero, enregistre: suivreEcriture(lot.commit()) };
}

/** Traduit les refus de Firestore en phrases qui disent quoi faire. */
export function messageErreurVentePiece(cause: unknown): string {
  const code = (cause as { code?: string }).code ?? "";
  if (code.includes("permission-denied")) {
    return "Vos droits ne permettent pas d’enregistrer cette vente dans cette boutique.";
  }
  if (code.includes("unauthenticated")) return "Votre session a expiré. Reconnectez-vous.";
  return "La vente n’a pas pu être enregistrée.";
}
