"use client";

import { useCallback, useMemo } from "react";
import { ConfierPaquetModal } from "@/components/ConfierPaquetModal";
import { Modale } from "@/components/patrons/Modale";
import { nomDuClient } from "@/lib/domain/client";
import { dossiersEnAttente, FILTRES_DOSSIERS_VIDES } from "@/lib/domain/dossier";
import type { DossierCarteGrise } from "@/lib/domain/dossier-carte-grise";
import { cartesAConfier, type PaquetConfie } from "@/lib/domain/paquet";
import type { Prestataire } from "@/lib/domain/prestataire";
import type { DocumentDossier, Vente } from "@/lib/domain/vente";
import { usePerimetre } from "@/lib/perimetre/perimetre";
import { useAbonnement } from "@/lib/repositories/abonnement";
import { ecouterDossiersCarteGrise } from "@/lib/repositories/dossiers-carte-grise";
import { useFichierClients } from "@/lib/repositories/fichier-clients";
import { ecouterDossiers, ecouterVentes } from "@/lib/repositories/ventes";

/**
 * Confier des cartes grises en partant de la personne (20 octobre 2026).
 *
 * **La demande du client : « depuis le prestataire, ça doit ouvrir une modale
 * de tous les dossiers en cours à cocher ».** Le produit ne savait partir que
 * des dossiers — on cochait des lignes d'un tableau qu'on avait sous les yeux,
 * puis on désignait le prestataire. C'est le bon geste quand on vide la file ;
 * c'est le mauvais quand Ouédraogo passe au comptoir et qu'on se demande ce
 * qu'on peut lui donner aujourd'hui.
 *
 * **Ce composant n'existe que pour monter la liste.** La fiche d'un
 * prestataire ne lit ni les ventes ni les dossiers ; il faut donc les
 * chercher. Il est monté à l'ouverture de la modale et démonté à sa fermeture,
 * pour que ces deux écoutes ne tournent pas en permanence sur un écran qui est
 * d'abord une liste de noms.
 *
 * **Le stock des motos n'est pas lu, et ce n'est pas un oubli.** Il ne sert à
 * `dossiersEnAttente` que pour la quittance et le CMC, qui se cochent sur la
 * moto ; la carte grise, seule concernée ici, a une vie dehors que la moto ne
 * connaît pas. Une troisième écoute n'aurait rien changé à la liste.
 *
 * **La nouvelle collection est lue en plus, et pour deux raisons** (S59). Elle
 * apporte les dossiers venus du dehors, qui n'ont pas de vente et n'auraient
 * donc jamais figuré dans cette liste. Et elle donne la seconde face des cartes
 * nées d'une vente : sans elle, le dépôt n'écrirait que le document, et l'écran
 * des cartes grises annoncerait au magasin une carte déjà partie.
 *
 * Ce que ce compte n'a pas le droit de lire n'arrive pas ici — les règles
 * filtrent —, donc un gérant motos ne se verra jamais proposer le dossier
 * extérieur d'une autre boutique.
 */
