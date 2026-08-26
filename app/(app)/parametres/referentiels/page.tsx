"use client";

import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useCallback } from "react";
import { GardeCapacite } from "@/components/GardeSession";
import { ListeReferentiel, type ActionsReferentiel } from "@/components/ListeReferentiel";
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
 */
export default function PageReferentiels() {
  return (
    <GardeCapacite capacite="gerer_referentiels">
      <Referentiels />
    </GardeCapacite>
  );
}

const actionsPour = (nomCollection: "provenances" | "typesFrais"): ActionsReferentiel => ({
  creer: (nom, auteur) => creerEntree(nomCollection, nom, auteur),
  renommer: (id, nom, auteur) => renommerEntree(nomCollection, id, nom, auteur),
  basculer: (id, actif, auteur) => changerActivationEntree(nomCollection, id, actif, auteur),
  messageErreur: messageErreurReferentiel,
});

const ACTIONS_PROVENANCES = actionsPour("provenances");
const ACTIONS_TYPES_FRAIS = actionsPour("typesFrais");

function Referentiels() {
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
      <Link
        href="/parametres"
        className="inline-flex items-center gap-2 text-sm text-encre-doux hover:text-encre"
      >
        <ArrowLeft aria-hidden="true" className="size-4" />
        Réglages
      </Link>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight text-encre">
        Provenances et frais
      </h1>
      <p className="mt-2 max-w-prose text-encre-doux">
        D’où viennent les motos, et quels frais s’ajoutent à leur prix d’achat. Ces deux listes
        alimenteront le formulaire d’entrée en stock.
      </p>

      <div className="mt-6 space-y-8">
        <ListeReferentiel
          titre="Provenances"
          singulier="provenance"
          determinant="cette"
          exemples="Import, Confrère, Reprise client"
          entrees={provenances.valeur ?? []}
          chargement={provenances.valeur === null && !provenances.erreur}
          erreur={provenances.erreur}
          actions={ACTIONS_PROVENANCES}
        />

        <ListeReferentiel
          titre="Types de frais"
          singulier="type de frais"
          determinant="ce"
          exemples="Transport, Remise en état, Commission"
          entrees={typesFrais.valeur ?? []}
          chargement={typesFrais.valeur === null && !typesFrais.erreur}
          erreur={typesFrais.erreur}
          actions={ACTIONS_TYPES_FRAIS}
        />
      </div>
    </div>
  );
}
