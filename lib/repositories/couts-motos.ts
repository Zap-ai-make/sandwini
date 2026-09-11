"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { CoutMoto, Moto } from "@/lib/domain/moto";
import { lireCoutMoto } from "@/lib/repositories/motos";

/**
 * Ce qu'on sait du coût d'une moto — **trois réponses, pas deux** (S39, D82).
 *
 * `absent` et `inconnu` se ressemblent à l'écran et ne veulent pas dire la même
 * chose. « Absent » est une information : personne n'a encore posé ce coût, et
 * c'est précisément ce que le responsable vient chercher ici. « Inconnu » est
 * l'aveu que la lecture n'a pas abouti.
 *
 * Les confondre aurait un coût mesurable : une moto dont le coût existe, mais
 * dont la lecture est tombée, apparaîtrait dans « à renseigner » — et le
 * responsable le saisirait une seconde fois, par-dessus le vrai.
 */
export type EtatCout =
  | { sorte: "connu"; cout: CoutMoto }
  | { sorte: "absent" }
  | { sorte: "inconnu" };

/**
 * Les coûts des motos affichées, lus un par un.
 *
 * **Pourquoi pas une écoute de groupe de collections.** `collectionGroup('prive')`
 * donnerait tout d'un coup — et ramènerait aussi les marges des ventes, qui
 * vivent dans la même sous-collection. Le responsable a le droit de les lire,
 * donc rien ne fuirait ; mais il faudrait ouvrir une règle à segment variable
 * sur `prive/`, c'est-à-dire élargir le fichier le plus sensible du dépôt pour
 * économiser des requêtes. `SECURITY.md` §0 demande d'exposer le moins, et
 * `marges.ts` a tranché la même question dans l'autre sens pour la même raison.
 * Deux écrans, un seul raisonnement.
 *
 * **Une lecture ponctuelle, pas une écoute.** Un coût change quand le
 * responsable le change, depuis cet écran-ci : on note alors le nouvel état
 * sans redemander quoi que ce soit. Le cache local sert les relectures, y
 * compris hors ligne.
 *
 * **Et rien ne se demande deux fois.** Les identifiants déjà tentés sont gardés
 * dans une référence, lue dans l'effet et jamais pendant le rendu — sauf ceux
 * dont la lecture est tombée, que `reessayer` remet dans la file. C'est la
 * différence avec `useMarges`, qui ne pouvait pas les réessayer et devait
 * ouvrir une écoute pour chacun.
 */
export function useCoutsDesMotos(motos: readonly Moto[] | null): {
  etats: ReadonlyMap<string, EtatCout>;
  /** Le trajet initial n'est pas fini pour toutes les motos affichées. */
  chargement: boolean;
  /** À appeler après avoir écrit un coût : évite une relecture pour rien. */
  noter: (motoId: string, etat: EtatCout) => void;
  /** Redemande les seules motos dont la lecture n'a pas abouti. */
  reessayer: () => void;
} {
  const [etats, setEtats] = useState<ReadonlyMap<string, EtatCout>>(new Map());
  const demandees = useRef<Set<string>>(new Set());
  const [tour, setTour] = useState(0);

  /* La liste réduite à une chaîne : c'est elle qui décide si l'effet doit
     repartir. Un tableau change d'identité à chaque rendu et relancerait
     l'effet en boucle. */
  const cle = motos ? motos.map((moto) => moto.id).join(",") : "";

  useEffect(() => {
    if (cle === "") return;
    const aLire = cle.split(",").filter((id) => !demandees.current.has(id));
    if (aLire.length === 0) return;
    for (const id of aLire) demandees.current.add(id);

    let vivant = true;

    void Promise.all(
      aLire.map(async (id) => {
        try {
          const cout = await lireCoutMoto(id);
          return [id, cout ? { sorte: "connu", cout } : { sorte: "absent" }] as const;
        } catch {
          /* `getDoc` lève `unavailable` — « the client is offline » — quand le
             document n'est pas en cache et que la connexion est encombrée. Ce
             n'est pas une réponse, et le ranger avec « pas de coût » ferait
             saisir deux fois le même prix d'achat (D82). */
          return [id, { sorte: "inconnu" }] as const;
        }
      }),
    ).then((reponses) => {
      if (!vivant) return;
      for (const [id, etat] of reponses) {
        if (etat.sorte === "inconnu") demandees.current.delete(id);
      }
      setEtats((actuels) => new Map([...actuels, ...(reponses as [string, EtatCout][])]));
    });

    return () => {
      vivant = false;
    };
  }, [cle, tour]);

  const noter = useCallback((motoId: string, etat: EtatCout) => {
    demandees.current.add(motoId);
    setEtats((actuels) => new Map([...actuels, [motoId, etat]]));
  }, []);

  const reessayer = useCallback(() => setTour((precedent) => precedent + 1), []);

  /* **`motos === null` veut dire « on ne sait pas encore », pas « aucune ».**
     La première version rendait `false` dans ce cas — la liste n'étant pas
     arrivée, aucune moto n'avait de coût manquant, donc rien ne chargeait. À
     l'écran, cela donnait « Aucune moto en stock » affiché pendant que le
     stock arrivait, c'est-à-dire une réponse rendue avant de l'avoir. Vu à la
     capture sur une base qui contenait deux motos (D82, encore lui). */
  const chargement = motos === null || motos.some((moto) => !etats.has(moto.id));

  return { etats, chargement, noter, reessayer };
}
