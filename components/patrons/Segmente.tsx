"use client";

import { useId, type ReactNode } from "react";

/**
 * Un choix exclusif, rendu en segments.
 *
 * **Ce sont de vrais boutons radio**, visuellement masqués sous leur étiquette.
 * Ça a l'air d'une rangée de boutons et ça n'en est pas une, et la différence
 * n'est pas cosmétique : les flèches du clavier parcourent le groupe toutes
 * seules, le lecteur d'écran annonce « 2 sur 3 », et le groupe porte un nom.
 * Une pile de `<button aria-pressed>` aurait le même dessin et ne dirait rien
 * de tel — c'est le raisonnement déjà écrit pour `Choix` sur l'écran de vente,
 * et pour les deux radios de `PanneauPiece`, d'où ce patron est tiré.
 *
 * Le `name` doit rester unique dans la page : deux groupes qui le partagent
 * n'en font qu'un, et choisir dans l'un décoche l'autre. Il est donc dérivé
 * d'un `useId` plutôt que laissé à l'appelant.
 */
export function Segmente<T extends string>({
  libelle,
  libelleMasque = false,
  valeur,
  changer,
  options,
  className = "",
}: {
  /** Le nom du groupe, annoncé avant les options. */
  libelle: string;
  /**
   * Le nom du groupe reste annoncé, mais ne s'affiche plus.
   *
   * Pour `Onglets` : « Marques | Modèles » n'a pas besoin d'un « Afficher&nbsp;: »
   * au-dessus pour se comprendre, et cette ligne de chrome pousserait le
   * contenu vers le bas sur tous les écrans qui s'en servent. Le nom ne
   * disparaît pas pour autant — le `radiogroup` sans nom s'annonce « 1 sur 2 »
   * sans dire de quoi.
   */
  libelleMasque?: boolean;
  valeur: T;
  changer: (valeur: T) => void;
  options: readonly { valeur: T; libelle: string; icone?: ReactNode }[];
  className?: string;
}) {
  const identifiant = useId();
  const libelleId = `${identifiant}-libelle`;

  return (
    <div className={className}>
      <span
        id={libelleId}
        className={libelleMasque ? "sr-only" : "block text-sm font-medium text-encre"}
      >
        {libelle}
      </span>
      <div
        role="radiogroup"
        aria-labelledby={libelleId}
        /* Il s'enroule plutôt qu'il ne rétrécit : à 390 px, quatre moyens de
           paiement compressés sur une ligne passent sous la cible tactile, et
           « Orange Money » se casse en deux. */
        className="mt-1.5 flex flex-wrap gap-2"
      >
        {options.map((option) => {
          const choisi = option.valeur === valeur;
          return (
            <label
              key={option.valeur}
              className={[
                /* **`relative` n'est pas décoratif : sans lui la modale se
                   vide.** Le radio est `sr-only`, donc `position: absolute`.
                   Si l'étiquette n'est pas positionnée, son bloc conteneur
                   devient le premier ancêtre qui l'est — le cadre de la
                   modale —, et ces boutons dispersés étirent sa zone
                   défilable bien au-delà de sa hauteur. Au clic, le navigateur
                   fait défiler ce cadre pour révéler le radio qui vient de
                   prendre le focus : mesuré à 856 px, contenu hors champ, et
                   comme le cadre est `overflow-hidden`, aucun moyen de
                   revenir. L'écran restait vide jusqu'à la fermeture.
                   Trouvé à l'usage par le commanditaire (S44). */
                "relative",
                "flex h-12 min-w-[7rem] flex-1 cursor-pointer items-center justify-center gap-2",
                "rounded-plaque border px-3 text-center font-medium",
                /* Le focus vit sur l'étiquette, puisque le radio est masqué :
                   sans cette ligne, parcourir le groupe au clavier ne se
                   verrait pas (`DESIGN.md` §11). */
                "has-[:focus-visible]:outline has-[:focus-visible]:outline-2",
                "has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-focus-trait",
                choisi
                  ? "border-2 border-encre bg-papier font-semibold text-encre"
                  : "border-bord bg-papier text-encre-doux hover:bg-survol",
              ].join(" ")}
            >
              <input
                type="radio"
                name={identifiant}
                value={option.valeur}
                checked={choisi}
                onChange={() => changer(option.valeur)}
                className="sr-only"
              />
              {option.icone}
              {option.libelle}
            </label>
          );
        })}
      </div>
    </div>
  );
}
