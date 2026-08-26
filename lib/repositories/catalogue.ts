"use client";

import type { Modele, Referentiel } from "@/lib/domain/referentiel";
import { useAbonnement } from "./abonnement";
import { ecouterModeles, ecouterReferentiel } from "./referentiels";

/**
 * Les listes de choix dont les écrans de saisie ont besoin, en un seul endroit.
 *
 * Marque, modèle, provenance, type de frais : le formulaire d'entrée en stock
 * les demande toutes les quatre, la fiche d'une moto aussi pour afficher des
 * noms plutôt que des identifiants. Les abonnements sont déclarés au niveau du
 * module pour rester stables d'un rendu à l'autre — sinon l'écouteur se ferme
 * et se rouvre en boucle.
 */

type Souscription<T> = (
  auChangement: (valeur: T) => void,
  enErreur: (cause: unknown) => void,
) => () => void;

const souscrireMarques: Souscription<Referentiel[]> = (auChangement, enErreur) =>
  ecouterReferentiel("marques", auChangement, enErreur);
const souscrireProvenances: Souscription<Referentiel[]> = (auChangement, enErreur) =>
  ecouterReferentiel("provenances", auChangement, enErreur);
const souscrireTypesFrais: Souscription<Referentiel[]> = (auChangement, enErreur) =>
  ecouterReferentiel("typesFrais", auChangement, enErreur);
const souscrireModeles: Souscription<Modele[]> = (auChangement, enErreur) =>
  ecouterModeles(auChangement, enErreur);

const MESSAGE = "Les listes de choix n’ont pas pu être chargées.";

export type Catalogue = {
  marques: Referentiel[];
  modeles: Modele[];
  provenances: Referentiel[];
  typesFrais: Referentiel[];
  chargement: boolean;
  erreur: string | null;
  /** Le nom d'une entrée, ou un tiret : un identifiant brut ne dit rien à personne. */
  nomMarque: (id: string) => string;
  nomModele: (id: string) => string;
  nomProvenance: (id: string) => string;
  nomTypeFrais: (id: string) => string;
};

function nommer(liste: Referentiel[], id: string): string {
  return liste.find((entree) => entree.id === id)?.nom ?? "—";
}

export function useCatalogue(): Catalogue {
  const marques = useAbonnement(souscrireMarques, MESSAGE);
  const modeles = useAbonnement(souscrireModeles, MESSAGE);
  const provenances = useAbonnement(souscrireProvenances, MESSAGE);
  const typesFrais = useAbonnement(souscrireTypesFrais, MESSAGE);

  const listes = {
    marques: marques.valeur ?? [],
    modeles: modeles.valeur ?? [],
    provenances: provenances.valeur ?? [],
    typesFrais: typesFrais.valeur ?? [],
  };

  return {
    ...listes,
    chargement:
      marques.valeur === null ||
      modeles.valeur === null ||
      provenances.valeur === null ||
      typesFrais.valeur === null,
    erreur: marques.erreur ?? modeles.erreur ?? provenances.erreur ?? typesFrais.erreur,
    nomMarque: (id) => nommer(listes.marques, id),
    nomModele: (id) => nommer(listes.modeles, id),
    nomProvenance: (id) => nommer(listes.provenances, id),
    nomTypeFrais: (id) => nommer(listes.typesFrais, id),
  };
}
