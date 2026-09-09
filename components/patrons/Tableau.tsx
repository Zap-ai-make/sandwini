import type { ReactNode } from "react";

/**
 * Le tableau — le patron de liste du produit.
 *
 * Six écrans montrent la même chose : des lignes comparables, des colonnes
 * alignées, des chiffres qu’on lit les uns sous les autres. Le produit les
 * rendait en `<ul>` de cartes empilées, un dessin de téléphone appliqué à un
 * écran de comptoir : sur un 1920, une moto occupait toute la largeur pour dire
 * cinq mots, et comparer deux prix demandait de les chercher (`CAHIER-UI.md`
 * §8.1). Ici, chaque fait a sa colonne, et l’œil descend au lieu de fouiller.
 *
 * **C’est le tableau qui défile, pas la page.** Sur bureau, la zone du tableau
 * prend la hauteur qui reste sous la barre de filtres et défile dans les deux
 * sens ; l’en-tête s’y colle, et la barre de filtres ne part jamais vers le
 * haut — c’est ça, des filtres persistants (`CAHIER-UI.md` §8.1).
 *
 * Le premier essai laissait la page défiler et posait `overflow: clip` sur le
 * cadre pour en rogner les coins. La capture à 1280 px a montré le prix : la
 * dernière colonne, rognée par le cadre, devenait **inatteignable** — la date
 * d’entrée coupée en « 07/0 ». Rogner et déborder ne se conjuguent pas ; il
 * fallait une vraie zone de défilement.
 *
 * **Sous 1024 px, il se replie en cartes** — un tableau ne se comprime pas. Le
 * repli casse les rôles de tableau : chaque cellule porte donc l’intitulé de sa
 * colonne en vrai texte, pas en `::before`, sinon un lecteur d’écran annonce
 * huit valeurs sans dire de quoi (`CAHIER-UI.md` §12).
 *
 * **Le chargement ne saute pas.** Un tableau annoncé par une ligne de texte
 * puis remplacé par cent lignes fait bondir l’écran au moment précis où l’œil
 * se pose. Les lignes fantômes occupent la place du contenu à venir, et le
 * cadre garde sa barre de filtres pendant tout le trajet. Elles sont muettes
 * pour un lecteur d’écran (`aria-hidden`) : c’est le comptage, en tête de
 * cadre, qui annonce d’abord le chargement puis le résultat.
 *
 * Ce que ce patron ne fait pas, faute d’appelant pour en démentir l’interface :
 * ni tri, ni sélection, ni pagination. `CAHIER-UI.md` §8.1 mentionne le tri ;
 * aucun des neuf écrans de S29 ne le demande, et une colonne triable inventée
 * ici serait à refaire au premier écran qui en aurait vraiment besoin
 * (`ARCHITECTURE.md` §1, échelle 1).
 */
export type Colonne<T> = {
  cle: string;
  /** Titre de colonne, et intitulé repris dans la cellule une fois replié. */
  titre: string;
  /**
   * L’intitulé une fois replié en carte, quand le titre de colonne est trop
   * long pour y tenir. La maquette fait exactement cette distinction :
   * « Numéro de châssis » en tête de tableau, « Châssis » dans la carte
   * (`a4:104` contre `b8-mobile-stock:120`). En tête, la colonne se lit une
   * fois pour tout le tableau et peut se permettre le nom complet ; dans la
   * carte, l’intitulé se répète à chaque ligne et vole la place de la valeur.
   */
  titreReplie?: string;
  /** Chiffre ou code : aligné à droite, en Plex Mono, tabulaire, insécable. */
  chiffre?: boolean;
  /** Ce qui identifie la ligne — le châssis, le numéro de vente, le nom. */
  principal?: boolean;
  rendu: (ligne: T) => ReactNode;
};

/* Six lignes : assez pour occuper la place du contenu à venir, pas assez pour
   promettre un nombre que la donnée démentira. */
