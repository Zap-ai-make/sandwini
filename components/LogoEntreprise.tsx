/**
 * Le logo de la maison, tel que le responsable l'a fourni (26 octobre 2026).
 *
 * **Une image, et non un tracé.** Le `Monogramme` voisin est un SVG écrit dans
 * le code : c'est ce qui lui permet d'être là avant la première requête réseau,
 * et de s'imprimer même quand rien n'a chargé (la leçon de S10). Ce logo-ci est
 * une photographie du logo gravé, envoyée telle quelle et retenue telle quelle
 * par le responsable, avec le fond de mur qu'elle porte.
 *
 * **Ce que cela coûte, et ce qui le compense.** Une image peut n'avoir pas fini
 * d'arriver au moment où l'on imprime ; elle sort alors blanche. Trois choses
 * limitent le risque : le fichier est servi depuis notre domaine, il est
 * préchargé par le service worker dès la première visite — donc présent hors
 * ligne ensuite —, et il est réduit à 480 px de large, la taille à laquelle il
 * s'imprime sans qu'on voie la trame. Le seul cas qui reste est la toute
 * première impression sur un appareil neuf encore en ligne.
 *
 * **Pas de `next/image`.** Ce composant sert sur un reçu, qui s'imprime : la
 * balise doit porter une taille connue avant toute mesure, sans l'enveloppe
 * d'un composant qui attend la mise en page.
 */
export function LogoEntreprise({
  className,
  /** Décrit le logo quand il porte seul l'identité, comme sur l'écran de connexion. */
  titre,
}: {
  className?: string;
  titre?: string;
}) {
  return (
    /* eslint-disable-next-line @next/next/no-img-element -- `next/image` sert
       une balise qui attend la mise en page avant de charger : sur un document
       qu'on imprime, c'est exactement ce qu'il ne faut pas. Voir ci-dessus. */
    <img
      src="/logo-sandwidi.png"
      width={480}
      height={572}
      /* `aria-hidden` par défaut : la raison sociale est écrite à côté en
         toutes lettres, et la redire au lecteur d'écran ferait un doublon. */
      alt={titre ?? ""}
      aria-hidden={titre ? undefined : true}
      /* L'impression ne déclenche pas de chargement différé : une image en
         `lazy` hors de l'écran sort blanche sur la feuille. */
      loading="eager"
      decoding="sync"
      className={className}
    />
  );
}
