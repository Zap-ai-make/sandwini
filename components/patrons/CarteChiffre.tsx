import type { ReactNode } from "react";
import { Chiffre } from "@/components/patrons/Chiffre";
import { formaterNombre } from "@/lib/domain/format";

/**
 * Une carte de tête : un nom en capitales, un nombre en gros (S43).
 *
 * Née pour les arrivages, reprise par le stock le 9 novembre 2026 — « fais
 * les mêmes cartes que celles de l'arrivage ». Un seul dessin, pour que l'œil
 * lise les deux écrans de la même façon. La couleur double le mot, elle ne le
 * remplace pas.
 */
export function CarteChiffre({
  nom,
  valeur,
  couleur = "var(--color-encre)",
  suffixe,
}: {
  nom: string;
  valeur: number;
  couleur?: string;
  /** Ce qui suit le nom sur sa ligne — le chevron d'une carte qui s'ouvre. */
  suffixe?: ReactNode;
}) {
  return (
    <>
      <p className="flex items-center justify-between gap-2 text-legende font-bold tracking-[0.07em] text-encre-doux uppercase">
        {nom}
        {suffixe}
      </p>
      <p className="mt-1 font-code text-chiffre leading-tight tabular-nums" style={{ color: couleur }}>
        <Chiffre valeur={formaterNombre(valeur)} />
      </p>
    </>
  );
}
