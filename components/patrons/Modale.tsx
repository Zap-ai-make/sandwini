"use client";

import { X } from "lucide-react";
import { useEffect, useId, useLayoutEffect, useRef, type ReactNode } from "react";

/**
 * La modale du produit : un calque, ses garanties écrites une fois.
 *
 * **Un calque, et pas un `<dialog>` natif.** Le natif donne gratuitement le
 * piège de focus, Échap, le fond inerte et la couche supérieure — mais S42 a
 * mesuré que deux `<dialog>` modaux imbriqués se referment l'un l'autre : le
 * modal fournisseur ouvert par-dessus celui de l'arrivage faisait partir le lot
 * **sans fournisseur**. Trois des quatre modales du produit étaient déjà passées
 * au calque pour cette raison, chacune réimplémentant un bout de ce que le natif
 * donnait — et deux d'entre elles se trompant.
 *
 * Ce patron reprend donc les cinq garanties à sa charge, une fois :
 *
 * 1. **le focus est pris** à l'ouverture. Sans lui, Échap ne remonte à personne :
 *    c'était le cas d'`InspecterLotModal` et de `ModifierArrivageModal`, dont le
 *    gestionnaire de touche était posé sur une boîte que rien ne focalisait ;
 * 2. **le focus est piégé** : Tab boucle dans la modale, jamais derrière ;
 * 3. **le focus est rendu** à ce qui l'avait, à la fermeture ;
 * 4. **Échap ferme**, et le clic au fond aussi — sur `onMouseDown`, pour qu'un
 *    geste commencé dans le cadre et terminé dehors ne ferme pas ;
 * 5. **le fond est inerte** : le corps de page ne défile plus, et rien derrière
 *    ne se lit ni ne se clique.
 *
 * **La pile fait l'empilement.** Chaque modale ouverte s'inscrit dans une pile
 * de module ; seule celle du dessus écoute Échap et piège le focus, et son
 * `z-index` se déduit de son rang. Deux `z-50` recopiés à la main se départagent
 * par l'ordre du DOM, ce qui est exactement ce qu'on ne veut pas parier.
 *
 * **Feuille en bas sur téléphone, boîte centrée au-dessus.** L'application est
 * d'abord une application de comptoir : la feuille monte du bas, là où est le
 * pouce. Et dans les deux cas la hauteur est bornée et le contenu défile —
 * `FournisseurModal` et `ModifierArrivageModal` ne l'étaient pas, et leur pied
 * de formulaire sortait de l'écran dès que le clavier s'ouvrait.
 */

/** Les modales ouvertes, de la plus ancienne à la plus récente. */
const pile: string[] = [];

export type TailleModale = "etroite" | "moyenne" | "large";

const LARGEUR: Record<TailleModale, string> = {
  etroite: "sm:w-[min(28rem,calc(100vw-2rem))]",
  moyenne: "sm:w-[min(36rem,calc(100vw-2rem))]",
  large: "sm:w-[min(56rem,calc(100vw-2rem))]",
};

const SELECTEUR_FOCUSABLE = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

