import type { ReactNode } from "react";

/**
 * Une carte qui filtre la liste du dessous, sur place (6 novembre 2026).
 *
 * Née pour les lots de cartes grises, reprise pour le stock par boutique : une
 * case qui montre un nombre et qui, pressée, réduit la liste à ce qu'elle
 * compte. Un bouton qui se presse (`aria-pressed`), comme les filtres d'état :
 * le lecteur d'écran dit « choisi », le clavier y entre.
 */
export function CarteFiltre({
  actif,
  choisir,
  children,
}: {
  actif: boolean;
  choisir: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={choisir}
      aria-pressed={actif}
      className={[
        "w-44 shrink-0 rounded-carte border bg-papier text-left",
        "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-encre",
        /* La bordure épaissie se paie sur la marge intérieure : la carte
           choisie ne bouge pas d'un pixel, et ses voisines non plus. */
        actif ? "border-2 border-encre px-[11px] py-[9px]" : "border-bord px-3 py-2.5 hover:bg-survol",
      ].join(" ")}
    >
      {children}
    </button>
  );
}
