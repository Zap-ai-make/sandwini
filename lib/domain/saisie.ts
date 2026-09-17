/**
 * Lecture des champs de saisie libres, une valeur par ligne.
 *
 * Une liste du produit se saisit ainsi — les papiers fournis avec une moto
 * d'occasion (S5) — parce qu'elle ne mérite pas de référentiel : « carte grise
 * barrée » ou « facture du premier propriétaire » ne se choisissent pas dans
 * une liste, ils se notent.
 *
 * **Elles étaient trois jusqu'à S44.** Ce qui est inclus dans une vente et ce
 * qui ne l'est pas (S8) se saisissaient ici aussi, et c'est précisément ce que
 * la refonte a retiré : au comptoir, les deux textes libres se remplissaient
 * toujours des deux mêmes mots, et deux cases à cocher les disent mieux — elles
 * se relisent, elles se comptent, et elles ne s'orthographient pas de trois
 * façons. Le module reste parce que les papiers d'occasion, eux, ne se
 * ferment pas : on ne sait pas d'avance ce qu'un vendeur tend avec la moto.
 *
 * La borne haute n'est pas décorative : les règles Firestore la vérifient
 * aussi, et un copier-coller de deux cents lignes dans un textarea ne doit pas
 * produire un document que le serveur refusera après coup.
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
