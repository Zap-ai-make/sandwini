"use client";

import { useCallback, useMemo } from "react";
import {
  dossiersEnAttente,
  estEnRetard,
  FILTRES_DOSSIERS_VIDES,
  joursEcoules,
} from "@/lib/domain/dossier";
import type { Compteur } from "@/lib/domain/espaces";
import { SEUIL_INACTIVITE_DEFAUT, type ReglagesEntreprise } from "@/lib/domain/entreprise";
import {
  dettes,
  estInactive,
  LIBELLE_DOCUMENT,
  suivrePaiements,
  tranchesEnCours,
  type DocumentDossier,
  type Vente,
  type Versement,
} from "@/lib/domain/vente";
import { usePerimetre } from "@/lib/perimetre/perimetre";
import { useAbonnement } from "@/lib/repositories/abonnement";
import { ecouterReglages } from "@/lib/repositories/entreprise";
import { useFichierClients } from "@/lib/repositories/fichier-clients";
import { ecouterDossiers, ecouterVentes, ecouterVersementsDuPerimetre } from "@/lib/repositories/ventes";

/**
 * Une chose qui attend une décision, réduite à ce que les deux écrans montrent.
 *
 * A2 la range en colonnes — c'est un arbitrage, et un arbitrage se compare
 * d'une ligne à l'autre. A3 en fait une phrase suivie d'un bouton — c'est du
 * travail, et du travail s'ouvre. Les deux formes viennent du même calcul :
 * deux calculs auraient fini par compter deux choses (D73).
 */
export type Attente = {
  cle: string;
  href: string;
  numero: string;
  boutiqueId: string;
  client: string;
  /** Ce qui bloque, en trois mots : « Carte grise en retard ». */
  quoi: string;
  /** Le détail qui situe : chez qui, depuis quand. */
  precision: string;
  /** Depuis combien de jours, quand la question a une réponse. */
  depuis: number | null;
  montant: number | null;
  sorte: "dossier" | "tranche";
};

/**
 * Ce qui attend une décision, et les comptes qui en découlent.
 *
 * Un seul jeu d'écoutes et un seul calcul pour trois lecteurs : la colonne de
 * gauche (les comptes), la supervision (le tableau) et l'accueil du gérant (la
 * file). Trois copies auraient fini par annoncer 18 dans la colonne et en
 * lister 17 dans l'écran — la classe de défaut que D73 décrit.
 *
 * **Sans périmètre, on n'écoute rien** (D7). Une écoute sans boutique est une
 * lecture de *toutes* les boutiques, que les règles refusent à un gérant : elle
 * poserait une erreur rouge devant quelqu'un qui n'y peut rien. Un gérant sans
 * attribution n'a pas de compte à lire, il a un rattachement à demander.
 */
export function useCeQuiAttend(): {
  comptes: Record<Compteur, number | null>;
  lignes: Attente[];
  chargement: boolean;
  erreur: string | null;
} {
  const { perimetre, chargement: perimetreEnCours } = usePerimetre();
  const { clients } = useFichierClients();
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
  const souscrireReglages = useCallback(
    (auChangement: (r: ReglagesEntreprise | null) => void, enErreur: (cause: unknown) => void) =>
      ecouterReglages(auChangement, enErreur),
    [],
  );

  const { valeur: ventes, erreur } = useAbonnement(
    souscrireVentes,
    "Les ventes n’ont pas pu être lues.",
  );
  const { valeur: documents } = useAbonnement(
    souscrireDossiers,
    "L’état des dossiers n’a pas pu être lu.",
  );
  const { valeur: versements } = useAbonnement(
    souscrireVersements,
    "Les versements n’ont pas pu être lus.",
  );
  const { valeur: reglages } = useAbonnement(
    souscrireReglages,
    "Le seuil d’inactivité n’a pas pu être lu.",
  );
  const seuil = reglages?.seuilInactiviteTranches ?? SEUIL_INACTIVITE_DEFAUT;

  const nomDuClient = useMemo(
    () => new Map(clients.map((client) => [client.id, client.nom])),
    [clients],
  );

  return useMemo(() => {
    /* La date du jour est figée pour tout le calcul : deux lignes de la même
       liste jugées à des instants différents se contrediraient. */
    const maintenant = new Date();
    const nom = (id: string) => nomDuClient.get(id) ?? "Client inconnu";
    const pret = Boolean(ventes && documents && versements);

    const ouverts = ventes && documents
      ? dossiersEnAttente(ventes, documents, FILTRES_DOSSIERS_VIDES, maintenant)
      : [];

    const enRetard: Attente[] = ouverts
      .filter((dossier) => dossier.enRetard)
      .map((dossier) => {
        const document = dossier.enCours.find((d) => estEnRetard(d.disponibleLe, maintenant));
        return {
          cle: `dossier-${dossier.venteId}`,
          href: "/motos/dossiers",
          numero: dossier.numero,
          boutiqueId: dossier.boutiqueId,
          client: nom(dossier.clientId),
          quoi: `${LIBELLE_DOCUMENT[document?.type ?? "carte_grise"]} en retard`,
          precision: document?.prestataireNom ? `chez ${document.prestataireNom}` : "",
          depuis: joursEcoules(document?.disponibleLe ?? null, maintenant),
          montant: null,
          sorte: "dossier" as const,
        };
      });

    const lignesPaiement = ventes && versements ? suivrePaiements(ventes, versements, maintenant) : [];
    const inactives: Attente[] = tranchesEnCours(lignesPaiement)
      .filter((ligne) => estInactive(ligne, seuil))
      .map((ligne) => ({
        cle: `tranche-${ligne.vente.id}`,
        href: "/motos/paiements",
        numero: ligne.vente.numero,
        boutiqueId: ligne.vente.boutiqueId,
        client: nom(ligne.vente.clientId),
        quoi: "Tranche sans versement",
        precision: `le seuil est à ${seuil} jours`,
        depuis: ligne.joursSansVersement,
        montant: ligne.resteDu,
        sorte: "tranche" as const,
      }));

    const nbTranches = [...dettes(lignesPaiement), ...tranchesEnCours(lignesPaiement)].filter(
      (ligne) => ligne.resteDu > 0,
    ).length;

    return {
      comptes: {
        dossiers: ouverts.length > 0 ? ouverts.length : null,
        tranches: nbTranches > 0 ? nbTranches : null,
      },
      lignes: [...enRetard, ...inactives],
      chargement: perimetreEnCours || (!sansPerimetre && !pret),
      erreur,
    };
  }, [ventes, documents, versements, nomDuClient, seuil, erreur, perimetreEnCours, sansPerimetre]);
}

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
  return useCeQuiAttend().comptes;
}
