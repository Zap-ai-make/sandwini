"use client";

import { nommerEntree, type Modele, type Referentiel } from "@/lib/domain/referentiel";
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
  /**
   * Les mêmes listes, mais **telles que l'écoute les a rendues** — `null`
   * compris, tant que la première réponse n'est pas arrivée.
   *
   * **Pourquoi deux formes de la même chose** (S40). Les quatre listes
   * ci-dessus servent à *lire* : nommer une marque sur une fiche, alimenter un
   * filtre, compter des entrées. Pour ces usages, « pas encore lu » et « vide »
   * mènent au même écran, et aplatir les deux ne coûte rien.
   *
   * Elles servent aussi à **décider d'écrire** : ce nom est-il déjà pris ? Là,
   * les deux états n'ont pas la même réponse, et les confondre fait répondre
   * « libre » à une question non posée — le doublon se crée (D95). Les
   * contrôles d'unicité lisent donc `lues`, jamais les listes aplaties.
   */
  lues: {
    marques: Referentiel[] | null;
    modeles: Modele[] | null;
    provenances: Referentiel[] | null;
    typesFrais: Referentiel[] | null;
  };
  chargement: boolean;
  erreur: string | null;
  /** Le nom d'une entrée, ou un tiret : un identifiant brut ne dit rien à personne. */
  nomMarque: (id: string) => string;
  nomModele: (id: string) => string;
  nomProvenance: (id: string) => string;
  nomTypeFrais: (id: string) => string;
};

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
    lues: {
      marques: marques.valeur,
      modeles: modeles.valeur,
      provenances: provenances.valeur,
      typesFrais: typesFrais.valeur,
    },
    chargement:
      marques.valeur === null ||
      modeles.valeur === null ||
      provenances.valeur === null ||
      typesFrais.valeur === null,
    erreur: marques.erreur ?? modeles.erreur ?? provenances.erreur ?? typesFrais.erreur,
    nomMarque: (id) => nommerEntree(listes.marques, id),
    nomModele: (id) => nommerEntree(listes.modeles, id),
    nomProvenance: (id) => nommerEntree(listes.provenances, id),
    nomTypeFrais: (id) => nommerEntree(listes.typesFrais, id),
  };
}