export function Modale({
  ouvert,
  onFermer,
  titre,
  description,
  taille = "moyenne",
  pied,
  children,
}: {
  ouvert: boolean;
  onFermer: () => void;
  titre: string;
  description?: ReactNode;
  taille?: TailleModale;
  /** Les actions, collées au bas du cadre : elles ne défilent pas avec le corps. */
  pied?: ReactNode;
  children: ReactNode;
}) {
  const calque = useRef<HTMLDivElement>(null);
  const cadre = useRef<HTMLDivElement>(null);
  const identifiant = useId();
  const titreId = `${identifiant}-titre`;

  useLayoutEffect(() => {
    if (!ouvert) return;

    pile.push(identifiant);
    /* Le rang dans la pile décide du `z-index`, et il s'écrit **sur le nœud**
       plutôt que dans un état : une modale n'a pas à se redessiner parce
       qu'une autre s'est ouverte au-dessus d'elle, et un effet est fait pour
       porter l'état de React vers l'extérieur — ici le DOM. Posé avant la
       peinture, de sorte qu'une modale imbriquée ne passe jamais une image
       sous sa parente. */
    if (calque.current) calque.current.style.zIndex = String(50 + (pile.length - 1) * 10);
    const rendreLeFocusA = document.activeElement as HTMLElement | null;

    /* Le corps ne défile plus derrière. La valeur d'avant est retenue et n'est
       rendue qu'une fois la pile vide : une modale imbriquée qui se ferme ne
       doit pas rendre le défilement que sa parente retient encore. */
    const defilementAvant = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    /* Le focus entre dans la modale. Sans ce geste, la touche Échap ne verrait
       jamais rien — c'est exactement le défaut qu'avaient `InspecterLotModal`
       et `ModifierArrivageModal`. */
    const premier = cadre.current?.querySelector<HTMLElement>(SELECTEUR_FOCUSABLE);
    (premier ?? cadre.current)?.focus();

    return () => {
      const place = pile.indexOf(identifiant);
      if (place !== -1) pile.splice(place, 1);
      if (pile.length === 0) document.body.style.overflow = defilementAvant;
      rendreLeFocusA?.focus();
    };
  }, [ouvert, identifiant]);

  /* Le clavier s'écoute sur le document, et non sur le cadre : le focus peut
     être sorti de la modale (le navigateur le pose parfois sur le corps), et
     un gestionnaire attaché au cadre ne verrait plus rien. La pile est lue à
     l'instant de la touche — seule la modale du dessus répond. */
  useEffect(() => {
    if (!ouvert) return;

    function auClavier(evenement: KeyboardEvent) {
      if (pile[pile.length - 1] !== identifiant) return;

      if (evenement.key === "Escape") {
        evenement.preventDefault();
        evenement.stopPropagation();
        onFermer();
        return;
      }

      if (evenement.key !== "Tab") return;

      const focusables = Array.from(
        cadre.current?.querySelectorAll<HTMLElement>(SELECTEUR_FOCUSABLE) ?? [],
      ).filter((element) => element.offsetParent !== null);
      if (focusables.length === 0) return;

      const premier = focusables[0];
      const dernier = focusables[focusables.length - 1];
      const actif = document.activeElement;

      /* Le focus sorti du cadre y revient : c'est le piège proprement dit,
         et pas seulement le bouclage des deux extrémités. */
      if (!cadre.current?.contains(actif)) {
        evenement.preventDefault();
        (evenement.shiftKey ? dernier : premier).focus();
        return;
      }
      if (!evenement.shiftKey && actif === dernier) {
        evenement.preventDefault();
        premier.focus();
      } else if (evenement.shiftKey && actif === premier) {
        evenement.preventDefault();
        dernier.focus();
      }
    }

    document.addEventListener("keydown", auClavier, true);
    return () => document.removeEventListener("keydown", auClavier, true);
  }, [ouvert, identifiant, onFermer]);

  if (!ouvert) return null;

  return (
    <div
      onMouseDown={(evenement) => {
        if (evenement.target === evenement.currentTarget) onFermer();
      }}
      ref={calque}
      className="fixed inset-0 z-50 flex items-end justify-center bg-nuit/45 sm:items-center sm:p-4"
    >
      <div
        ref={cadre}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titreId}
        tabIndex={-1}
        className={[
          "relative flex max-h-[min(92dvh,56rem)] w-full flex-col overflow-hidden",
          "border border-bord bg-papier text-encre shadow-panneau outline-none",
          /* En bas de l'écran sur téléphone : seuls les coins hauts s'arrondissent,
             comme une feuille qui monte. Centrée au-dessus. */
          "rounded-t-carte sm:rounded-carte",
          "motion-safe:animate-[monte_var(--duree-apparition)_var(--ease-sortie)]",
          LARGEUR[taille],
        ].join(" ")}
      >
        <div className="flex items-start gap-3 px-5 pt-6 sm:px-6">
          {/* La poignée de la feuille : un repère de geste sur téléphone, rien
              du tout sur bureau où la modale ne se tire pas. Décorative, donc
              hors de l'arbre d'accessibilité. */}
          <span
            aria-hidden="true"
            className="absolute inset-x-0 top-2 mx-auto h-1 w-10 rounded-full bg-bord sm:hidden"
          />
          <div className="min-w-0 flex-1">
            <h2 id={titreId} className="text-lg font-semibold text-encre">
              {titre}
            </h2>
            {description && <p className="text-corps text-encre-doux">{description}</p>}
          </div>
          <button
            type="button"
            onClick={onFermer}
            className="pastille-bouton shrink-0"
            aria-label="Fermer"
          >
            <X aria-hidden="true" className="size-4" />
          </button>
        </div>

        {/* Le corps défile, le pied ne bouge pas : le bouton qui enregistre
            reste sous les yeux d'un bout à l'autre d'un formulaire long. */}
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-6">{children}</div>

        {pied && (
          <div className="flex flex-wrap items-center gap-3 border-t border-bord bg-fond px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-6">
            {pied}
          </div>
        )}
      </div>
    </div>
  );
}
