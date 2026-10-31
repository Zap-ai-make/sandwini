"use client";

import { ChevronDown, ChevronRight } from "lucide-react";
import { useState } from "react";
import { Avis } from "@/components/patrons/Avis";
import { compter, formaterDateCourte, formaterMontant } from "@/lib/domain/format";
import type { CartePartie, Depart } from "@/lib/domain/paquet";
import { numeroLisible } from "@/lib/domain/numerotation";

/**
 * Tout ce qui est parti chez un prestataire (20 octobre 2026).
 *
 * **La demande du client, mot pour mot : « historiques de tout ce qui est
 * parti, chez qui, avance prise, date prise et retour ».** Le produit n'en
 * montrait que la part vivante — les paquets encore dehors, qui disparaissent
 * à la dernière carte revenue. Le travail s'effaçait donc au moment même où il
 * se terminait, et « qu'a-t-on confié à Ouédraogo cette année, et combien lui
 * a-t-on avancé » n'avait aucun écran pour répondre.
 *
 * **Une ligne par départ, et non par carte.** C'est ainsi que l'argent a
 * bougé : on tend dix cartes et on verse une avance. Dix lignes à 15 000 pour
 * un billet de 150 000 feraient croire à dix décisions — c'est déjà la raison
 * pour laquelle la caisse n'enregistre qu'une sortie. Le détail des pièces est
 * là, en dépliant, pour la question d'après.
 *
 * **Le plus récent en tête**, à l'inverse de la file des dossiers : une file se
 * vide par le bas, un historique se lit par le haut.
 */
export function HistoriqueDesDeparts({
  departs,
  sansRetours,
}: {
  departs: readonly Depart[] | null;
  /** Le journal des passages n'a pas pu être lu : les dates de retour manquent. */
  sansRetours?: boolean;
}) {
  const [deplie, setDeplie] = useState<string | null>(null);

  /* Tant que la lecture n'a pas répondu, on ne dit rien : « rien n'est jamais
     parti » sur une base qui n'a pas encore parlé est le contraire de ce qu'on
     vient chercher (D95). */
  if (departs === null) {
    return <p className="text-corps text-encre-doux">Lecture de l’historique…</p>;
  }

  if (departs.length === 0) {
    return (
      null
    );
  }

  return (
    <div>
      {/* **Le dire plutôt que d'afficher des blancs.** Une colonne vide se lit
          « jamais revenue », ce qui est faux et se recopierait dans un appel au
          prestataire. */}
      {sansRetours && (
        <Avis ton="alerte" titre="Les dates de retour n’ont pas pu être lues" className="mb-3" />
      )}


      <ul className="cadre cadre-liste">
        {departs.map((depart) => (
          <li key={depart.cle} className="px-4 py-3">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
              <button
                type="button"
                onClick={() => setDeplie(deplie === depart.cle ? null : depart.cle)}
                aria-expanded={deplie === depart.cle}
                className="inline-flex items-center gap-1.5 font-medium text-encre"
              >
                {deplie === depart.cle ? (
                  <ChevronDown aria-hidden="true" className="size-4" />
                ) : (
                  <ChevronRight aria-hidden="true" className="size-4" />
                )}
                {depart.prestataireNom}
              </button>

              {/* Jamais la couleur seule : l’état est écrit (`DESIGN.md` §5). */}
              <Etat depart={depart} />
            </div>

            <p className="mt-0.5 text-legende text-encre-doux">
              {depart.deposeLe
                ? `Déposé le ${formaterDateCourte(depart.deposeLe)}`
                : "Date de dépôt inconnue"}
              {" · "}
              {compter(depart.cartes.length, "carte grise", "cartes grises")}
              {" · "}
              avance {formaterMontant(depart.avance)}
              {depart.disponibleLe && ` · annoncé le ${formaterDateCourte(depart.disponibleLe)}`}
            </p>

            {deplie === depart.cle && (
              <ul className="mt-2">
                {depart.cartes.map((carte) => (
                  <li
                    key={carte.dossierId}
                    className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 py-1"
                  >
                    <span className="plaque-code shrink-0 text-legende text-encre">
                      {numeroLisible(carte.numero)}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-legende text-encre-doux">
                      {carte.client}
                    </span>
                    <span className="shrink-0 text-legende text-encre-doux">
                      {retourDe(carte)}
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

/**
 * Où en est ce départ, en toutes lettres.
 *
 * **Une date de retour ne s’affiche que sur un départ entièrement rendu.**
 * Posée sur un paquet dont trois cartes manquent, elle se recopierait dans une
 * discussion avec le client pour une carte qui n’est pas là.
 */
function Etat({ depart }: { depart: Depart }) {
  if (depart.dehors === 0) {
    return (
      <span className="text-solde">
        {depart.soldeLe
          ? `Rendu le ${formaterDateCourte(depart.soldeLe)}`
          : /* Plus rien dehors, mais aucun passage daté : un dossier d’avant
               le journal, ou une carte écartée. On dit ce qu’on sait. */
            "Rendu"}
      </span>
    );
  }

  return (
    <span className={depart.enRetard ? "font-semibold text-alerte" : "text-encre-doux"}>
      {depart.dehors} dehors sur {depart.cartes.length}
      {depart.enRetard && " · en retard"}
    </span>
  );
}

/** Ce qu’on sait du retour d’une carte : une date, ou l’endroit où elle est. */
function retourDe(carte: CartePartie): string {
  if (carte.dehors) return "encore dehors";
  if (carte.revenueLe) return `revenue le ${formaterDateCourte(carte.revenueLe)}`;
  /* Ni dehors ni datée : revenue avant qu’on ne lise le journal, ou écartée du
     dossier. Inventer une date serait pire qu’un blanc. */
  return "revenue";
}
