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
 *
 * **Le piège, quand la valeur écoutée peut elle-même être nulle** — un document
 * qui n'existe pas, comme `ecouterVente` sur un identifiant inconnu : « pas
 * encore chargé » et « n'existe pas » deviennent le même `null`, et l'écran
 * reste sur « Chargement… » pour une donnée qui n'arrivera jamais. On enveloppe
 * alors la valeur (`{ vente }`), qui n'est jamais nulle : cf. `PanneauRecu`,
 * où l'état « reçu introuvable » en dépend.
 */
export type Echec = {
  /** Le code brut renvoyé par le SDK, ex. `permission-denied`. */
  code: string;
  /** Quand la lecture a échoué. Ce qu'on dicte au téléphone avec le code. */
  quand: Date;
};

export function useAbonnement<T>(
  souscrire: (auChangement: (valeur: T) => void, enErreur: (cause: unknown) => void) => () => void,
  messageErreur: string,
): {
  valeur: T | null;
  erreur: string | null;
  /**
   * De quoi nommer le refus sans le traduire : le code et l'heure.
   *
   * La maquette `b6` les imprime en pied du bloc d'erreur, et c'est juste :
   * ils ne servent pas à l'utilisateur, ils servent à la personne qu'il
   * appelle. Un code de règle Firestore n'a rien à faire **en titre** sous les
   * yeux d'un gérant (`DESIGN.md` §12) — en petit, à la fin, il vaut mieux
   * qu'un aller-retour pour reproduire la panne.
   */
  echec: Echec | null;
  /**
   * Rouvrir l'écouteur.
   *
   * Un refus de lecture n'est pas toujours définitif : un jeton qui vient
   * d'être renouvelé, une règle qu'on vient de corriger, une coupure au
   * mauvais moment. Sans ce geste, la seule sortie était de recharger la page
   * — ce qui perd la recherche et les filtres en cours (`DESIGN.md` §10 :
   * l'erreur dit comment corriger).
   */
  reessayer: () => void;
} {
  const [etat, setEtat] = useState<{ valeur: T | null; erreur: string | null; echec: Echec | null }>(
    { valeur: null, erreur: null, echec: null },
  );
  /* Un compteur, et non un booléen : deux tentatives de suite doivent relancer
     l'effet deux fois. */
  const [essai, setEssai] = useState(0);

  useEffect(
    () =>
      souscrire(
        (valeur) => setEtat({ valeur, erreur: null, echec: null }),
        (cause) => {
          const code = (cause as { code?: string }).code ?? "inconnu";
          setEtat({
            valeur: null,
            erreur: code.includes("permission-denied")
              ? "Vos droits ne permettent pas de lire ces données."
              : messageErreur,
            echec: { code, quand: new Date() },
          });
        },
      ),
    [souscrire, messageErreur, essai],
  );

  return { ...etat, reessayer: () => setEssai((n) => n + 1) };
}
