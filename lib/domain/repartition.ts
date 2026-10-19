/**
 * Combien de motos par marque, et par modèle (S50).
 *
 * La question se pose debout devant un stock — « qu'est-ce que j'ai le plus ? »,
 * « il me reste combien de Crypton ? » —, et elle n'avait aucune réponse dans
 * le produit : l'écran du stock sait filtrer par marque, pas compter.
 *
 * **Tout est pur, et rien n'est entretenu.** Les listes arrivent déjà chargées
 * par l'écoute du stock ; on compte à la lecture. C'est D61 : ce qui se
 * recalcule à l'ouverture ne peut pas diverger de ce dont il est tiré, et
 * continue de fonctionner hors ligne. Un agrégat tenu par déclencheur serait
 * moins cher à lire et mentirait le jour où le déclencheur échoue.
 *
 * **Ce module ne décide pas ce qu'il compte.** Il compte la liste qu'on lui
 * donne. C'est à l'écran de choisir s'il parle du stock présent, du stock
 * vendu ou de tout — et il le dit en titre, ce qui évite un paramètre de plus
 * dont la valeur se devinerait.
 */

import type { Moto } from "./moto";

/**
 * Le nom des motos dont le modèle n'a pas été saisi.
 *
 * Il vit ici et non à l'écran, pour que ce soit la même phrase partout. Depuis
 * que le modèle est facultatif, `modeleId` vaut légitimement la chaîne vide et
 * `nommerEntree` rend alors « rien » (D105) — ce qui est juste pour une fiche,
 * où l'absence s'écrit en n'écrivant pas, mais illisible dans un tableau de
 * répartition où chaque ligne a besoin d'un nom.
 *
 * Les faire disparaître serait pire que de les nommer : le total des modèles
 * ne tomberait plus sur celui de la marque, et rien à l'écran n'expliquerait
 * l'écart.
 */
export const MODELE_NON_PRECISE = "Modèle non précisé";

export type CompteModele = {
  modeleId: string;
  libelle: string;
  compte: number;
};

export type CompteMarque = {
  marqueId: string;
  libelle: string;
  compte: number;
  /** Les modèles de cette marque. Leurs comptes somment à `compte`. */
  modeles: CompteModele[];
};

/**
 * Trie par nombre décroissant, puis par nom.
 *
 * Le nombre d'abord, parce que la question posée est « lequel pèse le plus » —
 * c'est le même raisonnement que les parts de `chiffres.ts`, qui se rapportent
 * à la plus grande et non au total. Le nom ensuite, pour que deux ex æquo ne
 * changent pas de place d'un rendu à l'autre.
 *
 * `inconnu` passe toujours derrière à nombre égal : ce qu'on ne sait pas ne se
 * lit pas avant ce qu'on sait, et l'alphabet s'en moquerait.
 */
function parNombrePuisNom<T extends { libelle: string; compte: number }>(
  a: T,
  b: T,
  inconnu?: string,
): number {
  if (a.compte !== b.compte) return b.compte - a.compte;
  if (inconnu) {
    if (a.libelle === inconnu) return 1;
    if (b.libelle === inconnu) return -1;
  }
  return a.libelle.localeCompare(b.libelle, "fr");
}

/**
 * Les motos comptées par marque, chaque marque portant ses modèles.
 *
 * `nomMarque` et `nomModele` viennent du catalogue : ce module ne lit aucune
 * collection, il reçoit de quoi nommer. C'est ce qui le rend testable sans
 * Firestore, et c'est pourquoi il vit dans `lib/domain`.
 */
export function repartirParMarque(
  motos: readonly Moto[],
  nomMarque: (id: string) => string,
  nomModele: (id: string) => string,
): CompteMarque[] {
  const parMarque = new Map<string, Map<string, number>>();

  for (const moto of motos) {
    const modeles = parMarque.get(moto.marqueId) ?? new Map<string, number>();
    modeles.set(moto.modeleId, (modeles.get(moto.modeleId) ?? 0) + 1);
    parMarque.set(moto.marqueId, modeles);
  }

  return [...parMarque.entries()]
    .map(([marqueId, modeles]) => ({
      marqueId,
      libelle: nomMarque(marqueId),
      compte: [...modeles.values()].reduce((total, compte) => total + compte, 0),
      modeles: [...modeles.entries()]
        .map(([modeleId, compte]) => ({
          modeleId,
          libelle: nomModele(modeleId) || MODELE_NON_PRECISE,
          compte,
        }))
        .sort((a, b) => parNombrePuisNom(a, b, MODELE_NON_PRECISE)),
    }))
    .sort((a, b) => parNombrePuisNom(a, b));
}
