"use client";

import { ChevronDown, ChevronRight } from "lucide-react";
import { useState } from "react";
import { formaterDateCourte, formaterMontant } from "@/lib/domain/format";
import { etatPaquet, type PaquetCartesGrises } from "@/lib/domain/paquet";
import type { DocumentDossier } from "@/lib/domain/vente";

/**
 * Les paquets de cartes grises encore dehors (S53).
 *
 * **Une ligne par paquet, et le détail replié.** « Ouédraogo — 2 dehors sur 2,
 * depuis 12 j » répond à la question qu'on se pose en ouvrant l'écran ; les dix
 * numéros répondent à celle d'après, et seulement si on la pose. Dix lignes
 * dépliées d'office auraient noyé la file des dossiers, qui est l'objet
 * principal de cet écran.
 *
 * **Un paquet soldé disparaît de la liste, sans qu'aucun geste ne le dise.**
 * Son solde est l'absence de carte dehors (`etatPaquet`) : il s'efface quand la
 * dernière revient, et c'est exactement ce que l'arbitrage 9 demande — « il peut
 * partir avec 10 et ramener 5 », sans rien à cocher pour le dire.
 *
 * **Le bloc disparaît entièrement quand rien n'est dehors**, plutôt que
 * d'afficher un titre suivi d'un vide. Un écran qui réserve une place à ce qui
 * n'existe pas apprend à sauter cette place du regard.
 */
export function PaquetsEnCours({
  paquets,
  documents,
  numeroDe,
}: {
  paquets: readonly PaquetCartesGrises[] | null;
  documents: readonly DocumentDossier[] | null;
  numeroDe: (venteId: string) => string;
}) {
  const [deplie, setDeplie] = useState<string | null>(null);

  /* Tant que l'une des deux écoutes n'a pas répondu, on ne dit rien : un paquet
     dont les documents manquent se lirait « 0 dehors » et disparaîtrait, ce qui
     est le contraire de ce qu'on vient chercher (D95). */
  if (paquets === null || documents === null) return null;

  const maintenant = new Date();
  const enCours = paquets
    .map((paquet) => ({ paquet, etat: etatPaquet(paquet, documents, maintenant) }))
    .filter(({ etat }) => etat.dehors > 0);

  if (enCours.length === 0) return null;

  return (
    <section className="mb-5">
      <h2 className="mb-2 text-legende font-bold tracking-[0.07em] text-encre-doux uppercase">
        Paquets chez un prestataire
      </h2>
      <ul className="cadre cadre-liste">
        {enCours.map(({ paquet, etat }) => (
          <li key={paquet.id} className="px-4 py-3">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
              <button
                type="button"
                onClick={() => setDeplie(deplie === paquet.id ? null : paquet.id)}
                aria-expanded={deplie === paquet.id}
                className="inline-flex items-center gap-1.5 font-medium text-encre"
              >
                {deplie === paquet.id ? (
                  <ChevronDown aria-hidden="true" className="size-4" />
                ) : (
                  <ChevronRight aria-hidden="true" className="size-4" />
                )}
                {paquet.prestataireNom || "un prestataire"}
              </button>

              {/* Jamais la couleur seule : « en retard » est écrit
                  (`DESIGN.md` §5). */}
              <span className={etat.enRetard ? "font-semibold text-alerte" : "text-encre-doux"}>
                {/* Le nombre dehors d'abord : c'est ce qu'on va chercher. Le
                    total vient après, pour savoir où on en est. */}
                {etat.dehors} dehors sur {etat.total}
                {etat.joursDehors !== null && ` · depuis ${etat.joursDehors} j`}
                {etat.enRetard && " · en retard"}
              </span>
            </div>

            <p className="mt-0.5 text-legende text-encre-doux">
              Avance {formaterMontant(paquet.avance)}
              {paquet.disponibleLe && ` · annoncé le ${formaterDateCourte(paquet.disponibleLe)}`}
            </p>

            {deplie === paquet.id && (
              <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
                {paquet.venteIds.map((venteId) => (
                  <li key={venteId} className="plaque-code text-legende text-encre-doux">
                    {numeroDe(venteId)}
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
