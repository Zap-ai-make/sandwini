"use client";

import { useCallback, useMemo } from "react";
import { moisDe, memeMois } from "@/lib/domain/chiffres";
import type { Moto } from "@/lib/domain/moto";
import type { Vente } from "@/lib/domain/vente";
import { usePerimetre } from "@/lib/perimetre/perimetre";
import { useAbonnement } from "@/lib/repositories/abonnement";
import { ecouterStock } from "@/lib/repositories/motos";
import { ecouterVentes } from "@/lib/repositories/ventes";

/**
 * Ce que chaque boutique pèse, pour sa carte de supervision (S24, A2.3).
 *
 * **Trois faits, et pas un agrégat de plus.** Motos en stock, ventes du mois,
 * reste dû : c'est ce que la maquette annonce sur chaque carte (`a2:93-97`), et
 * c'est ce qui répond à la question de l'écran — *laquelle je regarde d'abord*.
 * Les chiffres du commerce, eux, ont leur propre écran.
 *
 * **« Reste dû » est le total à ce jour, pas celui des ventes du mois.** Une
 * carte sert à choisir où aller : ce qui compte est ce qui attend là-bas, pas
 * ce que le mois a produit. L'écran des chiffres raisonne par mois parce qu'il
 * répond à une autre question.
 *
 * **Aucune écoute nouvelle n'est ouverte pour ce calcul.** Les ventes et le
 * stock sont déjà lus par les écrans du périmètre courant ; ici on les relit
 * sur le périmètre entier, une fois, et tout le reste est un `useMemo`. C'est
 * la même décision qu'au reçu (D61) : ce qui se recalcule à la lecture ne peut
 * pas diverger de ce dont il est tiré, et continue de fonctionner hors ligne.
 */
export type PeseeBoutique = {
  enStock: number;
  ventesDuMois: number;
  resteDu: number;
};

/** Ce qu'on montre à une boutique dont on ne sait encore rien de chiffré. */
export const PESEE_VIDE: PeseeBoutique = { enStock: 0, ventesDuMois: 0, resteDu: 0 };

export function usePeseeDesBoutiques(): {
  pesee: ReadonlyMap<string, PeseeBoutique>;
  chargement: boolean;
} {
  const { perimetre, chargement: perimetreEnCours } = usePerimetre();
  /* Les cartes montrent toutes les boutiques : on lit donc sur le périmètre de
     l'entreprise, quel que soit celui qui est sélectionné dans le bandeau. Un
     gérant n'atteint jamais cet écran (la garde de capacité le refuse), donc
     aucune règle n'est mise en défaut. */
  const global = perimetre.type !== "aucune";

  const souscrireVentes = useCallback(
    (auChangement: (ventes: Vente[]) => void, enErreur: (cause: unknown) => void) =>
      global ? ecouterVentes(null, auChangement, enErreur) : () => {},
    [global],
  );
  const { valeur: ventes } = useAbonnement(souscrireVentes, "Les ventes n’ont pas pu être lues.");

  const souscrireStock = useCallback(
    (auChangement: (motos: Moto[]) => void, enErreur: (cause: unknown) => void) =>
      global ? ecouterStock(null, auChangement, enErreur) : () => {},
    [global],
  );
  const { valeur: stock } = useAbonnement(souscrireStock, "Le stock n’a pas pu être lu.");

  return useMemo(() => {
    const pesee = new Map<string, PeseeBoutique>();
    const mois = moisDe(new Date());

    const pour = (id: string) => {
      const actuel = pesee.get(id) ?? { ...PESEE_VIDE };
      pesee.set(id, actuel);
      return actuel;
    };

    for (const moto of stock ?? []) {
      /* « En stock » compte ce qui peut encore se vendre : une moto réservée ou
         vendue n'est plus du stock, et la gonfler ferait promettre au
         responsable une disponibilité qui n'existe pas. */
      if (moto.statut !== "en_stock") continue;
      pour(moto.boutiqueId).enStock += 1;
    }

    for (const vente of ventes ?? []) {
      const ligne = pour(vente.boutiqueId);
      if (vente.date !== null && memeMois(moisDe(vente.date), mois)) ligne.ventesDuMois += 1;
      ligne.resteDu += vente.resteDu;
    }

    return {
      pesee,
      chargement: perimetreEnCours || (global && (ventes === null || stock === null)),
    };
  }, [ventes, stock, perimetreEnCours, global]);
}
