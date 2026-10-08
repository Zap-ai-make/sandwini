/**
 * Le bilan d'une période de vente (S50).
 *
 * Demandé ainsi : « inventaire filtrable par date, faisant ressortir : nombre
 * de motos vendues, montant, crédit dehors, encaissé sur tranches, et le
 * restant ». Le « restant » est le reste à encaisser sur les tranches — le
 * complément de ce qui est déjà rentré.
 *
 * **Ce n'est pas l'inventaire de S23**, qui confrontera un jour ce que le
 * système croit détenir à ce qu'on trouve sur l'étagère. Ici, rien n'est
 * pointé : on compte des ventes sur un intervalle.
 *
 * **Les quatre montants ne s'additionnent jamais**, et `AGENTS.md` appelle leur
 * confusion la plus coûteuse du projet. « Crédit dehors » : la moto est partie,
 * le client doit — une créance. « Encaissé sur tranches » : la moto dort au
 * magasin, qui détient l'argent du client — un dépôt. Les sommer produirait un
 * nombre qui ne désigne rien, et le type les garde séparés précisément pour
 * qu'aucun écran ne puisse les confondre par distraction.
 *
 * Tout est pur, et calculé à la lecture sur les ventes déjà écoutées (D61) :
 * ce qui se recalcule à l'ouverture ne peut pas diverger de ce dont il est
 * tiré, et continue de fonctionner hors ligne.
 */

import { dansLaPeriode, type BornesPeriode } from "./periode";
import type { Vente } from "./vente";

export type ChiffresDeLaPeriode = {
  motosVendues: number;
  /** Le chiffre d'affaires : ce qui a été **convenu**, pas ce qui est rentré. */
  montant: number;
  /** Une créance : la moto est partie, le client doit encore. */
  creditDehors: number;
  /** Un dépôt : la moto est au magasin, le magasin détient cet argent. */
  encaisseSurTranches: number;
  /** Ce qui manque encore sur ces mêmes tranches. */
  resteSurTranches: number;
  /** Aucun chiffre à montrer : l'écran écrit une phrase plutôt que des zéros. */
  vide: boolean;
};

/**
 * Les chiffres des ventes d'une période.
 *
 * `bornes` à `null` veut dire « tout » — c'est ce que rend `bornesPeriode`
 * pour la pastille « Tout », et une vente sans date passe toujours : saisie
 * hors ligne, elle n'a pas encore l'horodatage du serveur, et l'écarter la
 * ferait disparaître du bilan au moment même où on vérifie qu'elle est passée.
 */
export function chiffresDeLaPeriode(
  bornes: BornesPeriode,
  ventes: readonly Vente[],
): ChiffresDeLaPeriode {
  const retenues = ventes.filter((vente) => dansLaPeriode(vente.date, bornes));

  const montant = retenues.reduce((somme, vente) => somme + vente.prixConvenu, 0);

  const creditDehors = retenues
    .filter((vente) => vente.modePaiement === "credit")
    .reduce((somme, vente) => somme + vente.resteDu, 0);

  /* Une tranche dont la moto est partie n'est plus de l'argent détenu : la
     remise n'a lieu qu'au dernier franc, le cas est rare, mais compter cette
     vente parmi les dépôts dirait que le magasin garde une moto qu'il a rendue.
     Même décision que `chiffresDuMois`. */
  const tranchesDetenues = retenues.filter(
    (vente) => vente.modePaiement === "tranches" && !vente.motoRemise,
  );
  const encaisseSurTranches = tranchesDetenues.reduce(
    (somme, vente) => somme + vente.totalPaye,
    0,
  );
  const resteSurTranches = tranchesDetenues.reduce((somme, vente) => somme + vente.resteDu, 0);

  return {
    motosVendues: retenues.length,
    montant,
    creditDehors,
    encaisseSurTranches,
    resteSurTranches,
    vide: retenues.length === 0,
  };
}
