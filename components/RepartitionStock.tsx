"use client";

import { ChevronRight } from "lucide-react";
import { repartirParMarque } from "@/lib/domain/repartition";
import { formaterNombre } from "@/lib/domain/format";
import type { Moto } from "@/lib/domain/moto";

/**
 * Combien de motos par marque, et par modèle (S50).
 *
 * **Replié par défaut, et c'est le point.** L'écran du stock répond d'abord à
 * « cette moto-là, je l'ai ? » — un châssis qu'on compare caractère par
 * caractère. Le comptage répond à une autre question, posée plus rarement :
 * « qu'est-ce que j'ai le plus ? ». Déployée en permanence, elle repousserait
 * le tableau hors de l'écran pour servir le geste le moins fréquent.
 *
 * **Un `<details>` et non un bouton à état.** La règle 1 d'`AGENTS.md` :
 * l'élément natif donne le clavier, le repli et le rôle sans une ligne de
 * JavaScript. `FormulaireClient` a préféré un vrai bouton, mais pour une raison
 * qui ne vaut pas ici — il vit dans une modale, et deux mécaniques de repli se
 * contredisent à l'usage. Cet écran n'en a aucune autre.
 *
 * **Le compte suit les filtres**, parce que la liste reçue est celle que
 * l'écran affiche. Filtrer sur « occasion » puis lire la répartition donne la
 * répartition des occasions — ce qui est la seule lecture cohérente avec un
 * tableau filtré juste en dessous. Le résumé le dit, pour que le nombre ne se
 * confonde pas avec le stock entier.
 */
export function RepartitionStock({
  motos,
  filtre,
  nomMarque,
  nomModele,
}: {
  motos: readonly Moto[];
  /** Vrai si un filtre ou une recherche réduit la liste reçue. */
  filtre: boolean;
  nomMarque: (id: string) => string;
  nomModele: (id: string) => string;
}) {
  const marques = repartirParMarque(motos, nomMarque, nomModele);
  if (marques.length === 0) return null;

  const total = motos.length;

  return (
    /* `repli` remplace le triangle natif par un chevron qui pivote et donne au
       contenu son mouvement d'ouverture (`globals.css`, A10) — le `<details>`
       reste entier, c'est lui qui tient le clavier, le rôle et l'état. */
    <details className="repli cadre mb-4 p-4 sm:p-5">
      <summary className="text-corps text-encre">
        <ChevronRight
          aria-hidden="true"
          className="repli-chevron size-4 shrink-0 translate-y-[0.15em] text-encre-doux"
        />
        <span>
          <span className="font-medium">Répartition par marque</span>{" "}
          <span className="text-legende text-encre-doux">
            {formaterNombre(marques.length)}{" "}
            {marques.length > 1 ? "marques" : "marque"} · {formaterNombre(total)}{" "}
            {total > 1 ? "motos" : "moto"}
            {filtre ? " (sur la liste filtrée)" : ""}
          </span>
        </span>
      </summary>

      <ul className="mt-4 grid gap-4">
        {marques.map((marque) => (
          <li key={marque.marqueId}>
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 border-b border-bord pb-1">
              <span className="font-medium text-encre">{marque.libelle}</span>
              <span className="font-code text-bloc tabular-nums text-encre">
                {formaterNombre(marque.compte)}
              </span>
            </div>

            {/* Les modèles ne se montrent que s'il y a quelque chose à
                distinguer : une marque à un seul modèle répéterait son propre
                total une ligne plus bas. */}
            {marque.modeles.length > 1 && (
              <ul className="mt-1 grid gap-0.5 pl-4">
                {marque.modeles.map((modele) => (
                  <li
                    key={modele.modeleId || "sans-modele"}
                    className="flex flex-wrap items-baseline justify-between gap-x-3"
                  >
                    <span className="text-legende text-encre-doux">
                      {modele.libelle}
                    </span>
                    <span className="font-code text-legende tabular-nums text-encre-doux">
                      {formaterNombre(modele.compte)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>
    </details>
  );
}
