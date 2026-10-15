"use client";

import { useMemo } from "react";
import { Chiffre } from "@/components/patrons/Chiffre";
import { resumerJournee, type Mouvement } from "@/lib/domain/caisse";
import { formaterMontant, formaterNombre } from "@/lib/domain/format";
import { LIBELLE_MOYEN } from "@/lib/domain/vente";

/**
 * Le compte d'une période de caisse (S55, `c2:151-166`).
 *
 * **Le journal ne disait jamais combien.** Six mouvements, cinq colonnes, et
 * aucun total nulle part : le gérant lisait sa journée ligne à ligne sans
 * qu'elle s'additionne. Le calcul existait pourtant — `resumerJournee` est
 * écrit et prouvé depuis S22 — mais il avait perdu son appelant quand la
 * clôture a quitté l'écran (D87). L'amputation avait emporté un morceau de
 * trop : un résumé n'est pas une clôture. L'un **affirme** ce que quelqu'un a
 * compté dans le meuble, l'autre se contente d'**additionner** ce qui est déjà
 * écrit. Le premier demandait un geste que le commanditaire a refusé ; le
 * second ne demande rien à personne.
 *
 * **Le tiroir et le reste ne se mélangent pas, et c'est le cœur du bloc.** Sur
 * une journée à 875 000 encaissés, 275 000 vivent sur Orange Money et Moov
 * Money : ils ne sont pas dans le meuble et n'y seront jamais. Un total unique
 * annoncerait un montant que personne ne peut aller vérifier. Le premier
 * devoir d'un livre de caisse est de dire **où** est l'argent.
 *
 * **Ce bloc ne prétend pas dire ce qu'il y a dans le tiroir**, et la nuance
 * n'est pas de la prudence d'écriture. Il n'existe pas de fonds d'ouverture :
 * personne ne compte le tiroir le matin, donc rien ne dit avec quoi la journée
 * a commencé. Ce qui se calcule honnêtement est le **mouvement du jour** —
 * entré moins sorti — et c'est ce que le titre annonce. Annoncer un solde de
 * tiroir à partir de zéro serait faux dès la deuxième journée.
 */
export function ResumeCaisse({
  mouvements,
  intitule,
  agrege = false,
}: {
  mouvements: readonly Mouvement[];
  /** « octobre 2026 », « 13/10/26 » — ce que la période affichée recouvre. */
  intitule: string;
  /**
   * Vrai en vue entreprise : plusieurs tiroirs, et les phrases se mettent au
   * pluriel. Le calcul, lui, ne change pas — c'est la même somme d'espèces
   * entrées moins sorties, et c'est précisément pourquoi le superviseur lit
   * désormais ce bloc plutôt qu'un tableau à part : deux rendus du même chiffre
   * finissent toujours par se contredire.
   */
  agrege?: boolean;
}) {
  /* Aucun fonds d'ouverture : il n'y a pas de clôture, donc rien n'affirme ce
     que valait le tiroir hier soir. Zéro n'est pas une approximation, c'est le
     point de départ exact du seul calcul que les données permettent. */
  const resume = useMemo(() => resumerJournee(0, mouvements), [mouvements]);

  if (resume.nombreMouvements === 0) return null;

  return (
    <section aria-labelledby="titre-compte-du-jour" className="mb-6">
      <h2 id="titre-compte-du-jour" className="mb-3 text-bloc font-bold tracking-tight text-encre">
        Le compte de la période
      </h2>

      <div className="cadre p-4 sm:p-5">
        <p className="text-legende font-bold tracking-[0.07em] text-encre-doux uppercase">
          {agrege ? "Mouvement des tiroirs" : "Mouvement du tiroir"}
        </p>
        <p className="mt-1 font-code text-chiffre leading-tight tabular-nums text-encre">
          <Chiffre valeur={formaterMontant(resume.especesAttendues)} />
        </p>
        <p className="text-legende text-encre-doux">
          Entré en espèces sur {intitule.toLowerCase()}, moins ce qui en est sorti.{" "}
          {agrege
            ? "Ce n’est pas le contenu des tiroirs : personne ne les a comptés."
            : "Ce n’est pas le contenu du tiroir : personne ne l’a compté."}
        </p>

        <dl className="mt-4 grid gap-2 border-t border-bord pt-4">
          <Ligne terme="Encaissé en espèces" valeur={`+ ${formaterNombre(resume.especesEncaissees)}`} />
          {/* **Le total des sorties, et rien de plus (S55).** Le détail par
              poste a quitté cet écran : « dans la caisse c'est juste le montant
              total qui doit figurer ». Où l'argent est parti se lit dans
              « Dépenses », qui porte aussi la saisie et l'historique. */}
          <Ligne
            terme={agrege ? "Sorti des tiroirs" : "Sorti du tiroir"}
            valeur={`− ${formaterNombre(resume.sortiesEspeces)}`}
            alerte={resume.sortiesEspeces > 0}
          />
        </dl>

        {/* Les moyens qui n'ont pas bougé ne sont pas listés à zéro : une ligne
            « Wave 0 » dans une boutique qui n'accepte pas Wave est du bruit, et
            D63 vaut ici comme ailleurs. `resumerJournee` les a déjà écartés. */}
        {resume.parMoyenMobile.length > 0 && (
          <>
            <p className="mt-5 border-t border-bord pt-4 text-legende font-bold tracking-[0.07em] text-encre-doux uppercase">
              Encaissé hors du tiroir
            </p>
            <dl className="mt-2 grid gap-2">
              {resume.parMoyenMobile.map((part) => (
                <Ligne
                  key={part.moyen}
                  terme={LIBELLE_MOYEN[part.moyen]}
                  valeur={formaterNombre(part.montant)}
                />
              ))}
            </dl>
            <p className="mt-2 text-legende text-encre-doux">
              Cet argent est sur un compte mobile. Il compte dans la recette, jamais dans le
              meuble.
            </p>
          </>
        )}

      </div>
    </section>
  );
}

function Ligne({ terme, valeur, alerte }: { terme: string; valeur: string; alerte?: boolean }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-3">
      <dt className="text-corps text-encre">{terme}</dt>
      <dd className={`font-code text-corps tabular-nums ${alerte ? "text-alerte" : "text-encre"}`}>
        {valeur}
      </dd>
    </div>
  );
}
