"use client";

import { useEffect, useRef, useState } from "react";
import { useSession } from "@/lib/auth/session";
import { peut } from "@/lib/domain/roles";
import type { Vente } from "@/lib/domain/vente";
import { lireMargeVente } from "@/lib/repositories/ventes";

/**
 * Les marges des ventes affichées, lues une par une (S24).
 *
 * **Pourquoi pas une écoute de groupe de collections.** `collectionGroup('prive')`
 * donnerait tout d'un coup, en un seul abonnement — et ramènerait aussi les
 * coûts d'achat de toutes les motos, qui vivent dans la même sous-collection.
 * Le responsable a le droit de les lire, donc rien ne fuirait ; mais
 * `SECURITY.md` §0 demande d'exposer le moins, et ouvrir un chemin d'accès
 * supplémentaire à un cloisonnement (D2) pour économiser des requêtes est un
 * mauvais échange. Cela aurait aussi demandé d'élargir une règle, donc de
 * toucher au fichier le plus sensible du dépôt pour un écran de confort.
 *
 * **Une lecture ponctuelle, pas une écoute, et c'est suffisant.** Une marge est
 * écrite une fois par le déclencheur `figerMargeVente`, puis fermée en écriture
 * à tout navigateur : elle ne changera jamais, il n'y a rien à écouter. Le
 * cache local sert les relectures, y compris hors ligne — un mois déjà consulté
 * se relit sans réseau.
 *
 * **Ce qu'on ne demande jamais deux fois.** Les identifiants déjà tentés sont
 * gardés dans une référence, lue dans l'effet et jamais pendant le rendu :
 * changer de mois ne demande que ce qui manque, et revenir en arrière ne
 * demande rien. Une vente dont le déclencheur n'a rien écrit compte comme
 * tentée — sinon elle serait redemandée à chaque rendu, sans fin.
 *
 * **Un gérant n'entre jamais ici.** Les règles lui refusent ces documents (D2) ;
 * l'appeler quand même lui vaudrait une erreur rouge pour un chiffre qu'il
 * n'affichera pas.
 */
export function useMarges(ventes: readonly Vente[] | null): ReadonlyMap<string, number> {
  const session = useSession();
  const role = session.statut === "connecte" ? session.utilisateur.role : null;
  const autorise = role !== null && peut(role, "voir_marges");

  const [marges, setMarges] = useState<ReadonlyMap<string, number>>(new Map());
  const tentees = useRef<Set<string>>(new Set());

  /* La liste réduite à une chaîne : c'est elle qui décide si l'effet doit
     repartir. Un tableau change d'identité à chaque rendu et relancerait
     l'effet en boucle. */
  const cle = autorise && ventes ? ventes.map((vente) => vente.id).join(",") : "";

  useEffect(() => {
    if (cle === "") return;
    const aLire = cle.split(",").filter((id) => !tentees.current.has(id));
    if (aLire.length === 0) return;
    for (const id of aLire) tentees.current.add(id);

    let vivant = true;
    void Promise.all(
      aLire.map(async (id) => {
        try {
          const valeur = await lireMargeVente(id);
          return valeur === null ? null : ([id, valeur] as const);
        } catch {
          /* Hors ligne sans cache, ou refus : la marge reste inconnue, et
             l'écran écrit « — » plutôt qu'un zéro qui affirmerait. */
          return null;
        }
      }),
    ).then((trouvees) => {
      if (!vivant) return;
      const utiles = trouvees.filter((trouvee): trouvee is readonly [string, number] =>
        Boolean(trouvee),
      );
      if (utiles.length === 0) return;
      setMarges((actuelles) => new Map([...actuelles, ...utiles]));
    });

    return () => {
      vivant = false;
    };
  }, [cle]);

  return marges;
}
