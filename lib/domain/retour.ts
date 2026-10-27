/**
 * Le retour d'une vente de pièces (S67).
 *
 * **Une contre-passation, jamais une retouche.** La vente d'origine est
 * immuable ; un retour cite cette vente et reprend ses prix figés, par ligne.
 * Le client ne peut se faire reprendre que ce qu'il a acheté, et au prix où il
 * l'a acheté — le tarif du jour ne doit pas rembourser une pièce vendue moins
 * cher.
 *
 * Ce module ne contient que du calcul : ni Firestore, ni React, ni horloge.
 */

import { lireEntier } from "./piece";
import { type MoyenPaiement } from "./vente";
import { margeLigne, type LigneVentePiece, type VentePiece } from "./vente-piece";

export const LONGUEUR_MOTIF_MAX = 120;

/**
 * Un retour enregistré, côté base. Ses `lignes` ont la forme de lignes de
 * vente — c'est ce qui laisse le reçu de retour les rendre comme une facture,
 * et la supervision retrancher leur marge avec `margeVentePiece`.
 */
export type RetourPiece = {
  id: string;
  venteId: string;
  venteNumero: string;
  boutiqueId: string;
  date: Date | null;
  lignes: LigneVentePiece[];
  total: number;
  moyenPaiement: MoyenPaiement;
  motif: string;
  /** Qui a établi le retour, pour le pied du reçu. */
  operateur: string;
};

/** Ce que le gérant choisit de reprendre, ligne par ligne de la vente. */
export type LigneRetour = { pieceId: string; quantite: string };

export type SaisieRetour = {
  lignes: LigneRetour[];
  /** Par quoi on rembourse — pré-rempli du moyen de la vente, modifiable. */
  moyenPaiement: MoyenPaiement;
  /** Facultatif : « défaut », « erreur de référence »… */
  motif: string;
};

/**
 * Prépare un retour depuis une vente : une ligne par ligne vendue, **rien de
 * coché** (quantité 0). Le gérant pose ce qui revient ; cocher tout d'avance
 * inviterait au remboursement accidentel du panier entier.
 */
export function retourDepuisVente(vente: VentePiece): SaisieRetour {
  return {
    lignes: vente.lignes.map((ligne) => ({ pieceId: ligne.pieceId, quantite: "0" })),
    moyenPaiement: vente.moyenPaiement,
    motif: "",
  };
}

export function changerLigneRetour(
  saisie: SaisieRetour,
  pieceId: string,
  quantite: string,
): SaisieRetour {
  return {
    ...saisie,
    lignes: saisie.lignes.map((ligne) =>
      ligne.pieceId === pieceId ? { ...ligne, quantite } : ligne,
    ),
  };
}

function ligneVenteDe(vente: VentePiece, pieceId: string): LigneVentePiece | undefined {
  return vente.lignes.find((ligne) => ligne.pieceId === pieceId);
}

/**
 * Les lignes réellement reprises, au prix de la vente, quantité plafonnée à ce
 * qui a été vendu. Chaque ligne a la forme d'une ligne de vente : le reçu de
 * retour la rend comme la facture rend une vente.
 */
export function lignesReprises(saisie: SaisieRetour, vente: VentePiece): LigneVentePiece[] {
  const reprises: LigneVentePiece[] = [];
  for (const selection of saisie.lignes) {
    const demande = lireEntier(selection.quantite) ?? 0;
    if (demande <= 0) continue;
    const origine = ligneVenteDe(vente, selection.pieceId);
    if (!origine) continue;
    const quantite = Math.min(demande, origine.quantite);
    reprises.push({ ...origine, quantite, total: quantite * origine.prixUnitaire });
  }
  return reprises;
}

export function totalRembourse(saisie: SaisieRetour, vente: VentePiece): number {
  return lignesReprises(saisie, vente).reduce((somme, ligne) => somme + ligne.total, 0);
}

/**
 * La marge reprise — ce que la supervision doit **retrancher** de la marge du
 * mois (S67, arbitrage 6). `null` quand une pièce reprise n'avait pas de coût
 * connu, ou quand rien n'est repris : une marge inconnue ne se soustrait pas,
 * et zéro affirmerait qu'on reprend une marge nulle.
 */
export function margeReprise(saisie: SaisieRetour, vente: VentePiece): number | null {
  const reprises = lignesReprises(saisie, vente);
  if (reprises.length === 0) return null;
  let somme = 0;
  for (const ligne of reprises) {
    const marge = margeLigne(ligne);
    if (marge === null) return null;
    somme += marge;
  }
  return somme;
}

/**
 * Ce qui empêche d'enregistrer le retour, ou `null`. Chaque refus nomme la
 * pièce : au comptoir, « ça ne marche pas » sans la raison envoie chercher une
 * panne qui n'existe pas.
 */
export function validerRetour(saisie: SaisieRetour, vente: VentePiece): string | null {
  for (const selection of saisie.lignes) {
    const texte = selection.quantite.trim();
    if (!texte || texte === "0") continue;
    const origine = ligneVenteDe(vente, selection.pieceId);
    const nom = origine?.reference ?? "cette pièce";
    const demande = lireEntier(selection.quantite);
    if (demande === null || demande < 0) {
      return `La quantité reprise pour ${nom} s’écrit en chiffres.`;
    }
    if (origine && demande > origine.quantite) {
      return `On ne peut pas reprendre plus de ${origine.quantite} ${nom} : c’est ce qui a été vendu.`;
    }
  }

  if (lignesReprises(saisie, vente).length === 0) {
    return "Choisissez au moins une pièce à reprendre.";
  }
  return null;
}
