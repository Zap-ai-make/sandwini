"use client";

import { X } from "lucide-react";
import { LONGUEUR_CHASSIS_MAX, LONGUEUR_TEXTE_MAX } from "@/lib/domain/moto";
import type { LigneLot } from "@/lib/domain/arrivage";

/**
 * Les motos d'un groupe du lot, une ligne numérotée par moto.
 *
 * Marque, modèle et prix sont communs au groupe — renseignés en tête (S42). Il
 * ne reste donc à saisir, ligne à ligne, que ce qui distingue une moto de sa
 * voisine : son numéro de châssis, et sa couleur. Le nombre de lignes est piloté
 * par le champ « Nombre de motos », au-dessus ; on ne les ajoute pas une à une.
 *
 * `numeroDepart` décale la numérotation : les motos se comptent en continu d'un
 * groupe à l'autre, si bien que chaque champ châssis garde un libellé unique
 * même quand plusieurs marques se suivent.
 *
 * **Chaque ligne se retire** (15 novembre 2026) : « on doit pouvoir supprimer
 * chaque ligne ». Réduire le nombre coupait par le bas, et un châssis en double
 * au milieu de 115 obligeait à tout décaler à la main. La croix manque à une
 * ligne seule : c'est alors le groupe qu'on retire.
 *
 * **Sa colonne reste collée au bord droit** (`sticky`). Sur téléphone, châssis
 * et couleur ne tiennent pas ensemble dans la largeur : le tableau défile, et
 * une croix partie avec la couleur hors de l'écran serait une croix absente.
 */
export function SaisieLotMotos({
  lignes,
  setLignes,
  retirer,
  numeroDepart = 0,
}: {
  lignes: LigneLot[];
  setLignes: (lignes: LigneLot[]) => void;
  /** Retire la ligne de ce rang ; le groupe tient son nombre à jour. */
  retirer: (index: number) => void;
  numeroDepart?: number;
}) {
  const retirable = lignes.length > 1;

  const changerLigne = (index: number, partie: Partial<LigneLot>) =>
    setLignes(lignes.map((ligne, i) => (i === index ? { ...ligne, ...partie } : ligne)));

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="text-left text-encre-doux">
            <th className="w-10 p-2 font-medium">
              <span className="sr-only">Numéro</span>#
            </th>
            <th className="p-2 font-medium">
              N° châssis <span className="text-alerte">*</span>
            </th>
            <th className="p-2 font-medium">Couleur</th>
            <th className="sticky right-0 w-10 bg-papier p-2">
              <span className="sr-only">Retirer</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {lignes.map((ligne, index) => (
            <tr key={index} className="border-t border-bord">
              <td className="p-2 text-right font-code text-encre-doux tabular-nums">
                {numeroDepart + index + 1}
              </td>
              <td className="p-1.5">
                <input
                  aria-label={`Numéro de châssis, moto ${numeroDepart + index + 1}`}
                  value={ligne.numeroChassis}
                  maxLength={LONGUEUR_CHASSIS_MAX + 8}
                  autoCapitalize="characters"
                  autoComplete="off"
                  onChange={(evenement) => changerLigne(index, { numeroChassis: evenement.target.value })}
                  className="plaque-code saisie w-full min-w-44"
                />
              </td>
              <td className="p-1.5">
                <input
                  aria-label={`Couleur, moto ${numeroDepart + index + 1}`}
                  value={ligne.couleur}
                  maxLength={LONGUEUR_TEXTE_MAX}
                  onChange={(evenement) => changerLigne(index, { couleur: evenement.target.value })}
                  className="saisie w-full min-w-32"
                />
              </td>
              <td className="sticky right-0 bg-papier p-1.5">
                {retirable && (
                  <button
                    type="button"
                    onClick={() => retirer(index)}
                    aria-label={`Retirer la moto ${numeroDepart + index + 1}`}
                    className="bouton bouton-discret px-2 py-1"
                  >
                    <X aria-hidden="true" className="size-4" />
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
