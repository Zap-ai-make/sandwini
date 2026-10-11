"use client";

import { useMemo, useState } from "react";
import { FiltrePeriode } from "@/components/patrons/FiltrePeriode";
import { formaterMontant, formaterNombre } from "@/lib/domain/format";
import { chiffresDeLaPeriode } from "@/lib/domain/periode-chiffres";
import {
  PLAGE_VIDE,
  bornesPeriode,
  libellePeriode,
  plageInversee,
  type Periode,
  type PlagePeriode,
} from "@/lib/domain/periode";
import type { Vente } from "@/lib/domain/vente";

/**
 * Le bilan d'une période (S50).
 *
 * Demandé ainsi : « inventaire filtrable par date, faisant ressortir : nombre
 * de motos vendues, montant, crédit dehors, encaissé sur tranches, et le
 * restant ».
 *
 * **Ce bloc est au-dessus des cartes du mois, et il a sa propre période.** Les
 * cartes du mois répondent à « où en est septembre » ; celui-ci répond à « et
 * sur l'intervalle que je choisis ». Les faire partager un seul sélecteur
 * aurait obligé l'un des deux à mentir sur ce qu'il montre.
 *
 * **Deux groupes, et un filet entre eux.** Crédit et tranches ne sont pas deux
 * variantes d'une même chose : dans un cas la moto est partie et le client doit
 * de l'argent, dans l'autre la moto dort au magasin qui détient l'argent du
 * client. `AGENTS.md` appelle leur confusion la plus coûteuse du projet. La
 * mise en page les sépare donc visiblement, et aucun total ne les réunit —
 * parce qu'un tel total ne désignerait rien.
 */
export function BilanPeriode({ ventes }: { ventes: Vente[] }) {
  /* « personnalise » d'emblée, et une plage vide ne borne rien : le bloc
     s'ouvre donc sur TOUT, et les deux dates sont là pour resserrer. Les
     puces sont parties (S54) — l'écran porte déjà un sélecteur de mois. */
  const [periode, setPeriode] = useState<Periode>("personnalise");
  const [plage, setPlage] = useState<PlagePeriode>(PLAGE_VIDE);

  const maintenant = useMemo(() => new Date(), []);
  const bornes = useMemo(
    () => bornesPeriode(periode, maintenant, plage),
    [periode, maintenant, plage],
  );
  const chiffres = useMemo(() => chiffresDeLaPeriode(bornes, ventes), [bornes, ventes]);

  const intitule = libellePeriode(periode, maintenant, plage);
  const inversee = plageInversee(periode, plage);

  return (
    <section aria-labelledby="bilan-periode" className="mb-8">
      <h2 id="bilan-periode" className="mb-3 text-bloc font-bold tracking-tight text-encre">
        Bilan de la période
      </h2>

      <FiltrePeriode
        periode={periode}
        changer={setPeriode}
        plage={plage}
        changerPlage={setPlage}
        seulementPlage
        className="mb-4"
      />

      {inversee ? null : chiffres.vide ? (
        /* Une phrase, pas cinq zéros alignés : D63. Cinq zéros se lisent comme
           un résultat, alors qu'il n'y a simplement rien dans l'intervalle. */
        <p className="cadre p-4 text-corps text-encre-doux sm:p-5">
          Aucune vente {intitule ? `pour ${intitule.toLowerCase()}` : "enregistrée"}.
        </p>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            <Carte
              nom="Motos vendues"
              valeur={formaterNombre(chiffres.motosVendues)}
              detail={intitule ?? "Toutes périodes"}
            />
            <Carte
              nom="Montant"
              valeur={formaterMontant(chiffres.montant)}
              detail="Ce qui a été convenu, pas ce qui est rentré"
            />
          </div>

          {/*
            Deux groupes, et le filet entre eux porte toute la prudence (S54).

            Le commanditaire voulait « le montant total de l'argent dehors ».
            Le refus d'un total datait d'une mise en page où les trois cartes
            étaient alignées : additionner ce qu'on ATTEND avec ce qu'on
            DÉTIENT ne désigne rien, et quatre cartes côte à côte y invitent.

            Le total devient juste dès lors que les deux natures sont rangées à
            part. Ici, sous « ce qui reste à percevoir », tous les termes vont
            dans le même sens — ce sont des dettes de clients. L'argent détenu
            est descendu sous le filet, seul, et aucun total ne le touche.
          */}
          <h3 className="mt-6 mb-3 border-t border-bord pt-4 text-legende font-bold tracking-[0.07em] text-encre-doux uppercase">
            Ce qui reste à percevoir — l’argent dehors
          </h3>
          <div className="grid gap-4 sm:grid-cols-3">
            <Carte
              nom="Total dehors"
              valeur={formaterMontant(chiffres.resteAPercevoir)}
              detail="Tout ce que les clients doivent encore"
            />
            <Carte
              nom="Crédit dehors"
              valeur={formaterMontant(chiffres.creditDehors)}
              detail="La moto est partie, le client doit"
            />
            <Carte
              nom="Reste sur tranches"
              valeur={formaterMontant(chiffres.resteSurTranches)}
              detail="La moto est au magasin, il manque encore ceci"
            />
          </div>

          <h3 className="mt-6 mb-3 border-t border-bord pt-4 text-legende font-bold tracking-[0.07em] text-encre-doux uppercase">
            Ce que le magasin détient — n’entre dans aucun total ci-dessus
          </h3>
          <div className="grid gap-4 sm:grid-cols-3">
            <Carte
              nom="Encaissé sur tranches"
              valeur={formaterMontant(chiffres.encaisseSurTranches)}
              detail="L’argent des clients, gardé contre une moto qui n’est pas partie"
            />
          </div>
        </>
      )}
    </section>
  );
}

function Carte({ nom, valeur, detail }: { nom: string; valeur: string; detail: string }) {
  return (
    <div className="cadre p-4 sm:p-5">
      <p className="text-legende font-bold tracking-[0.07em] text-encre-doux uppercase">{nom}</p>
      <p className="mt-1 font-code text-chiffre leading-tight tabular-nums text-encre">{valeur}</p>
      <p className="text-legende text-encre-doux">{detail}</p>
    </div>
  );
}
