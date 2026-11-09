"use client";

import { ChevronDown } from "lucide-react";
import { CarteChiffre } from "@/components/patrons/CarteChiffre";
import type { BilanStock } from "@/lib/domain/repartition";

/**
 * Les cinq cartes de tête du stock (9 novembre 2026).
 *
 * « Fais les mêmes cartes que celles de l'arrivage : nombre de motos en stock,
 * vendues, marques… » Même dessin, même grille (`CarteChiffre`). Elles comptent
 * ce que les filtres laissent : choisir une boutique ou une marque change les
 * nombres, comme le tableau en dessous.
 *
 * **La carte « Marques » s'ouvre sur la répartition par marque**, qui était un
 * bloc replié à part. Le nombre de marques est la question ; le détail par
 * marque et par modèle est sa suite, au même endroit. Un bouton qui dit s'il
 * est ouvert (`aria-expanded`), et un chevron qui pivote pour l'œil.
 */
export function CartesStock({
  bilan,
  repartitionOuverte,
  basculerRepartition,
  repartitionId,
}: {
  bilan: BilanStock;
  repartitionOuverte: boolean;
  basculerRepartition: () => void;
  /** L'identifiant du bloc que la carte « Marques » ouvre. */
  repartitionId: string;
}) {
  return (
    <div className="mb-4 grid gap-3 sm:grid-cols-3 xl:grid-cols-5">
      <div className="cadre p-4">
        <CarteChiffre nom="Motos" valeur={bilan.motos} />
      </div>
      <div className="cadre p-4">
        <CarteChiffre nom="En stock" valeur={bilan.enStock} />
      </div>
      <div className="cadre p-4">
        <CarteChiffre nom="Vendues" valeur={bilan.vendues} couleur="var(--color-solde)" />
      </div>
      <button
        type="button"
        onClick={basculerRepartition}
        aria-expanded={repartitionOuverte}
        aria-controls={repartitionId}
        className={[
          "cadre p-4 text-left hover:bg-survol",
          "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-encre",
          repartitionOuverte ? "border-encre" : "",
        ].join(" ")}
      >
        <CarteChiffre
          nom="Marques"
          valeur={bilan.marques}
          suffixe={
            <ChevronDown
              aria-hidden="true"
              className={`size-4 shrink-0 transition-transform ${repartitionOuverte ? "rotate-180" : ""}`}
            />
          }
        />
      </button>
      <div className="cadre p-4">
        <CarteChiffre
          nom="CMC manquants"
          valeur={bilan.cmcManquants}
          couleur="var(--color-alerte)"
        />
      </div>
    </div>
  );
}
