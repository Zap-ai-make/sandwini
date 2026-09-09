/**
 * Le monogramme SE — la marque du client, dessinée une fois.
 *
 * Deux chemins, pas d’image : le SE fondu, et la goutte à 55 % d’opacité qui
 * l’accompagne. En `currentColor`, donc il prend la couleur de son parent — le
 * blanc de la coquille nuit, l’encre du reçu imprimé — sans qu’on ait à
 * maintenir trois fichiers pour trois fonds.
 *
 * **Pourquoi en ligne plutôt qu’un `<img>`.** Le reçu s’imprime, et un
 * navigateur qui n’a pas fini de charger une image l’imprime blanche : la
 * leçon de S10. Un chemin SVG dans le document est là avant la première
 * requête réseau, ce qui est aussi ce que promet une application qui marche
 * hors ligne.
 *
 * Il portait déjà deux copies — le rail et le reçu — quand l’écran de
 * connexion en a demandé une troisième. `design/marque/monogramme-se.svg`
 * reste la source de vérité du dessin ; ce fichier en est la transcription
 * pour l’application.
 *
 * `aria-hidden` par défaut, et c’est presque toujours le bon choix : la raison
 * sociale est écrite à côté en toutes lettres. Le seul cas où il porte un nom
 * est celui où il est seul à l’écran.
 */
export function Monogramme({
  className,
  titre,
}: {
  className?: string;
  /** Donné seulement quand aucun texte à côté ne dit déjà le nom. */
  titre?: string;
}) {
  return (
    <svg
      viewBox="0 0 546 402"
      className={className}
      role={titre ? "img" : undefined}
      aria-hidden={titre ? undefined : "true"}
      aria-label={titre}
    >
      <path
        fill="currentColor"
        fillOpacity="0.55"
        d="M6 126C3 160 4 210 20 246C36 285 75 315 151 334C190 331 221 314 221 286C200 258 130 236 60 212C30 196 12 162 6 126Z"
      />
      <path
        fill="currentColor"
        d="M204 4H540C540 44 518 74 467 94L387 98V156H514C514 192 492 228 451 242L387 246V304L468 308C512 318 538 344 540 391V396H219C270 374 303 330 307 276C307 248 293 228 273 206C240 186 185 166 128 152C105 142 96 124 96 106C96 84 130 74 165 78C195 82 220 96 246 114L250 119L253 113L293 57C265 38 235 20 204 4Z"
      />
    </svg>
  );
}
