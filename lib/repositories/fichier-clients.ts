"use client";

import type { Client } from "@/lib/domain/client";
import { useAbonnement } from "./abonnement";
import { ecouterClients } from "./clients";

/**
 * Le fichier clients, en direct.
 *
 * Chargé entier, comme le stock : quelques centaines de fiches, une recherche
 * instantanée qui marche sans réseau. Une requête indexée serait plus économe
 * en mémoire mais ne trouverait rien en coupure — l'inverse de ce que ce
 * produit promet. La limite et sa parade sont nommées dans `DECISIONS.md` D16.
 */

const souscrire = (
  auChangement: (clients: Client[]) => void,
  enErreur: (cause: unknown) => void,
) => ecouterClients(auChangement, enErreur);

export function useFichierClients(): {
  clients: Client[];
  /**
   * Le fichier **tel que l'écoute l'a rendu** — `null` tant que la première
   * réponse n'est pas arrivée.
   *
   * **Pourquoi il double `clients`** (S40). Huit écrans lisent ce fichier pour
   * nommer un client sur une fiche ou un reçu : pour eux, « pas encore lu » et
   * « aucun client » donnent le même rendu, et `clients` leur suffit. Deux
   * écrans s'en servent pour **décider d'écrire** — `FormulaireClient` demande
   * si ce numéro de téléphone est déjà pris. Là, les deux états ont des
   * réponses opposées, et le `?? []` qui vivait ici les confondait : un client
   * créé pendant le chargement dupliquait un numéro, ce qui coupe en deux
   * l'historique d'une personne — ses dettes sur une fiche, ses versements sur
   * l'autre (D95).
   *
   * Cette occurrence-là n'était pas dans les six du cahier : elle ne s'écrit
   * pas `?? []` dans un écran, elle est **cachée dans le dépôt**. C'est D92 —
   * corriger l'occurrence trouvée ne corrige rien tant qu'on n'a pas énuméré
   * les appelants.
   */
  lus: Client[] | null;
  chargement: boolean;
  erreur: string | null;
} {
  const { valeur, erreur } = useAbonnement(
    souscrire,
    "Le fichier clients n’a pas pu être chargé.",
  );
  return {
    clients: valeur ?? [],
    lus: valeur,
    chargement: valeur === null && !erreur,
    erreur,
  };
}
