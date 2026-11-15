/**
 * Combien de coûts un lot d'écriture peut porter (15 novembre 2026).
 *
 * Chaque coût fait consulter sa moto par les règles (`coutSuitSaMoto`), et un
 * `writeBatch` n'en tolère que 20. Mesuré avant correction : 20 coûts dans un
 * lot passaient, 21 faisaient tomber **le lot entier** — et l'arrivage de plus
 * de 115 motos du commanditaire avec. Les motos, elles, ne consultent rien :
 * elles partent d'un seul tenant, et leurs coûts suivent par tranches.
 */
export const COUTS_PAR_ECRITURE = 20;

/** Découpe une liste en tranches de `taille` éléments au plus, dans l'ordre. */
export function enTranches<T>(elements: readonly T[], taille: number): T[][] {
  if (!(taille >= 1)) throw new Error("Une tranche porte au moins un élément.");
  const tranches: T[][] = [];
  for (let debut = 0; debut < elements.length; debut += taille) {
    tranches.push(elements.slice(debut, debut + taille));
  }
  return tranches;
}
