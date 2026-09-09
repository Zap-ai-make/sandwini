"use client";

import { useId } from "react";

/**
 * Le monogramme SE — la marque du client, dessinée une fois.
 *
 * Deux formes, deux chemins : la goutte (dessous), puis le S et le E fondus en
 * une seule silhouette qui partage la barre haute et la barre basse.
 * `design/marque/monogramme-se.svg` reste la source de vérité du dessin ; ce
 * fichier en est la transcription pour l’application.
 *
 * **Il porte ses deux dégradés, et c’est le sujet de S31.** Il les avait
 * perdus : les tracés étaient repris, les `linearGradient` non, et le
 * monogramme sortait blanc à plat dans la coquille. Le commentaire assumait ce
 * choix — « sans qu’on ait à maintenir trois fichiers pour trois fonds » —
 * mais il contredisait D70, *la marque prend la coquille*. Un monogramme sans
 * ses couleurs n’est plus la marque, c’est une silhouette, et c’est le premier
 * reproche que le commanditaire a formulé en ouvrant la préversion.
 *
 * **Pourquoi en ligne plutôt qu’un `<img>`.** Le reçu s’imprime, et un
 * navigateur qui n’a pas fini de charger une image l’imprime blanche : la
 * leçon de S10. Un tracé SVG dans le document est là avant la première requête
 * réseau, ce qui est aussi ce que promet une application qui marche hors
 * ligne. Les dégradés ne changent rien à cela — ils voyagent dans le même
 * document que les tracés.
 *
 * **Le dégradé reste enfermé dans le monogramme** (`CAHIER-UI.md` §4). Il ne
 * s’étale nulle part ailleurs, à une exception près, écrite dans
 * `globals.css` : le filet de 2 px en tête de coquille.
 *
 * `aria-hidden` par défaut, et c’est presque toujours le bon choix : la raison
 * sociale est écrite à côté en toutes lettres. Le seul cas où il porte un nom
 * est celui où il est seul à l’écran.
 */
export function Monogramme({
  className,
  titre,
  variante = "couleur",
}: {
  className?: string;
  /** Donné seulement quand aucun texte à côté ne dit déjà le nom. */
  titre?: string;
  /**
   * `couleur` — les deux dégradés du fichier de marque. La coquille, l’écran
   * de connexion : partout où la marque doit être la marque.
   *
   * `monochrome` — un seul ton, pris sur `currentColor`. C’est la variante du
   * reçu, et la maquette `c4-recu.html` la sert telle quelle : un aplat de
   * couleur sur du papier vide une cartouche pour rien, et le reçu sort
   * souvent en noir et blanc. La goutte y passe à 55 % d’opacité — à plat elle
   * se confondrait avec le S qu’elle touche, et le monogramme deviendrait une
   * tache. C’est le bleu qui fait ce travail dans la version couleur.
   */
  variante?: "couleur" | "monochrome";
}) {
  /* Les identifiants de dégradé sont uniques par instance. Trois monogrammes
     vivent parfois dans le même document — le rail, le reçu ouvert en panneau,
     et l’en-tête de ce reçu : des `id` figés y seraient dupliqués, et le jour
     où la première instance se démonte, les autres pointeraient vers une
     définition disparue. `useId` coûte une chaîne et supprime la classe de
     défaut entière. */
  const cle = useId();
  const metal = `metal-${cle}`;
  const goutte = `goutte-${cle}`;
  const monochrome = variante === "monochrome";

  return (
    <svg
      viewBox="0 0 546 402"
      className={className}
      role={titre ? "img" : undefined}
      aria-hidden={titre ? undefined : "true"}
      aria-label={titre}
    >
      {!monochrome && (
        <defs>
          {/* Les cinq arrêts du fichier de marque, dans l’ordre : l’or tient
              toute la moitié gauche avant de virer, comme sur l’original. */}
          <linearGradient id={metal} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#E0A81A" />
            <stop offset="0.5" stopColor="#DFA01C" />
            <stop offset="0.63" stopColor="#DD7A28" />
            <stop offset="0.82" stopColor="#D3592C" />
            <stop offset="1" stopColor="#C93C2E" />
          </linearGradient>
          <linearGradient id={goutte} x1="0.1" y1="0" x2="0.9" y2="1">
            <stop offset="0" stopColor="#2E9BC4" />
            <stop offset="1" stopColor="#1F52A8" />
          </linearGradient>
        </defs>
      )}

      {/* La goutte : la trace, ce qui file vers la gauche. Un croissant,
          pointe en haut. */}
      <path
        fill={monochrome ? "currentColor" : `url(#${goutte})`}
        fillOpacity={monochrome ? 0.55 : undefined}
        d="M6 126C3 160 4 210 20 246C36 285 75 315 151 334C190 331 221 314 221 286C200 258 130 236 60 212C30 196 12 162 6 126Z"
      />

      {/* Le S et le E fondus : ils partagent la barre haute et la barre basse. */}
      <path
        fill={monochrome ? "currentColor" : `url(#${metal})`}
        d="M204 4H540C540 44 518 74 467 94L387 98V156H514C514 192 492 228 451 242L387 246V304L468 308C512 318 538 344 540 391V396H219C270 374 303 330 307 276C307 248 293 228 273 206C240 186 185 166 128 152C105 142 96 124 96 106C96 84 130 74 165 78C195 82 220 96 246 114L250 119L253 113L293 57C265 38 235 20 204 4Z"
      />
    </svg>
  );
}
