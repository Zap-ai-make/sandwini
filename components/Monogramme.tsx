"use client";

import { useId } from "react";

/**
 * Le monogramme SE, redessiné d'après le logo gravé (26 octobre 2026).
 *
 * **Pourquoi un tracé et non la photographie.** Le commanditaire avait d'abord
 * retenu la photo telle quelle ; elle portait son fond de mur, pesait 200 Ko
 * et restait illisible à 40 px dans le rail — « le logo n'a pas été changé,
 * c'est mieux de reconstruire en SVG toi-même ». Un tracé est là avant la
 * première requête réseau, s'imprime net, suit la taille qu'on lui donne et
 * reste lisible au plus petit format de la coquille.
 *
 * **Le dessin en trois pièces**, comme sur la gravure : les lettres SE, une
 * vague bleue qui les traverse, et le partage des couleurs de part et d'autre
 * de cette vague — bleu au-dessus, sombre au-dessous. Le trait est obtenu en
 * dessinant les lettres deux fois, chaque copie découpée par un rectangle :
 * deux glyphes exactement superposés, donc aucune jointure à ajuster.
 *
 * **La moitié sombre prend `currentColor`, et c'est ce qui la sauve.** Le vert
 * ardoise de la gravure disparaîtrait sur le rail, qui est sombre. En suivant
 * l'encre du contexte, la lettre reste lisible partout — claire sur le rail,
 * noire sur le reçu — sans qu'on ait à maintenir trois fichiers pour trois
 * fonds. Le bleu, lui, est la marque : il ne bouge pas.
 *
 * `aria-hidden` par défaut, et c'est presque toujours le bon choix : la raison
 * sociale est écrite à côté en toutes lettres. Le seul cas où il porte un nom
 * est celui où il est seul à l'écran.
 */

/** Le bleu de la gravure. Une valeur littérale : c'est une marque, pas un ton du thème. */
export const BLEU_MARQUE = "#1C7FC0";

export function Monogramme({
  className,
  titre,
  variante = "couleur",
  avecNom = false,
}: {
  className?: string;
  /** Donné seulement quand aucun texte à côté ne dit déjà le nom. */
  titre?: string;
  /**
   * `couleur` — le bleu de la marque au-dessus de la vague, l'encre du
   * contexte au-dessous.
   *
   * `monochrome` — un seul ton, pris sur `currentColor`, pour un document tiré
   * en noir et blanc. La vague y passe à 45 % d'opacité : à plat, elle se
   * confondrait avec les lettres qu'elle touche et le monogramme deviendrait
   * une tache.
   */
  variante?: "couleur" | "monochrome";
  /**
   * Ajoute « Sandwidi Entreprise » sous le monogramme, comme sur la gravure.
   *
   * **Dans le même SVG, et c'est le point.** Posé en texte HTML à côté, le nom
   * aurait fallu lier sa taille à celle du dessin — par une requête de
   * conteneur, ou par une taille fixe qui ne vaut qu'à une échelle. Dans le
   * tracé, il suit le `viewBox` : le logo se pose aussi bien sur 56 px que sur
   * 180 sans qu'aucune règle n'ait à le savoir.
   */
  avecNom?: boolean;
}) {
  /* Les identifiants de découpe sont uniques par instance : plusieurs
     monogrammes vivent parfois dans le même document — le rail, le reçu ouvert
     en panneau, l'en-tête de ce reçu. Des `id` figés y seraient dupliqués, et
     le jour où la première instance se démonte, les autres pointeraient vers
     une définition disparue. */
  const cle = useId().replace(/:/g, "");
  const haut = `se-haut-${cle}`;
  const bas = `se-bas-${cle}`;
  const monochrome = variante === "monochrome";
  const bleu = monochrome ? "currentColor" : BLEU_MARQUE;

  return (
    <svg
      viewBox={avecNom ? "0 0 220 196" : "0 0 220 150"}
      className={className}
      role={titre ? "img" : undefined}
      aria-hidden={titre ? undefined : "true"}
      aria-label={titre}
    >
      <defs>
        {/* Le partage se fait à 70 : à peu près la taille d'x des lettres,
            là où la vague les traverse sur la gravure. */}
        <clipPath id={haut}>
          <rect x="0" y="0" width="220" height="70" />
        </clipPath>
        <clipPath id={bas}>
          <rect x="0" y="70" width="220" height="80" />
        </clipPath>
      </defs>

      {/* Les lettres, deux fois. `textLength` fige la largeur : sans lui, une
          police de repli — sur un appareil qui n'a pas fini de charger la
          nôtre — déplacerait les glyphes sous la vague, qui ne les traverserait
          plus au bon endroit. */}
      <g
        fontFamily="var(--font-display), ui-sans-serif, system-ui, sans-serif"
        fontSize="132"
        fontWeight="800"
        textAnchor="middle"
        letterSpacing="-6"
      >
        <text x="110" y="120" textLength="196" lengthAdjust="spacingAndGlyphs" fill={bleu} clipPath={`url(#${haut})`}>
          SE
        </text>
        <text
          x="110"
          y="120"
          textLength="196"
          lengthAdjust="spacingAndGlyphs"
          fill="currentColor"
          clipPath={`url(#${bas})`}
        >
          SE
        </text>
      </g>

      {/* La vague : elle part épaisse à gauche, traverse les lettres et file
          vers le haut à droite. C'est elle qui fait reconnaître la marque. */}
      <path
        fill={bleu}
        fillOpacity={monochrome ? 0.45 : undefined}
        d="M2 99C27 68 78 56 129 64C169 70 199 66 218 47C206 85 163 103 119 96C75 89 38 90 14 111Z"
      />

      {avecNom && (
        /* Le nom en deux tons, comme la gravure : « Sandwidi » dans l'encre du
           contexte, « Entreprise » dans le bleu de la marque. */
        <text
          x="110"
          y="186"
          textAnchor="middle"
          fontFamily="var(--font-display), ui-sans-serif, system-ui, sans-serif"
          fontSize="34"
          fontWeight="800"
          letterSpacing="-1"
          fill="currentColor"
        >
          Sandwidi <tspan fill={bleu}>Entreprise</tspan>
        </text>
      )}
    </svg>
  );
}
