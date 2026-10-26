"use client";

import { Monogramme } from "@/components/Monogramme";

/**
 * Le logo entier : le monogramme et le nom, comme sur la gravure.
 *
 * **Redessiné, et non photographié** (26 octobre 2026). La photographie du
 * logo gravé avait été retenue un temps ; elle portait son fond de mur, pesait
 * 200 Ko et restait illisible une fois réduite. « C'est mieux de reconstruire
 * en SVG toi-même » — ce qui rend aussi le logo présent avant toute requête
 * réseau, net à l'impression, et lisible à n'importe quelle taille.
 *
 * Il sert là où le logo a la place de se déployer : l'écran de connexion, la
 * carte d'identité des réglages, l'en-tête du reçu. Dans le rail, qui n'offre
 * que quarante pixels, c'est `Monogramme` seul qui figure — un nom y serait
 * illisible.
 *
 * Ce composant existe pour que ces trois endroits disent « le logo » et non
 * « le monogramme avec son nom » : le jour où la marque change de forme, ils
 * n'ont pas à le savoir.
 */
export function LogoEntreprise({
  className,
  titre,
}: {
  className?: string;
  /** Décrit le logo quand il porte seul l'identité, comme sur l'écran de connexion. */
  titre?: string;
}) {
  return <Monogramme avecNom className={className} titre={titre} />;
}