const LIGNES_FANTOMES = 6;

export function Tableau<T>({
  legende,
  colonnes,
  lignes,
  cleDe,
  chargement,
  cleActive,
  enRetard,
}: {
  /**
   * Ce que le tableau montre, et dans quel ordre. Lu par les lecteurs d’écran
   * avant la première ligne : c’est ce qui évite d’explorer huit colonnes pour
   * comprendre qu’on est parti de la plus récente.
   */
  legende: string;
  colonnes: Colonne<T>[];
  lignes: T[];
  cleDe: (ligne: T) => string;
  /** Le trajet n'est pas fini : des lignes fantômes tiennent la place. */
  chargement?: boolean;
  /**
   * La ligne ouverte dans le panneau latéral, s’il y en a un.
   *
   * Le tableau se contente de la marquer — fond et filet à gauche, jamais la
   * couleur seule (`DESIGN.md` §5) ; c’est le lien de la première cellule qui
   * porte `aria-current`, parce que lui seul sait où il mène.
   */
  cleActive?: string | null;
  /**
   * La ligne qui traîne : un filet à gauche, pour la retrouver de loin dans une
   * file de quarante.
   *
   * Il ne remplace jamais le mot — « En retard », « Aucun versement depuis 60
   * jours » restent écrits dans leur colonne (`DESIGN.md` §5). Le filet sert à
   * balayer la liste, pas à la comprendre.
   */
  enRetard?: (ligne: T) => boolean;
}) {
  return (
    /* La zone qui défile, et à laquelle l'en-tête se colle. Sur bureau elle
       prend la hauteur qui reste sous la barre de filtres ; sous 1024 px elle
       ne défile pas, c'est la page qui s'en charge. */
    <div className="tableau-defilant">
      <table className="tableau">
        <caption className="sr-only">{legende}</caption>
        <thead>
          <tr>
            {colonnes.map((colonne) => (
              <th key={colonne.cle} scope="col" className={colonne.chiffre ? "num" : undefined}>
                {colonne.titre}
              </th>
            ))}
          </tr>
        </thead>
        {chargement ? (
          <tbody aria-hidden="true">
            {Array.from({ length: LIGNES_FANTOMES }, (_, rang) => (
              <tr key={rang}>
                {colonnes.map((colonne) => (
                  <Cellule key={colonne.cle} colonne={colonne}>
                    <span
                      className="squelette"
                      style={{
                        width: colonne.chiffre ? "3.5rem" : colonne.principal ? "9rem" : "5rem",
                      }}
                    />
                  </Cellule>
                ))}
              </tr>
            ))}
          </tbody>
        ) : (
          <tbody>
            {lignes.map((ligne) => (
              <tr
                key={cleDe(ligne)}
                className={
                  [
                    enRetard?.(ligne) ? "ligne-retard" : "",
                    cleDe(ligne) === cleActive ? "ligne-active" : "",
                  ]
                    .filter(Boolean)
                    .join(" ") || undefined
                }
              >
                {colonnes.map((colonne) => (
                  <Cellule key={colonne.cle} colonne={colonne}>
                    {colonne.rendu(ligne)}
                  </Cellule>
                ))}
              </tr>
            ))}
          </tbody>
        )}
      </table>
    </div>
  );
}

/* L'intitulé de colonne vit dans la cellule, en vrai texte : replié en carte,
   le tableau perd ses rôles, et une valeur sans son intitulé ne s'annonce pas.
   Il est masqué sur bureau, où l'en-tête le porte déjà. */
function Cellule<T>({ colonne, children }: { colonne: Colonne<T>; children: ReactNode }) {
  const habillage =
    [colonne.chiffre && "num", colonne.principal && "principal"].filter(Boolean).join(" ") ||
    undefined;
  return (
    <td className={habillage}>
      <span className="tableau-etiquette">{colonne.titreReplie ?? colonne.titre}</span>
      {children}
    </td>
  );
}
