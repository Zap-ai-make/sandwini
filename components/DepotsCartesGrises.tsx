"use client";

import { CarteFiltre } from "@/components/patrons/CarteFiltre";
import type { DepotCarteGrise } from "@/lib/domain/depots-carte-grise";
import { formaterDateCourte, formaterNombre } from "@/lib/domain/format";

/**
 * Les lots de cartes grises, en bandeau au-dessus du classeur (6 novembre 2026).
 *
 * « Le tableau de carte grise doit être intuitif comme celui des arrivages :
 * on voit combien est reçu, ce qui reste, le total pris, avec une barre de
 * progression » (31 octobre). Puis : « c'est comme s'il y avait deux pages,
 * tout devrait être imbriqué ». Chaque carte garde la barre et les nombres du
 * lot, et **un clic filtre le classeur sur place** ; un second clic, ou
 * « Tous les lots », le rend entier. Rien ne change de page.
 *
 * Un bandeau et non un tableau : le classeur reste sous les yeux, et la
 * rangée se fait défiler sur le côté quand les lots s'accumulent.
 */
export function DepotsCartesGrises({
  depots,
  total,
  choisi,
  choisir,
}: {
  depots: readonly DepotCarteGrise[];
  /** Tous les dossiers du périmètre, pour la carte « Tous les lots ». */
  total: number;
  choisi: string | null;
  choisir: (lot: string | null) => void;
}) {
  if (depots.length === 0) return null;

  return (
    <div role="group" aria-label="Filtrer par lot" className="mt-6 flex gap-2 overflow-x-auto pb-1">
      <CarteFiltre actif={choisi === null} choisir={() => choisir(null)}>
        <span className="block font-medium text-encre">Tous les lots</span>
        <span className="block font-code text-legende tabular-nums text-encre-doux">
          {formaterNombre(total)}
        </span>
      </CarteFiltre>

      {depots.map((depot) => (
        <CarteFiltre
          key={depot.cle}
          actif={choisi === depot.cle}
          choisir={() => choisir(choisi === depot.cle ? null : depot.cle)}
        >
          <span className="block truncate font-medium text-encre">
            {depot.prestataireNom || "Prestataire non noté"}
          </span>
          <span className="block text-legende text-encre-doux">
            {depot.deposeLe ? formaterDateCourte(depot.deposeLe) : "Date non notée"}
          </span>
          <BarreRetour depot={depot} />
        </CarteFiltre>
      ))}
    </div>
  );
}

/**
 * La barre du retour : la part revenue du lot.
 *
 * Le même dessin que l'écoulement d'un arrivage (`BarreEcoulement`) : la piste,
 * la part pleine en vert, et les nombres dessous — une longueur se compare,
 * elle ne se lit pas.
 */
function BarreRetour({ depot }: { depot: DepotCarteGrise }) {
  const part = depot.pris === 0 ? 0 : Math.round((depot.recus / depot.pris) * 100);
  return (
    <span className="mt-2 block">
      <span className="block h-1.5 overflow-hidden rounded-full bg-fond">
        <span
          className="block h-full rounded-full"
          style={{ width: `${part}%`, background: "var(--color-solde)" }}
        />
      </span>
      <span className="mt-1 flex items-baseline justify-between gap-2 text-legende">
        <span className="font-code tabular-nums text-encre">
          {formaterNombre(depot.recus)} / {formaterNombre(depot.pris)}
        </span>
        {depot.restent > 0 && (
          <span className="text-alerte">{formaterNombre(depot.restent)} dehors</span>
        )}
      </span>
    </span>
  );
}
