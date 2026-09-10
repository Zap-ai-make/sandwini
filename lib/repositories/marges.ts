"use client";

import { useEffect, useRef, useState } from "react";
import { useSession } from "@/lib/auth/session";
import { peut } from "@/lib/domain/roles";
import type { Vente } from "@/lib/domain/vente";
import { ecouterMargeVente, lireMargeVente } from "@/lib/repositories/ventes";

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
 * **Et une écoute pour tout ce qui n'a pas répondu.** C'est le correctif d'un
 * défaut vu au banc, pas une précaution : le test bout en bout a regardé la
 * carte pendant soixante secondes après une vente, et elle est restée à
 * « — ». Deux causes se cachaient derrière ce tiret, et la seconde est la
 * grave.
 *
 * La première est bénigne : la lecture passe avant le déclencheur, la vente est
 * marquée tentée, et plus rien ne la redemande. La seconde est celle du
 * terrain : **`getDoc` lève `unavailable`** — « the client is offline » — quand
 * le document n'est pas en cache et que la connexion est encombrée, ce qui est
 * exactement l'état d'un appareil qui vient de vider sa file d'écritures. Un
 * échec de lecture n'est pas une réponse ; le compter comme « pas de marge »
 * la perdait jusqu'au rechargement suivant. Or le mois en cours est précisément
 * la vue par défaut, et une connexion encombrée est l'ordinaire du comptoir.
 *
 * L'écoute est donc **bornée à ce qui manque** : zéro abonnement dans le cas
 * courant, un pour une vente que le serveur vient de recevoir. Elle se ferme
 * dès qu'elle a livré sa valeur, puisqu'une marge est écrite une fois et jamais
 * réécrite (D51) — ce qui reste vrai, et ce qui rend cette écoute finie.
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
    const fermetures: (() => void)[] = [];

    void Promise.all(
      aLire.map(async (id) => {
        try {
          return [id, await lireMargeVente(id)] as const;
        } catch {
          /* Un échec n'est pas une réponse. `getDoc` lève `unavailable` quand
             le document n'est pas en cache et que la connexion est encombrée —
             vu au banc, juste après une vente, pendant que la file d'écritures
             se vide. La traiter comme « pas de marge » la perdait pour de bon,
             la vente étant déjà comptée tentée. On passe donc la main à
             l'écoute, qui sait attendre le retour du réseau et se ferme
             d'elle-même sur un vrai refus. */
          return [id, null] as const;
        }
      }),
    ).then((reponses) => {
      if (!vivant) return;

      const utiles = reponses.filter(
        (reponse): reponse is readonly [string, number] => reponse[1] !== null,
      );
      if (utiles.length > 0) setMarges((actuelles) => new Map([...actuelles, ...utiles]));

      /* Celles qui n'ont pas répondu — marge pas encore écrite, ou lecture
         tombée : on les attend, une par une, et on referme dès que la valeur
         arrive. */
      for (const reponse of reponses) {
        if (reponse[1] !== null) continue;
        const id = reponse[0];
        fermetures.push(
          attendreLaMarge(id, (marge) => {
            if (!vivant) return;
            setMarges((actuelles) => new Map([...actuelles, [id, marge]]));
          }),
        );
      }
    });

    return () => {
      vivant = false;
      for (const fermer of fermetures) fermer();
    };
  }, [cle]);

  return marges;
}

/**
 * Attend la marge d'une vente qui n'en a pas encore, et referme aussitôt reçue.
 *
 * Le détour par `termine` n'est pas de la superstition : rien ne garantit
 * l'ordre entre le premier instantané et le retour de `onSnapshot`, et sans lui
 * une valeur livrée tôt laisserait un abonnement ouvert que plus personne ne
 * tient. Un refus de règle ferme aussi l'attente — la redemander ne changerait
 * rien, et l'écran a déjà sa réponse : « — ».
 */
function attendreLaMarge(id: string, poser: (marge: number) => void): () => void {
  let fermer: (() => void) | null = null;
  let termine = false;

  const finir = () => {
    termine = true;
    fermer?.();
    fermer = null;
  };

  const desabonner = ecouterMargeVente(
    id,
    (marge) => {
      if (marge === null) return;
      poser(marge.marge);
      finir();
    },
    finir,
  );

  if (termine) desabonner();
  else fermer = desabonner;

  return finir;
}
