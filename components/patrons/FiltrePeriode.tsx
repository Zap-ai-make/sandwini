"use client";

import { useId } from "react";
import {
  LIBELLE_PERIODE,
  PERIODES,
  plageInversee,
  type Periode,
  type PlagePeriode,
} from "@/lib/domain/periode";

/**
 * Le choix d'une période, posé au-dessus d'une liste (S46).
 *
 * **Quatre puces et une plage libre.** Les puces couvrent le geste qu'on répète
 * — « ce mois-ci » se demande tous les jours — et la plage couvre le reste sans
 * qu'il faille inventer une puce par découpage imaginable (un trimestre, une
 * quinzaine, la semaine du marché). Elles reprennent la classe `.filtre` déjà
 * posée à côté des statuts : deux rangées de pastilles qui ne se ressemblent
 * pas se liraient comme deux mécanismes différents.
 *
 * **Les deux dates ne paraissent que si on les demande.** Posées en
 * permanence, elles occuperaient la largeur d'un téléphone pour un geste rare,
 * et deux champs vides sous quatre puces se lisent comme un filtre à remplir.
 *
 * `<input type="date">` natif, comme la Caisse et les Reçus : le sélecteur du
 * téléphone est celui que la personne connaît déjà, il fonctionne au clavier,
 * il se traduit tout seul, et il ne coûte pas une dépendance (règle 1).
 */
export function FiltrePeriode({
  periode,
  changer,
  plage,
  changerPlage,
  className = "",
}: {
  periode: Periode;
  changer: (periode: Periode) => void;
  plage: PlagePeriode;
  changerPlage: (plage: PlagePeriode) => void;
  className?: string;
}) {
  const identifiant = useId();
  const inversee = plageInversee(periode, plage);

  return (
    <div className={className}>
      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Filtrer par période">
        {PERIODES.map((valeur) => (
          <button
            key={valeur}
            type="button"
            className="filtre"
            aria-pressed={periode === valeur}
            onClick={() => changer(valeur)}
          >
            {LIBELLE_PERIODE[valeur]}
          </button>
        ))}
      </div>

      {periode === "personnalise" && (
        <div className="mt-2 flex flex-wrap items-end gap-3">
          <div className="champ">
            <label htmlFor={`${identifiant}-depuis`} className="block text-sm font-medium text-encre">
              Du
            </label>
            <input
              id={`${identifiant}-depuis`}
              type="date"
              className="saisie mt-1 h-11 w-auto lg:h-9"
              value={plage.depuis}
              onChange={(evenement) => changerPlage({ ...plage, depuis: evenement.target.value })}
            />
          </div>
          <div className="champ">
            <label htmlFor={`${identifiant}-jusqua`} className="block text-sm font-medium text-encre">
              Au
            </label>
            <input
              id={`${identifiant}-jusqua`}
              type="date"
              className="saisie mt-1 h-11 w-auto lg:h-9"
              value={plage.jusqua}
              onChange={(evenement) => changerPlage({ ...plage, jusqua: evenement.target.value })}
            />
          </div>
          {/* Une liste vide se lit comme une panne. Ici elle a une cause, et la
              cause tient en une phrase — on la donne plutôt que de remettre les
              deux dates dans l'ordre à la place de qui les a saisies. */}
          {inversee && (
            <p role="status" className="text-corps text-alerte">
              La date de fin précède la date de début&nbsp;: aucune ligne ne peut s’y trouver.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
