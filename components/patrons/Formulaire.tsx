import type { ReactNode } from "react";

/**
 * L’écran de formulaire : une colonne, un aparté, une barre d’action.
 *
 * `CAHIER-UI.md` §8.3 le décrit en trois exigences, et les trois sont ici :
 * **une colonne** pour la saisie — jamais deux champs côte à côte s’ils se
 * lisent en séquence ; **la conséquence annoncée avant la validation** — c’est
 * le rôle de l’aparté ; **le bouton visible** — un formulaire long ne cache pas
 * sa validation à deux mille pixels de défilement (§7).
 *
 * **La place à droite ne sert pas à étirer les champs.** C’est tout le point :
 * en retirant `max-w-3xl`, S28 a rendu la zone de travail à sa largeur, et les
 * champs s’y sont étalés. Les borner ne suffisait pas — il restait une bande
 * vide. Elle récapitule maintenant ce qu’on s’apprête à enregistrer, et le
 * gérant relit sans remonter le formulaire.
 *
 * Sous 1280 px il n’y a plus de place pour deux colonnes : l’aparté redescend
 * sous la saisie, au-dessus de la barre. C’est le seuil des maquettes, et il
 * tombe où la colonne des écrans devient coûteuse.
 */
export function Formulaire({
  recapitulatif,
  barre,
  children,
}: {
  /** L’aparté de droite : ce qui sera écrit, relu avant de valider. */
  recapitulatif?: ReactNode;
  /** Ce qui se pose dans la barre collée en bas : le chiffre, puis les gestes. */
  barre?: ReactNode;
  children: ReactNode;
}) {
  return (
    /* **La barre est en dehors de la grille**, et ce n’est pas un détail de
       structure : c’est la seule façon qu’elle tienne. Un élément collant ne
       sort jamais de son bloc conteneur, et le bloc conteneur d’un enfant de
       grille est sa **zone de grille** — une rangée à la hauteur exacte de la
       barre, donc sans un pixel de jeu pour la faire glisser. Posée là, elle
       ne collait pas : elle restait à quatre centimètres du bas, une ligne de
       saisie visible en dessous d’elle. Vu sur la capture, puis mesuré dans le
       navigateur ; les maquettes portent le même défaut sans qu’il s’y voie.

       La largeur du bloc est donc écrite ici plutôt que déduite des colonnes :
       40 rem de saisie, 2 rem de gouttière, 21,25 rem de récapitulatif. */
    <div className={`max-w-[40rem] xl:max-w-[63.25rem] ${barre ? "-mb-16" : ""}`}>
      {/* La réserve du bas est la hauteur de la barre : sans elle, les deux
          derniers champs restent **sous** la barre une fois le formulaire
          déroulé jusqu’au bout, et rien ne permet de les atteindre. Vu sur la
          capture — le moyen de paiement était coupé en deux.

          Elle est sur la grille et non sur la colonne : en une seule colonne,
          le récapitulatif passe **après** la saisie, et une réserve posée sur
          la colonne ouvrait un trou de trois centimètres entre le dernier
          champ et lui. Vu sur la capture à 390 px. */}
      <div
        className={`grid items-start gap-6 xl:grid-cols-[minmax(0,40rem)_21.25rem] xl:gap-x-8 xl:gap-y-0 ${barre ? "pb-24" : ""}`}
      >
        <div className="colonne-formulaire min-w-0">{children}</div>

        {/* `top-0` et non une valeur choisie : le haut de la zone de travail
            est déjà sous le bandeau, qui ne défile pas avec elle. */}
        {recapitulatif && <aside className="min-w-0 xl:sticky xl:top-0">{recapitulatif}</aside>}
      </div>

      {/* Les trois valeurs négatives disent la même chose : la barre appartient
          au bord de la zone de travail, et `app/(app)/layout.tsx` pose sur
          `main` un `px-5 pb-16` qu’il faut lui reprendre. Le `-mx-5` la fait
          toucher les côtés. Le `-mb-16` plus haut lui rend les quatre
          centimètres du bas **dans le flux**. Et le `bottom` négatif les lui
          rend **dans le collage** : le rectangle qui retient un élément
          collant s’arrête à la boîte de contenu du défilement, pas à sa
          marge intérieure — sans cette troisième valeur, la barre se posait
          quatre centimètres trop haut, une ligne de saisie visible en dessous
          d’elle. Mesuré dans le navigateur après l’avoir vu sur la capture ;
          les maquettes portent le même défaut sans qu’il s’y voie. */}
      {barre && (
        <div className="sticky -bottom-16 z-10 -mx-5 flex flex-wrap items-center gap-3 border-t border-bord bg-papier px-5 py-3">
          {barre}
        </div>
      )}
    </div>
  );
}

/**
 * Un groupe de saisie : son titre, et ce qu’il demande.
 *
 * Un vrai `fieldset`, parce que c’en est un — le lecteur d’écran annonce alors
 * le groupe avant chaque champ, et « Montant reçu » se comprend de « Le premier
 * versement ». Sans bordure ni cadre : les maquettes posent les champs sur le
 * fond, et un cadre par groupe rendrait cinq boîtes là où il n’y a qu’un
 * formulaire.
 *
 * **Court et titré** (`CAHIER-UI.md` §8.3). Le titre est un `legend`, pas un
 * `h2` : il nomme un groupe de champs, il n’ouvre pas une section de l’écran.
 */
export function Groupe({ titre, children }: { titre: string; children: ReactNode }) {
  return (
    <fieldset className="mb-8">
      <legend className="mb-3 text-bloc font-bold tracking-tight text-encre">{titre}</legend>
      {children}
    </fieldset>
  );
}
