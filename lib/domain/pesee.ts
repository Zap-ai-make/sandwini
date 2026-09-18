import { moisDe, memeMois } from "./chiffres";
import type { Moto } from "./moto";
import { etatStock, stockParPiece, type MouvementPiece, type Piece } from "./piece";
import type { Vente } from "./vente";
import type { VentePiece } from "./vente-piece";

/**
 * Ce que chaque boutique pèse, pour sa carte de supervision (S24, A2.3, S47).
 *
 * **Trois faits par métier, et pas un agrégat de plus.** La maquette les donne
 * pour les motos (`a2:93-97`) : en stock, ventes du mois, reste dû. Une
 * boutique de pièces n'a aucun des trois — pas de moto, pas de vente de moto,
 * et pas de crédit puisqu'une pièce se paie au comptoir (S21). Elle affichait
 * donc `0 / 0 / —`, ce qui n'est pas un chiffre bas mais une question mal
 * posée : trois compteurs à zéro se lisent comme un commerce à l'arrêt (D63),
 * et c'est la faute que D82 nomme — ranger « sans objet » avec « il n'y en a
 * plus ».
 *
 * D'où deux pesées distinctes. Chaque carte montre celles de ses métiers ; une
 * boutique qui tiendrait les deux les montre toutes les deux, parce que le
 * modèle porte un tableau de métiers et non une valeur (D62), et que cette
 * règle-là n'a pas de cas particulier.
 *
 * **Tout est lu, rien n'est stocké** (D61) : la fonction est pure, elle somme
 * des documents que l'écran écoute déjà, et elle continue de répondre réseau
 * coupé.
 */
export type PeseeMotos = {
  enStock: number;
  ventesDuMois: number;
  /** Le total à ce jour, pas celui des ventes du mois — voir `peserBoutiques`. */
  resteDu: number;
};

export type PeseePieces = {
  /**
   * Le nombre de **références** encore vendables, pas la somme des quantités.
   *
   * Additionner 200 vis et 3 moteurs donne un nombre que personne ne peut
   * interpréter ; compter ce qu'on peut sortir du rayon répond à la question
   * que la carte pose.
   */
  references: number;
  ventesDuMois: number;
  recetteDuMois: number;
  /** Références épuisées, sous leur seuil, ou en anomalie : ce qui demande une décision. */
  aReapprovisionner: number;
};

export type PeseeBoutique = {
  motos: PeseeMotos;
  pieces: PeseePieces;
};

/** Ce qu'on montre à une boutique dont on ne sait encore rien de chiffré. */
export const PESEE_VIDE: PeseeBoutique = {
  motos: { enStock: 0, ventesDuMois: 0, resteDu: 0 },
  pieces: { references: 0, ventesDuMois: 0, recetteDuMois: 0, aReapprovisionner: 0 },
};

/** Additionne deux pesées — la carte « Toutes les boutiques » est leur somme. */
export function additionnerPesees(a: PeseeBoutique, b: PeseeBoutique): PeseeBoutique {
  return {
    motos: {
      enStock: a.motos.enStock + b.motos.enStock,
      ventesDuMois: a.motos.ventesDuMois + b.motos.ventesDuMois,
      resteDu: a.motos.resteDu + b.motos.resteDu,
    },
    pieces: {
      references: a.pieces.references + b.pieces.references,
      ventesDuMois: a.pieces.ventesDuMois + b.pieces.ventesDuMois,
      recetteDuMois: a.pieces.recetteDuMois + b.pieces.recetteDuMois,
      aReapprovisionner: a.pieces.aReapprovisionner + b.pieces.aReapprovisionner,
    },
  };
}

export type SourcesPesee = {
  /** `null` tant que la lecture n'est pas revenue : la part n'est alors pas comptée. */
  ventes: readonly Vente[] | null;
  stock: readonly Moto[] | null;
  ventesPieces: readonly VentePiece[] | null;
  catalogue: readonly Piece[] | null;
  mouvements: readonly MouvementPiece[] | null;
};