export function ConfierDepuisPrestataire({
  prestataire,
  boutiqueId,
  onFermer,
  onConfie,
}: {
  prestataire: Prestataire;
  /** La boutique à qui le paquet appartiendra — celle de la plaque jaune. */
  boutiqueId: string;
  onFermer: () => void;
  onConfie: (confie: PaquetConfie) => void;
}) {
  const { clients } = useFichierClients();
  const { perimetre } = usePerimetre();

  /**
   * **Deux sources, et le métier décide laquelle.**
   *
   * Une boutique motos lit ses propres ventes, ses documents de dossier et ses
   * dossiers de carte grise : c'est son magasin, elle a le droit sur les trois.
   *
   * La personne des cartes grises, elle, traite les papiers de **toute**
   * l'entreprise — et c'est précisément ce qui manquait : la modale lisait la
   * boutique de la plaque jaune, la sienne, où aucune vente n'a jamais eu lieu.
   * Elle annonçait donc « aucune carte n'attend » avec des dizaines de dossiers
   * ouverts ailleurs.
   *
   * **Mais elle ne lit pas les ventes des autres, et ce n'est pas un oubli** :
   * le cloisonnement des magasins est la raison d'être de son espace (D2). Sa
   * source est la collection des dossiers de carte grise, la seule que son
   * métier lui ouvre partout. Conséquence à connaître : **un dossier qui n'a
   * pas encore été repris n'y est pas**, et il ne lui apparaîtra pas tant que
   * la reprise n'est pas passée.
   */
  const traiteTout = perimetre.metiers.includes("cartes_grises");

  /* Les trois écoutes restent montées — un abonnement ne se branche pas sous
     condition — mais deux rendent le vide quand c'est le métier des cartes
     grises qui regarde : les ventes et les documents d'une autre boutique lui
     seraient refusés par les règles, et la demande partirait pour rien. */
  const souscrireVentes = useCallback(
    (auChangement: (ventes: Vente[]) => void, enErreur: (cause: unknown) => void) => {
      if (traiteTout) {
        auChangement([]);
        return () => undefined;
      }
      return ecouterVentes(boutiqueId, auChangement, enErreur);
    },
    [boutiqueId, traiteTout],
  );
  const { valeur: ventes, erreur: erreurVentes } = useAbonnement(
    souscrireVentes,
    "Les ventes n’ont pas pu être lues.",
  );

  const souscrireCartesGrises = useCallback(
    (auChangement: (dossiers: DossierCarteGrise[]) => void, enErreur: (cause: unknown) => void) =>
      ecouterDossiersCarteGrise(traiteTout ? null : boutiqueId, auChangement, enErreur),
    [boutiqueId, traiteTout],
  );
  const { valeur: dossiersCG, erreur: erreurCartesGrises } = useAbonnement(
    souscrireCartesGrises,
    "Les dossiers de carte grise n’ont pas pu être lus.",
  );

  const souscrireDossiers = useCallback(
    (auChangement: (documents: DocumentDossier[]) => void, enErreur: (cause: unknown) => void) => {
      if (traiteTout) {
        auChangement([]);
        return () => undefined;
      }
      return ecouterDossiers(boutiqueId, auChangement, enErreur);
    },
    [boutiqueId, traiteTout],
  );
  const { valeur: documents, erreur: erreurDossiers } = useAbonnement(
    souscrireDossiers,
    "L’état des dossiers n’a pas pu être lu.",
  );

  const parClient = useMemo(() => new Map(clients.map((client) => [client.id, client])), [clients]);

  const cartes = useMemo(() => {
    if (ventes === null || documents === null || dossiersCG === null) return null;
    /* Les motos : volontairement vides, voir l'en-tête. Et aucun filtre — on
       veut tous les dossiers ouverts, c'est `cartesAConfier` qui ne retient
       ensuite que les cartes qui n'ont encore bougé nulle part. */
    const dossiers = dossiersEnAttente(ventes, documents, [], FILTRES_DOSSIERS_VIDES, new Date());
    return cartesAConfier(dossiers, dossiersCG, (clientId) =>
      nomDuClient(parClient.get(clientId)),
    );
  }, [ventes, documents, dossiersCG, parClient]);

  const erreur = erreurVentes ?? erreurDossiers ?? erreurCartesGrises;

  /* **On n'ouvre pas le formulaire sur une liste qu'on n'a pas lue.** Elle
     paraîtrait vide — « aucune carte n'attend » — alors qu'on ne sait pas
     encore, et on repartirait en croyant le prestataire à jour. */
  if (erreur || cartes === null) {
    return (
      <Modale
        ouvert
        onFermer={onFermer}
        titre={`Confier des cartes grises à ${prestataire.nom}`}
      >
        <p className="text-corps text-encre-doux">
          {erreur ?? "Lecture des dossiers en cours…"}
        </p>
      </Modale>
    );
  }

  return (
    <ConfierPaquetModal
      cartes={cartes}
      /* Rien de coché : on arrive sans sélection, c'est tout l'objet de cette
         porte d'entrée. */
      choisies={[]}
      prestataireImpose={{ id: prestataire.id, nom: prestataire.nom }}
      boutiqueId={boutiqueId}
      onFermer={onFermer}
      onConfie={onConfie}
    />
  );
}
