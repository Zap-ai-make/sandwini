import { estEnRetard, joursEcoules } from "../domain/dossier";
import { etatStock } from "../domain/piece";

/**
 * Le résumé du commerce, en une seule consultation.
 *
 * **Le défaut qu'on répare ici, et il venait de nous.** À « fais-moi un
 * inventaire », l'assistant ouvrait l'écran au lieu de répondre. Ce n'était pas
 * un caprice : pour répondre, il lui fallait quatre consultations séparées — le
 * stock, les ventes, la caisse, les pièces — alors qu'ouvrir un écran est un
 * seul geste. Entre les deux, il a pris le moins cher. On lui donne donc le bon
 * chemin le plus court, plutôt que de lui interdire le mauvais.
 *
 * **Pur, et testé.** Les chiffres qui sortent d'ici sont lus à voix haute à
 * quelqu'un qui va décider dessus. La distinction entre une créance et un dépôt
 * en tranches, surtout, ne peut pas vivre dans un bout de code non vérifié :
 * les additionner produit un nombre qui ne désigne rien (`prompt.md` §13).
 *
 * **Pas de coûts ni de marges.** Le mur de D2 tient ici comme ailleurs : ce
 * résumé est le même pour un gérant et pour le responsable, et il ne cite que
 * ce que les deux ont le droit de lire. Deux versions auraient fini par
 * diverger.
 */

/**
 * Au-delà de quoi une moto « dort ».
 *
 * Quatre mois : c'est le délai au bout duquel une moto en stock cesse d'être un
 * stock et devient de l'argent immobilisé. Le chiffre est un repère, pas une
 * règle comptable — mais un repère écrit vaut mieux qu'une appréciation qui
 * change selon qui regarde.
 */
export const JOURS_QUI_DORMENT = 120;

export type MotoDuResume = { statut: string; dateEntree: Date | null };
export type VenteDuResume = {
  id: string;
  date: Date | null;
  prixConvenu: number;
  modePaiement: string;
};
export type VersementDuResume = { venteId: string; montant: number };
export type MouvementDeCaisse = { date: Date | null; sens: string; montant: number };
export type CarteDuResume = { statut: string; disponibleLe: Date | null };
export type PieceDuResume = { quantite: number; seuilAlerte: number };

export type Resume = {
  motosEnStock: number;
  /** En stock depuis plus de `JOURS_QUI_DORMENT` jours. */
  motosQuiDorment: number;
  ventesDuMois: { combien: number; montant: number };
  /**
   * Les **créances** : la moto est partie, le client doit de l'argent.
   *
   * Jamais mélangées aux tranches. Ici le magasin attend de l'argent et porte
   * un risque ; là il en détient et n'en porte aucun.
   */
  creances: { combien: number; montant: number };
  /** Les **tranches** : la moto est au magasin, l'argent déjà versé y est aussi. */
  tranches: { combien: number; dejaVerse: number; resteAVerser: number };
  caisseDuMois: { entrees: number; sorties: number };
  cartesGrisesDehors: { combien: number; enRetard: number };
  /** Références épuisées ou sous leur seuil d'alerte. */
  piecesAReapprovisionner: number;
  /**
   * Ce qui rend un chiffre incertain, en toutes lettres.
   *
   * Un total calculé sur une lecture coupée a l'air juste et ne l'est pas. La
   * réserve voyage donc avec le chiffre, au lieu d'être laissée à la mémoire de
   * celui qui le répète.
   */
  avertissements: string[];
};

/** Le premier jour du mois en cours, à minuit. */
function debutDuMois(aujourdhui: Date): Date {
  return new Date(aujourdhui.getFullYear(), aujourdhui.getMonth(), 1);
}

export function resumerLeCommerce(
  entrees: {
    motos: readonly MotoDuResume[];
    ventes: readonly VenteDuResume[];
    versements: readonly VersementDuResume[];
    caisse: readonly MouvementDeCaisse[];
    cartesGrises: readonly CarteDuResume[];
    pieces: readonly PieceDuResume[];
    avertissements?: readonly string[];
  },
  aujourdhui: Date,
): Resume {
  const debut = debutDuMois(aujourdhui);

  const enStock = entrees.motos.filter((moto) => moto.statut === "en_stock");
  const motosQuiDorment = enStock.filter((moto) => {
    const jours = joursEcoules(moto.dateEntree, aujourdhui);
    return jours !== null && jours >= JOURS_QUI_DORMENT;
  }).length;

  const verse = new Map<string, number>();
  for (const versement of entrees.versements) {
    verse.set(versement.venteId, (verse.get(versement.venteId) ?? 0) + versement.montant);
  }

  const duMois = entrees.ventes.filter((vente) => vente.date !== null && vente.date >= debut);

  const creances = { combien: 0, montant: 0 };
  const tranches = { combien: 0, dejaVerse: 0, resteAVerser: 0 };
  for (const vente of entrees.ventes) {
    const paye = verse.get(vente.id) ?? 0;
    /* Jamais négatif : un trop-perçu est une anomalie de saisie, et l'afficher
       comme une dette à rebours embrouillerait plus qu'un zéro. */
    const reste = Math.max(0, vente.prixConvenu - paye);
    if (reste === 0) continue;

    if (vente.modePaiement === "credit") {
      creances.combien += 1;
      creances.montant += reste;
    } else if (vente.modePaiement === "tranches") {
      tranches.combien += 1;
      tranches.dejaVerse += paye;
      tranches.resteAVerser += reste;
    }
    /* Une vente au comptant dont il resterait quelque chose à percevoir est une
       saisie en cours, pas une créance : on ne l'annonce ni d'un côté ni de
       l'autre plutôt que de la ranger au hasard. */
  }

  const totalCaisse = (sens: string) =>
    entrees.caisse
      .filter((mouvement) => mouvement.sens === sens)
      .filter((mouvement) => mouvement.date !== null && mouvement.date >= debut)
      .reduce((somme, mouvement) => somme + mouvement.montant, 0);

  const dehors = entrees.cartesGrises.filter((carte) => carte.statut === "chez_prestataire");

  return {
    motosEnStock: enStock.length,
    motosQuiDorment,
    ventesDuMois: {
      combien: duMois.length,
      montant: duMois.reduce((somme, vente) => somme + vente.prixConvenu, 0),
    },
    creances,
    tranches,
    caisseDuMois: { entrees: totalCaisse("entree"), sorties: totalCaisse("sortie") },
    cartesGrisesDehors: {
      combien: dehors.length,
      enRetard: dehors.filter((carte) => estEnRetard(carte.disponibleLe, aujourdhui)).length,
    },
    piecesAReapprovisionner: entrees.pieces.filter((piece) => {
      const etat = etatStock(piece.quantite, piece.seuilAlerte);
      return etat === "bas" || etat === "epuise";
    }).length,
    avertissements: [...(entrees.avertissements ?? [])],
  };
}
