/**
 * Lecture des champs de saisie libres, une valeur par ligne.
 *
 * Trois listes du produit se saisissent ainsi — les papiers fournis avec une
 * moto d'occasion (S5), ce qui est inclus dans une vente et ce qui ne l'est pas
 * (S8) — parce qu'aucune ne mérite un référentiel : « casque », « bidon
 * d'huile » ou « rétroviseur gauche cassé » ne se choisissent pas dans une
 * liste, ils se notent.
 *
 * Le module existe pour que ces trois lectures soient la même. La borne haute
 * n'est pas décorative : les règles Firestore la vérifient aussi, et un
 * copier-coller de deux cents lignes dans un textarea ne doit pas produire un
 * document que le serveur refusera après coup.
 */

export const LIGNES_MAX = 20;
export const LONGUEUR_LIGNE_MAX = 120;

export function lireLignes(brut: string, maximum: number = LIGNES_MAX): string[] {
  return brut
    .split("\n")
    .map((ligne) => ligne.trim())
    .filter(Boolean)
    .slice(0, maximum);
}

export function ecrireLignes(lignes: readonly string[]): string {
  return lignes.join("\n");
}

/** La ligne trop longue, s'il y en a une — pour la nommer plutôt que tronquer en silence. */
export function ligneTropLongue(
  lignes: readonly string[],
  maximum: number = LONGUEUR_LIGNE_MAX,
): string | undefined {
  return lignes.find((ligne) => ligne.length > maximum);
}
