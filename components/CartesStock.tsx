"use client";

import { ChevronDown } from "lucide-react";
import type { ReactNode } from "react";
import { CarteChiffre } from "@/components/patrons/CarteChiffre";
import type { StatutMoto } from "@/lib/domain/moto";
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
 *
 * **« En stock » et « Vendues » filtrent le tableau** (15 novembre 2026) : « si
 * on clique dessus, elles doivent filtrer ». Des boutons qui se pressent
 * (`aria-pressed`) ; un second clic rend toutes les motos.
 */
export function CartesStock({
  bilan,
  statut,
  choisirStatut,
  repartitionOuverte,
  basculerRepartition,
  repartitionId,
}: {
  bilan: BilanStock;
  /** Vide : aucun statut choisi. */
  statut: StatutMoto | "";
  choisirStatut: (statut: StatutMoto | "") => void;
  repartitionOuverte: boolean;
  basculerRepartition: () => void;
  /** L'identifiant du bloc que la carte « Marques » ouvre. */
  repartitionId: string;
}) {
  const basculerStatut = (choisi: StatutMoto) => choisirStatut(statut === choisi ? "" : choisi);

  return (
    <div className="mb-4 grid gap-3 sm:grid-cols-3 xl:grid-cols-5">
      <div className="cadre p-4">
        <CarteChiffre nom="Motos" valeur={bilan.motos} />
      </div>
      <CarteBouton
        onClick={() => basculerStatut("en_stock")}
        aria-pressed={statut === "en_stock"}
        actif={statut === "en_stock"}
      >
        <CarteChiffre nom="En stock" valeur={bilan.enStock} />
      </CarteBouton>
      <CarteBouton
        onClick={() => basculerStatut("vendue")}
        aria-pressed={statut === "vendue"}
        actif={statut === "vendue"}
      >
        <CarteChiffre nom="Vendues" valeur={bilan.vendues} couleur="var(--color-solde)" />
      </CarteBouton>
      <CarteBouton
        onClick={basculerRepartition}
        aria-expanded={repartitionOuverte}
        aria-controls={repartitionId}
        actif={repartitionOuverte}
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
      </CarteBouton>
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

/** Une carte qui se presse : même cadre que ses voisines, le trait foncé quand elle est choisie. */
function CarteBouton({
  actif,
  children,
  ...attributs
}: {
  actif: boolean;
  children: ReactNode;
  onClick: () => void;
  "aria-pressed"?: boolean;
  "aria-expanded"?: boolean;
  "aria-controls"?: string;
}) {
  return (
    <button
      type="button"
      {...attributs}
      className={[
        "cadre p-4 text-left hover:bg-survol",
        "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-encre",
        actif ? "border-encre" : "",
      ].join(" ")}
    >
      {children}
    </button>
  );
}
