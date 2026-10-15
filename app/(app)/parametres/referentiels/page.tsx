"use client";

import { useCallback, useState } from "react";
import { GardeCapacite } from "@/components/GardeSession";
import { ListeReferentiel, type ActionsReferentiel } from "@/components/ListeReferentiel";
import { Onglets } from "@/components/patrons/Onglets";
import { TetePage } from "@/components/patrons/Page";
import type { Referentiel } from "@/lib/domain/referentiel";
import { useAbonnement } from "@/lib/repositories/abonnement";
import {
  changerActivationEntree,
  creerEntree,
  ecouterReferentiel,
  messageErreurReferentiel,
  renommerEntree,
} from "@/lib/repositories/referentiels";

/**
 * Provenances et types de frais.
 *
 * Deux listes courtes qui n'ont pas de page chacune : on les consulte au même
 * moment — en préparant la saisie d'une entrée en stock — et les séparer
 * ajouterait un aller-retour pour rien.
 *
 * **En onglets depuis S54**, comme le catalogue. Elles sont courtes, mais deux
 * écrans qui font la même chose doivent la faire pareil : le geste appris sur
 * les marques doit marcher ici sans réapprentissage.
 *
 * **Les deux listes appartiennent à l'entreprise, pas à une boutique.**
 * Collections uniques, comme les marques : ce qu'une boutique déclare, les
 * autres le lisent.
 */
export default function PageReferentiels() {
  return (
    <GardeCapacite capacite="gerer_referentiels">
      <Referentiels />
    </GardeCapacite>
  );
}

const actionsPour = (nomCollection: "provenances" | "typesFrais"): ActionsReferentiel => ({
  creer: (nom, auteur) => creerEntree(nomCollection, nom, auteur).enregistre,
  renommer: (id, nom, auteur) => renommerEntree(nomCollection, id, nom, auteur),
  basculer: (id, actif, auteur) => changerActivationEntree(nomCollection, id, actif, auteur),
  messageErreur: messageErreurReferentiel,
});

const ACTIONS_PROVENANCES = actionsPour("provenances");
const ACTIONS_TYPES_FRAIS = actionsPour("typesFrais");

function Referentiels() {
  const [onglet, setOnglet] = useState<"provenances" | "frais">("provenances");

  const souscrireProvenances = useCallback(
    (auChangement: (v: Referentiel[]) => void, enErreur: (c: unknown) => void) =>
      ecouterReferentiel("provenances", auChangement, enErreur),
    [],
  );
  const souscrireTypesFrais = useCallback(
    (auChangement: (v: Referentiel[]) => void, enErreur: (c: unknown) => void) =>
      ecouterReferentiel("typesFrais", auChangement, enErreur),
    [],
  );

  const provenances = useAbonnement(
    souscrireProvenances,
    "Les provenances n’ont pas pu être chargées.",
  );
  const typesFrais = useAbonnement(
    souscrireTypesFrais,
    "Les types de frais n’ont pas pu être chargés.",
  );

  return (
    <div>
      <TetePage retour={{ href: "/motos", libelle: "Motos" }} titre="Provenances et frais" />
      <p className="mt-2 max-w-prose text-encre-doux">
        D’où viennent les motos, et quels frais s’ajoutent à leur prix d’achat. Ces deux listes
        valent pour toutes les boutiques de motos, et alimentent le formulaire d’entrée en stock.
      </p>

      <Onglets
        libelle="Ce que vous réglez"
        valeur={onglet}
        changer={setOnglet}
        className="mt-6"
        onglets={[
          {
            valeur: "provenances",
            libelle: "Provenances",
            contenu: (
              <ListeReferentiel
                singulier="provenance"
                determinant="cette"
                exemples="Import, Confrère, Reprise client"
                entrees={provenances.valeur}
                erreur={provenances.erreur}
                actions={ACTIONS_PROVENANCES}
              />
            ),
          },
          {
            valeur: "frais",
            libelle: "Types de frais",
            contenu: (
              <ListeReferentiel
                singulier="type de frais"
                determinant="ce"
                exemples="Transport, Remise en état, Commission"
                entrees={typesFrais.valeur}
                erreur={typesFrais.erreur}
                actions={ACTIONS_TYPES_FRAIS}
              />
            ),
          },
        ]}
      />
    </div>
  );
}