/**
 * La pesée de chaque boutique, par identifiant.
 *
 * **« Reste dû » est le total à ce jour, pas celui des ventes du mois.** Une
 * carte sert à choisir où aller : ce qui compte est ce qui attend là-bas, pas
 * ce que le mois a produit. L'écran des chiffres raisonne par mois parce qu'il
 * répond à une autre question.
 */
export function peserBoutiques(sources: SourcesPesee, maintenant: Date): Map<string, PeseeBoutique> {
  const pesee = new Map<string, PeseeBoutique>();
  const mois = moisDe(maintenant);

  const pour = (id: string): PeseeBoutique => {
    let actuel = pesee.get(id);
    if (!actuel) {
      actuel = { motos: { ...PESEE_VIDE.motos }, pieces: { ...PESEE_VIDE.pieces } };
      pesee.set(id, actuel);
    }
    return actuel;
  };

  for (const moto of sources.stock ?? []) {
    /* « En stock » compte ce qui peut encore se vendre : une moto réservée ou
       vendue n'est plus du stock, et la gonfler ferait promettre au responsable
       une disponibilité qui n'existe pas. */
    if (moto.statut !== "en_stock") continue;
    pour(moto.boutiqueId).motos.enStock += 1;
  }

  for (const vente of sources.ventes ?? []) {
    const ligne = pour(vente.boutiqueId).motos;
    if (vente.date !== null && memeMois(moisDe(vente.date), mois)) ligne.ventesDuMois += 1;
    ligne.resteDu += vente.resteDu;
  }

  for (const vente of sources.ventesPieces ?? []) {
    if (vente.date === null || !memeMois(moisDe(vente.date), mois)) continue;
    const ligne = pour(vente.boutiqueId).pieces;
    /* Pas de « reste dû » symétrique : une vente de pièces est encaissée en
       entier au comptoir (S21). Ce qui la mesure est ce qu'elle a rapporté. */
    ligne.ventesDuMois += 1;
    ligne.recetteDuMois += vente.total;
  }

  compterLesRayons(sources, pour);
  return pesee;
}

/**
 * Le stock des pièces, par boutique.
 *
 * La quantité d'une pièce est la somme de ses mouvements (D61, D94), et elle
 * est **propre à chaque boutique** : le catalogue, lui, est commun. On regroupe
 * donc par boutique puis par référence, sans quoi une rupture à Ouaga serait
 * masquée par du stock à Bobo.
 */
function compterLesRayons(
  sources: SourcesPesee,
  pour: (id: string) => PeseeBoutique,
): void {
  const { catalogue, mouvements } = sources;
  if (catalogue === null || mouvements === null) return;

  const seuils = new Map(
    catalogue.filter((piece) => piece.actif).map((piece) => [piece.id, piece.seuilAlerte]),
  );

  const parBoutique = new Map<string, MouvementPiece[]>();
  for (const mouvement of mouvements) {
    /* Une pièce retirée du catalogue ne compte plus : ses mouvements restent en
       base — c'est l'histoire — mais elle n'est plus vendable, et la
       réapprovisionner n'aurait aucun sens. */
    if (!seuils.has(mouvement.pieceId)) continue;
    const liste = parBoutique.get(mouvement.boutiqueId);
    if (liste) liste.push(mouvement);
    else parBoutique.set(mouvement.boutiqueId, [mouvement]);
  }

  for (const [boutiqueId, lot] of parBoutique) {
    const ligne = pour(boutiqueId).pieces;
    for (const [pieceId, quantite] of stockParPiece(lot)) {
      const etat = etatStock(quantite, seuils.get(pieceId) ?? 0);
      /* Une pièce sous son seuil reste vendable : elle compte dans les
         références **et** dans ce qu'il faut recommander. Les deux chiffres ne
         se partagent pas le catalogue, ils répondent à deux questions. */
      if (etat === "en_stock" || etat === "bas") ligne.references += 1;
      /* « Il manque une entrée » est une alerte aussi : une quantité négative
         est un aveu de saisie, pas un rayon garni (D82). */
      if (etat !== "en_stock") ligne.aReapprovisionner += 1;
    }
  }
}
