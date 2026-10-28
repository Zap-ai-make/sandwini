"use client";

import { nomDeBoutique } from "@/lib/domain/boutique";
import { usePerimetre } from "@/lib/perimetre/perimetre";

/**
 * La plaque jaune d'une boutique, dans une ligne de tableau (29 octobre 2026).
 *
 * Elle portait le code — « SDO » — que personne ne lit au comptoir ; le
 * commanditaire y veut le nom. Elle le lit elle-même dans le périmètre : chaque
 * tableau n'a ainsi qu'à lui passer l'identifiant que porte sa ligne. Le nom ne
 * se coupe pas : une plaque cassée en deux lignes ne se lit plus d'un coup
 * d'œil.
 */
export function PlaqueBoutique({ boutiqueId }: { boutiqueId: string }) {
  const { boutiques } = usePerimetre();
  return (
    <span className="inline-block whitespace-nowrap rounded-plaque border border-plaque-bord bg-plaque px-1.5 py-0.5 text-legende font-medium leading-none text-encre-fixe">
      {nomDeBoutique(boutiques, boutiqueId)}
    </span>
  );
}
