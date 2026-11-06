"use client";

import { CarteFiltre } from "@/components/patrons/CarteFiltre";
import { formaterNombre } from "@/lib/domain/format";
import type { CompteBoutique } from "@/lib/domain/repartition";

/**
 * Le stock de chaque boutique, en cases (6 novembre 2026).
 *
 * Remplace la répartition par marque sur « Toutes les boutiques » : le
 * responsable qui ouvre le stock de l'entreprise demande d'abord où sont les
 * motos. **Une case se presse et filtre le tableau sur ce magasin**, comme la
 * liste « Boutique » à côté des filtres — les deux tiennent le même filtre,
 * l'une le montre, l'autre se choisit au clavier.
 *
 * Les nombres suivent la recherche, la marque et le modèle, mais pas la
 * boutique choisie : filtrer « Yamaha » dit combien chaque magasin en a, et
 * choisir un magasin ne fait pas tomber les autres cases à zéro.
 */
export function StockParBoutique({
  comptes,
  total,
  choisie,
  choisir,
}: {
  comptes: readonly CompteBoutique[];
  total: number;
  /** Vide : toutes. */
  choisie: string;
  choisir: (boutiqueId: string) => void;
}) {
  if (comptes.length === 0) return null;

  return (
    <div role="group" aria-label="Stock par boutique" className="mb-4 flex flex-wrap gap-2">
      <CarteFiltre actif={choisie === ""} choisir={() => choisir("")}>
        <Case nom="Toutes les boutiques" compte={total} />
      </CarteFiltre>
      {comptes.map((boutique) => (
        <CarteFiltre
          key={boutique.boutiqueId}
          actif={choisie === boutique.boutiqueId}
          choisir={() => choisir(choisie === boutique.boutiqueId ? "" : boutique.boutiqueId)}
        >
          <Case nom={boutique.nom} compte={boutique.compte} />
        </CarteFiltre>
      ))}
    </div>
  );
}

function Case({ nom, compte }: { nom: string; compte: number }) {
  return (
    <>
      <span className="block truncate font-medium text-encre">{nom}</span>
      <span className="mt-1 block font-code text-bloc font-bold tabular-nums text-encre">
        {formaterNombre(compte)}
      </span>
    </>
  );
}
