/**
 * Le monogramme SE — le logo de la maison, tel qu'il a été fourni.
 *
 * **Ni redessiné, ni photographié de travers** (26 octobre 2026). Le dépôt
 * portait deux logos depuis septembre : l'ancien, doré sur nuit
 * (`design/marque/logo-se-fond-sombre.jpg`), transcrit en tracé SVG, et le
 * nouveau, bleu et ardoise (`design/marque/logo-se-relief-mur.jpg`). C'est le
 * second qui vaut — « le premier est le nouveau, donc pas besoin de
 * redessiner ». Un redessin à la main avait été tenté et jeté : il ne
 * ressemblait pas.
 *
 * Les deux fichiers servis ici sont **découpés dans la photographie du logo
 * gravé** : le mur est rendu transparent, le cadrage serré sur la marque. Rien
 * n'est redessiné — les formes sont celles du graveur, au pixel près.
 *
 * **Deux variantes, parce qu'un fond sombre mange l'ardoise.** La moitié basse
 * du SE est d'un vert ardoise profond : sur le rail, qui est en acier huilé,
 * elle disparaîtrait. `logo-se-clair.png` l'éclaircit en gardant le modelé de
 * la gravure — le bleu, lui, ne bouge jamais : c'est la marque. Sur fond clair,
 * c'est le logo tel quel.
 *
 * **Les deux fichiers sont préchargés** (`next.config.ts`). Un reçu s'imprime
 * le jour d'une coupure, et une image qui n'est pas arrivée sort blanche sur la
 * feuille — la leçon de S10.
 *
 * `aria-hidden` par défaut, et c'est presque toujours le bon choix : la raison
 * sociale est écrite à côté en toutes lettres. Le seul cas où il porte un nom
 * est celui où il est seul à l'écran.
 */

export function Monogramme({
  className,
  titre,
  fond = "clair",
}: {
  className?: string;
  /** Donné seulement quand aucun texte à côté ne dit déjà le nom. */
  titre?: string;
  /**
   * Le fond sur lequel le logo se pose.
   *
   * `clair` — un reçu, une carte en thème clair : le logo tel qu'il est gravé.
   *
   * `sombre` — le rail, le panneau de connexion : l'ardoise éclaircie.
   *
   * `auto` — une surface qui suit le thème. Les deux images sont posées, et
   * c'est la feuille de style qui montre celle qui convient : un composant ne
   * peut pas lire le thème sans redevenir client et sans clignoter au premier
   * rendu.
   */
  fond?: "clair" | "sombre" | "auto";
}) {
  const commun = {
    width: 440,
    height: 218,
    "aria-hidden": titre ? undefined : true,
    /* L'impression ne déclenche pas de chargement différé : une image en
       `lazy` hors de l'écran sort blanche sur la feuille. */
    loading: "eager" as const,
    decoding: "sync" as const,
  };

  if (fond === "auto") {
    return (
      <>
        {/* eslint-disable-next-line @next/next/no-img-element -- `next/image`
            attend la mise en page avant de charger : sur un document qu'on
            imprime, c'est exactement ce qu'il ne faut pas. */}
        <img
          src="/logo-se.png"
          alt={titre ?? ""}
          {...commun}
          className={`logo-fond-clair ${className ?? ""}`}
        />
        {/* eslint-disable-next-line @next/next/no-img-element -- idem. */}
        <img
          src="/logo-se-clair.png"
          alt=""
          {...commun}
          aria-hidden
          className={`logo-fond-sombre ${className ?? ""}`}
        />
      </>
    );
  }

  return (
    /* eslint-disable-next-line @next/next/no-img-element -- voir ci-dessus. */
    <img
      src={fond === "sombre" ? "/logo-se-clair.png" : "/logo-se.png"}
      alt={titre ?? ""}
      {...commun}
      className={className}
    />
  );
}
