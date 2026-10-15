"use client";

import { useEtatReseau } from "@/lib/reseau/etat-reseau";

/**
 * Le filet de deux pixels en tête de coquille — le seul endroit où le dégradé
 * du monogramme sort du logo (D70, `CAHIER-UI.md` §4).
 *
 * **Il ne bouge pas, et c'est une leçon.** Une lueur l'a parcouru le temps d'un
 * essai, pour rendre l'interface vivante. Le commanditaire ne l'a pas vue, et il
 * avait raison : deux pixels au bord de l'écran font un indicateur réseau, pas
 * une identité. Ce qui identifie SDI, c'est le monogramme — et c'est lui qui a
 * reçu le mouvement (`globals.css`, A10.5).
 *
 * **Ce qu'il lui reste est un état, pas une animation** : hors ligne, il
 * s'éteint en gris. La plaque passe au jaune plein au même instant, et le mot
 * « Hors ligne » s'écrit entre les deux — la couleur double le mot, elle ne le
 * remplace jamais (`DESIGN.md` §5). C'est pour lire cet état qu'il est un
 * composant client ; sans lui, un simple `<span>` suffirait.
 *
 * Le filet reste décoratif : `aria-hidden`, rien à annoncer — l'état réseau est
 * déjà dit en toutes lettres par le `role="status"` du bandeau.
 */
export function FiletMarque() {
  const { etat } = useEtatReseau();

  return <span aria-hidden="true" data-synchro={etat} className="coquille-filet print:hidden" />;
}
