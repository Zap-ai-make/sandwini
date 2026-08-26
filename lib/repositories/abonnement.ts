"use client";

import { useEffect, useState } from "react";

/**
 * S'abonner à une lecture Firestore en direct, sans réécrire trois fois le même
 * effet.
 *
 * Les écrans de référentiels font tous la même chose : ouvrir un écouteur,
 * garder la dernière valeur, retenir une erreur lisible, fermer en partant. La
 * valeur reste `null` tant que rien n'est arrivé — c'est ce qui distingue
 * « en cours de chargement » de « vide », deux états qui ne se disent pas de la
 * même façon (`DESIGN.md` §10).
 *
 * `souscrire` doit être stable d'un rendu à l'autre, sinon l'écouteur se ferme
 * et se rouvre en boucle : les appelants le passent dans un `useCallback`.
 */
export function useAbonnement<T>(
  souscrire: (auChangement: (valeur: T) => void, enErreur: (cause: unknown) => void) => () => void,
  messageErreur: string,
): { valeur: T | null; erreur: string | null } {
  const [etat, setEtat] = useState<{ valeur: T | null; erreur: string | null }>({
    valeur: null,
    erreur: null,
  });

  useEffect(
    () =>
      souscrire(
        (valeur) => setEtat({ valeur, erreur: null }),
        (cause) =>
          setEtat({
            valeur: null,
            erreur: (cause as { code?: string }).code?.includes("permission-denied")
              ? "Vos droits ne permettent pas de lire ces données."
              : messageErreur,
          }),
      ),
    [souscrire, messageErreur],
  );

  return etat;
}
