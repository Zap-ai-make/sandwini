"use client";

import { useCallback, useMemo } from "react";
import { dossiersEnAttente, FILTRES_DOSSIERS_VIDES } from "@/lib/domain/dossier";
import type { Compteur } from "@/lib/domain/espaces";
import {
  dettes,
  suivrePaiements,
  tranchesEnCours,
  type DocumentDossier,
  type Vente,
  type Versement,
} from "@/lib/domain/vente";
import { usePerimetre } from "@/lib/perimetre/perimetre";
import { useAbonnement } from "@/lib/repositories/abonnement";
import { ecouterDossiers, ecouterVentes, ecouterVersementsDuPerimetre } from "@/lib/repositories/ventes";

/**
 * Ce que la colonne de gauche annonce derrière ses entrées.
 *
 * « Paiements 31 », « Dossiers 18 » : la colonne dit ce qu'on trouvera avant
 * qu'on ouvre, comme le hub des réglages le fait en toutes lettres depuis A9.
 * Le patron existait, il n'était simplement pas branché ici — c'est l'écart
 * relevé au §3.2 du cahier.
 *
 * **Un compte à zéro ne se rend pas.** `null` veut dire « rien à annoncer »,
 * et couvre les deux cas où une pastille mentirait : le calcul n'est pas
 * encore arrivé, ou il vaut zéro. C'est la règle de D63 — un « 0 » affiché
 * ment sur l'état du commerce exactement comme une carte de tableau de bord à
 * zéro, et la colonne est le dernier endroit où l'on veut ce mensonge, puisque
 * c'est celui qu'on lit sans y penser.
 *
 * **Ce que compte chaque nombre.** Les dossiers : les dossiers ouverts, ceux
 * de la file d'A7. Les tranches : les lignes de paiement où il reste quelque
 * chose à percevoir, dettes et tranches réunies — c'est ce que l'écran A8
 * montre, dans ses deux sections.
 *
 * **Sans périmètre, on n'écoute rien** (D7). Une écoute sans boutique est une
 * lecture de *toutes* les boutiques, que les règles refusent à un gérant :
 * elle poserait une erreur rouge dans la colonne de quelqu'un qui n'y peut
 * rien. Un gérant sans attribution n'a pas de compte à lire, il a un
 * rattachement à demander.
 */
export function useComptes(): Record<Compteur, number | null> {
  const { perimetre } = usePerimetre();
  const boutiqueId = perimetre.boutiqueId;
  const sansPerimetre = perimetre.type === "aucune";

  const souscrireVentes = useCallback(
    (auChangement: (ventes: Vente[]) => void, enErreur: (cause: unknown) => void) =>
      sansPerimetre ? () => {} : ecouterVentes(boutiqueId, auChangement, enErreur),
    [boutiqueId, sansPerimetre],
  );
  const souscrireDossiers = useCallback(
    (auChangement: (documents: DocumentDossier[]) => void, enErreur: (cause: unknown) => void) =>
      sansPerimetre ? () => {} : ecouterDossiers(boutiqueId, auChangement, enErreur),
    [boutiqueId, sansPerimetre],
  );
  const souscrireVersements = useCallback(
    (auChangement: (versements: Versement[]) => void, enErreur: (cause: unknown) => void) =>
      sansPerimetre ? () => {} : ecouterVersementsDuPerimetre(boutiqueId, auChangement, enErreur),
    [boutiqueId, sansPerimetre],
  );

  /* Les mêmes écoutes que `CeQuiDemandeUneDecision`, et c'est voulu : le SDK
     Firestore partage l'écouteur sous-jacent de deux requêtes identiques, donc
     cela ne coûte pas un second aller-retour. Ce qu'on ne partage surtout pas,
     c'est le *calcul* — il vit dans `lib/domain`, une seule fois, et les deux
     appelants en dérivent. Deux calculs auraient fini par répondre deux
     choses (D73). */
  const { valeur: ventes } = useAbonnement(souscrireVentes, "Les ventes n’ont pas pu être lues.");
  const { valeur: documents } = useAbonnement(
    souscrireDossiers,
    "L’état des dossiers n’a pas pu être lu.",
  );
  const { valeur: versements } = useAbonnement(
    souscrireVersements,
    "Les versements n’ont pas pu être lus.",
  );

  return useMemo(() => {
    /* La date du jour est figée pour tout le calcul : deux nombres de la même
       colonne jugés à des instants différents se contrediraient. */
    const maintenant = new Date();

    const nbDossiers =
      ventes && documents
        ? dossiersEnAttente(ventes, documents, FILTRES_DOSSIERS_VIDES, maintenant).length
        : 0;

    const lignes = ventes && versements ? suivrePaiements(ventes, versements, maintenant) : [];
    const nbTranches = [...dettes(lignes), ...tranchesEnCours(lignes)].filter(
      (ligne) => ligne.resteDu > 0,
    ).length;

    return {
      dossiers: nbDossiers > 0 ? nbDossiers : null,
      tranches: nbTranches > 0 ? nbTranches : null,
    };
  }, [ventes, documents, versements]);
}
