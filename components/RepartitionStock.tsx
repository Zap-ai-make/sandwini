"use client";

import { repartirParMarque } from "@/lib/domain/repartition";
import { formaterNombre } from "@/lib/domain/format";
import type { Moto } from "@/lib/domain/moto";

/**
 * Combien de motos par marque, et par modèle (S50).
 *
 * **Elle s'ouvre depuis la carte « Marques »** (9 novembre 2026) : le bloc
 * replié qu'elle était a cédé la place aux cartes de tête du stock, et le
 * nombre de marques mène à son détail. Fermée par défaut, pour la même raison
 * qu'avant : l'écran du stock répond d'abord à « cette moto-là, je l'ai ? » —
 * le comptage répond à une question posée plus rarement, et déployé en
 * permanence il repousserait le tableau hors de l'écran.
 *
 * **Le compte suit les filtres**, parce que la liste reçue est celle que
 * l'écran affiche — comme les cartes au-dessus.
 */
export function RepartitionStock({
  id,
  motos,
  nomMarque,
  nomModele,
}: {
  /** Celui que la carte « Marques » vise par `aria-controls`. */
  id: string;
  motos: readonly Moto[];
  nomMarque: (id: string) => string;
  nomModele: (id: string) => string;
}) {
  const marques = repartirParMarque(motos, nomMarque, nomModele);
  if (marques.length === 0) return null;

  return (
    <div id={id} className="cadre mb-4 p-4 sm:p-5">
      <ul className="grid gap-4">
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
    </div>
  );
}
