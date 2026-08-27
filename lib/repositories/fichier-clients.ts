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
  chargement: boolean;
  erreur: string | null;
} {
  const { valeur, erreur } = useAbonnement(
    souscrire,
    "Le fichier clients n’a pas pu être chargé.",
  );
  return { clients: valeur ?? [], chargement: valeur === null && !erreur, erreur };
}
