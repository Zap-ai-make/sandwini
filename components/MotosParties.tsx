"use client";

import { useCallback } from "react";
import { formaterDate } from "@/lib/domain/format";
import { useAbonnement } from "@/lib/repositories/abonnement";
import { ecouterDeparts } from "@/lib/repositories/transferts";
import type { Transfert } from "@/lib/domain/transfert";

/**
 * Les motos parties de cette boutique (S17).
 *
 * **Pourquoi ce bloc existe.** Un déplacement se fait en un seul geste : la
 * moto quitte le stock de la boutique d'origine à l'instant même, et celle-ci
 * perd le droit de l'ouvrir. Sans ce bloc, une moto disparaîtrait de la liste
 * sans explication — exactement ce qui fait douter d'un logiciel. Le gérant doit
 * pouvoir répondre à « où est passée la Yamaha rouge ? » sans appeler personne.
 *
 * **Replié par défaut, et absent quand il n'y a rien.** C'est une question qu'on
 * se pose de temps en temps, pas un chiffre qu'on surveille : déplié en
 * permanence, il pousserait le stock vers le bas tous les jours pour servir une
 * fois par mois. Même patron que `RepartitionStock` (S50).
 *
 * **Rien ici pour le responsable sur « Toutes les boutiques ».** Une moto
 * déplacée entre deux de ses boutiques n'est partie de nulle part de son point
 * de vue : elle est toujours dans son stock. Lui montrer des départs l'inviterait
 * à les compter comme des pertes.
 */
export function MotosParties({ boutiqueId }: { boutiqueId: string | null }) {
  const souscrire = useCallback(
    (auChangement: (transferts: Transfert[]) => void, enErreur: (cause: unknown) => void) =>
      boutiqueId
        ? ecouterDeparts(boutiqueId, auChangement, enErreur)
        : (() => {
            auChangement([]);
            return () => {};
          })(),
    [boutiqueId],
  );
  const { valeur: departs } = useAbonnement(
    souscrire,
    "Les départs n’ont pas pu être chargés.",
  );

  /* Ni pendant la lecture, ni quand il n'y a rien : un bloc vide sur un écran
     de stock ne dit rien que l'absence ne dise déjà mieux. L'erreur n'est pas
     affichée non plus — elle ferait un encadré rouge au milieu d'un stock qui,
     lui, s'est chargé. */
  if (!boutiqueId || departs === null || departs.length === 0) return null;

  return (
    <details className="cadre mb-4 p-4 sm:p-5">
      <summary className="cursor-pointer text-corps font-medium text-encre">
        Motos parties d’ici{" "}
        <span className="font-normal text-encre-doux">({departs.length})</span>
      </summary>

      <ul className="mt-3 space-y-2">
        {departs.map((depart) => (
          <li key={depart.id} className="flex flex-wrap items-baseline gap-x-2 text-corps">
            <span className="font-code text-encre">{depart.numeroChassis}</span>
            <span className="text-encre-doux">
              vers <span className="plaque-code">{depart.versBoutiqueId}</span>
            </span>
            <span className="text-legende text-encre-doux">
              {/* Une date absente veut dire « saisi à l'instant, pas encore
                  parvenu au serveur » — et non « sans date » (D82). */}
              {depart.date ? formaterDate(depart.date) : "à l’instant"}
              {depart.auteur && ` · ${depart.auteur}`}
            </span>
            {depart.motif && (
              <span className="w-full text-legende text-encre-doux">{depart.motif}</span>
            )}
          </li>
        ))}
      </ul>
    </details>
  );
}
