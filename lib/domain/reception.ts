/**
 * La réception d'un arrivage de pièces (S66).
 *
 * **Faire entrer tout un carton en une passe**, au lieu d'ouvrir le panneau
 * d'une pièce, saisir, fermer, rouvrir la suivante — douze allers-retours pour
 * douze références. On compose une liste, et tout part en un seul lot.
 *
 * **Où va le prix d'achat.** Il ne vit pas sur le mouvement : les règles le
 * refusent (`mouvementPieceValide` borne ses clés), et le commanditaire a
 * tranché que le coût vit sur la pièce, visible du gérant (`3c8b2fe`). Une
 * ligne de réception peut donc porter un **nouveau** prix d'achat ; s'il diffère
 * de celui du catalogue, il le met à jour — pour les ventes à venir, les
 * passées gardant le leur par recopie (`prixAchatUnitaire`). Laissé vide, le
 * coût ne bouge pas.
 *
 * Ce module ne contient que du calcul : ni Firestore, ni React, ni horloge.
 */

import { lireEntier, MONTANT_MAX, QUANTITE_MAX, type Piece } from "./piece";

/**
 * Un arrivage peut être gros — plus large que le panier d'une vente (20).
 * Au-delà, ce n'est plus une saisie au comptoir mais un import, qui est une
 * autre histoire.
 */
export const LIGNES_RECEPTION_MAX = 40;

export type LigneReception = {
  pieceId: string;
  /** En texte, comme toutes les saisies : la validation la convertit. */
  quantite: string;
  /** Vide = ne pas toucher au prix d'achat du catalogue. */
  prixAchat: string;
};

export type SaisieReception = {
  lignes: LigneReception[];
  /** Portée sur chaque mouvement d'entrée — « Arrivage du 27/10 », un numéro de bon. */
  note: string;
};

export const RECEPTION_VIDE: SaisieReception = { lignes: [], note: "" };

export function dejaDansReception(saisie: SaisieReception, pieceId: string): boolean {
  return saisie.lignes.some((ligne) => ligne.pieceId === pieceId);
}

/**
 * Ajoute une pièce à l'arrivage, quantité 1 par défaut, et **le prix d'achat
 * connu pré-rempli** : le plus souvent un carton arrive au même prix, et
 * re-saisir ce qu'on sait déjà invite à l'erreur. Déjà présente ou liste pleine,
 * la saisie ne bouge pas.
 */
export function ajouterAReception(saisie: SaisieReception, piece: Piece): SaisieReception {
  if (dejaDansReception(saisie, piece.id) || saisie.lignes.length >= LIGNES_RECEPTION_MAX) {
    return saisie;
  }
  return {
    ...saisie,
    lignes: [
      ...saisie.lignes,
      {
        pieceId: piece.id,
        quantite: "1",
        prixAchat: piece.prixAchat === null ? "" : String(piece.prixAchat),
      },
    ],
  };
}

export function retirerDeReception(saisie: SaisieReception, pieceId: string): SaisieReception {
  return { ...saisie, lignes: saisie.lignes.filter((ligne) => ligne.pieceId !== pieceId) };
}

export function changerLigneReception(
  saisie: SaisieReception,
  pieceId: string,
  partie: Partial<Omit<LigneReception, "pieceId">>,
): SaisieReception {
  return {
    ...saisie,
    lignes: saisie.lignes.map((ligne) =>
      ligne.pieceId === pieceId ? { ...ligne, ...partie } : ligne,
    ),
  };
}

/**
 * Ce qui empêche d'enregistrer l'arrivage, ou `null` si tout va bien.
 *
 * Chaque refus porte une phrase : au comptoir, « ça ne marche pas » sans la
 * raison envoie chercher une panne qui n'existe pas.
 */
export function validerReception(
  saisie: SaisieReception,
  pieces: ReadonlyMap<string, Piece>,
): string | null {
  if (saisie.lignes.length === 0) {
    return "Ajoutez au moins une pièce à faire entrer.";
  }

  for (const ligne of saisie.lignes) {
    const piece = pieces.get(ligne.pieceId);
    if (!piece) {
      return "Une des pièces de l’arrivage est introuvable. Retirez-la et réessayez.";
    }

    const quantite = lireEntier(ligne.quantite);
    if (quantite === null || quantite <= 0) {
      return `La quantité reçue pour ${piece.reference} s’écrit en chiffres, et doit être supérieure à zéro.`;
    }
    if (quantite > QUANTITE_MAX) {
      return `La quantité reçue pour ${piece.reference} dépasse le maximum admis.`;
    }

    /* Le prix d'achat est facultatif : on reçoit parfois un carton dont la
       facture suit. Vide, il ne touchera pas au coût du catalogue. */
    if (ligne.prixAchat.trim()) {
      const prix = lireEntier(ligne.prixAchat);
      if (prix === null || prix < 0) {
        return `Le prix d’achat de ${piece.reference} s’écrit en chiffres entiers.`;
      }
      if (prix > MONTANT_MAX) {
        return `Le prix d’achat de ${piece.reference} dépasse le maximum admis.`;
      }
    }
  }

  return null;
}

/** Le nombre total d'unités reçues, pour l'annoncer avant de valider. */
export function totalUnitesRecues(saisie: SaisieReception): number {
  return saisie.lignes.reduce((somme, ligne) => somme + (lireEntier(ligne.quantite) ?? 0), 0);
}
