"use client";

import { ArrowLeft, LoaderCircle, Plus } from "lucide-react";
import Link from "next/link";
import { useCallback, useState } from "react";
import { GardeCapacite } from "@/components/GardeSession";
import { ListeReferentiel, type ActionsReferentiel } from "@/components/ListeReferentiel";
import { useSession } from "@/lib/auth/session";
import {
  LONGUEUR_NOM_MAX,
  comparerReferentiels,
  nomDejaPris,
  validerNom,
  type Modele,
  type Referentiel,
} from "@/lib/domain/referentiel";
import { useAbonnement } from "@/lib/repositories/abonnement";
import {
  changerActivationEntree,
  changerActivationModele,
  creerEntree,
  creerModele,
  ecouterModeles,
  ecouterReferentiel,
  messageErreurReferentiel,
  renommerEntree,
  renommerModele,
} from "@/lib/repositories/referentiels";

/**
 * Le catalogue : marques, et modèles de chaque marque.
 *
 * Les modèles se gèrent marque par marque plutôt qu'en une liste unique. « Crux
 * » ne veut rien dire sans « Yamaha » devant, et une liste de deux cents
 * modèles toutes marques confondues ne se relit pas.
 */
export default function PageCatalogue() {
  return (
    <GardeCapacite capacite="gerer_referentiels">
      <Catalogue />
    </GardeCapacite>
  );
}

const ACTIONS_MARQUES: ActionsReferentiel = {
  creer: (nom, auteur) => creerEntree("marques", nom, auteur),
  renommer: (id, nom, auteur) => renommerEntree("marques", id, nom, auteur),
  basculer: (id, actif, auteur) => changerActivationEntree("marques", id, actif, auteur),
  messageErreur: messageErreurReferentiel,
};

function Catalogue() {
  const souscrireMarques = useCallback(
    (auChangement: (v: Referentiel[]) => void, enErreur: (c: unknown) => void) =>
      ecouterReferentiel("marques", auChangement, enErreur),
    [],
  );
  const souscrireModeles = useCallback(
    (auChangement: (v: Modele[]) => void, enErreur: (c: unknown) => void) =>
      ecouterModeles(auChangement, enErreur),
    [],
  );

  const marques = useAbonnement(souscrireMarques, "Les marques n’ont pas pu être chargées.");
  const modeles = useAbonnement(souscrireModeles, "Les modèles n’ont pas pu être chargés.");

  const [marqueChoisie, setMarqueChoisie] = useState("");
  const listeMarques = marques.valeur ?? [];
  const ouvertes = listeMarques.filter((marque) => marque.actif);

  /* Si aucune marque n'est encore choisie, on prend la première : l'écran des
     modèles a besoin d'une marque pour dire quoi que ce soit, et ouvrir sur un
     menu vide obligerait à un clic avant même de comprendre l'écran. */
  const marqueActive = ouvertes.find((marque) => marque.id === marqueChoisie) ?? ouvertes[0];

  return (
    <div>
      <Link
        href="/parametres"
        className="inline-flex items-center gap-2 text-sm text-encre-doux hover:text-encre"
      >
        <ArrowLeft aria-hidden="true" className="size-4" />
        Réglages
      </Link>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight text-encre">Marques et modèles</h1>
      <p className="mt-2 max-w-prose text-encre-doux">
        Ce que vous vendez. Une moto entrée en stock choisira sa marque puis son modèle dans ces
        listes — jamais en texte libre, sinon le même modèle finit écrit de trois façons.
      </p>

      <div className="mt-6 space-y-8">
        <ListeReferentiel
          titre="Marques"
          singulier="marque"
          determinant="cette"
          exemples="Yamaha, TVS, Apsonic"
          entrees={listeMarques}
          chargement={marques.valeur === null && !marques.erreur}
          erreur={marques.erreur}
          actions={ACTIONS_MARQUES}
        />

        <Modeles
          marques={ouvertes}
          marqueActive={marqueActive}
          choisir={setMarqueChoisie}
          modeles={modeles.valeur}
          erreur={modeles.erreur}
        />
      </div>
    </div>
  );
}

function Modeles({
  marques,
  marqueActive,
  choisir,
  modeles,
  erreur,
}: {
  marques: Referentiel[];
  marqueActive: Referentiel | undefined;
  choisir: (id: string) => void;
  modeles: Modele[] | null;
  erreur: string | null;
}) {
  const session = useSession();
  const [nom, setNom] = useState("");
  const [erreurSaisie, setErreurSaisie] = useState<string | null>(null);

  if (marques.length === 0) {
    return (
      <section>
        <h2 className="text-sm font-semibold tracking-wide text-encre-doux uppercase">Modèles</h2>
        <p className="mt-3 rounded-plaque border border-dashed border-bord p-4 text-encre-doux">
          Ajoutez d’abord une marque&nbsp;: un modèle n’existe pas tout seul.
        </p>
      </section>
    );
  }

  const deLaMarque = (modeles ?? [])
    .filter((modele) => modele.marqueId === marqueActive?.id)
    .sort(comparerReferentiels);

  function ajouter(evenement: React.FormEvent) {
    evenement.preventDefault();
    if (session.statut !== "connecte" || !marqueActive) return;

    const probleme = validerNom(nom, "modèle");
    if (probleme) {
      setErreurSaisie(probleme);
      return;
    }
    if (nomDejaPris(nom, deLaMarque)) {
      setErreurSaisie(`« ${nom.trim()} » existe déjà chez ${marqueActive.nom}.`);
      return;
    }

    setErreurSaisie(null);
    creerModele(marqueActive.id, nom, {
      uid: session.utilisateur.uid,
      nom: session.utilisateur.nom,
    }).catch((cause) => setErreurSaisie(messageErreurReferentiel(cause)));
    setNom("");
  }

  return (
    <section>
      <h2 className="text-sm font-semibold tracking-wide text-encre-doux uppercase">Modèles</h2>

      <div className="mt-3">
        <label htmlFor="marque-active" className="block text-sm font-medium text-encre">
          Marque
        </label>
        <select
          id="marque-active"
          value={marqueActive?.id ?? ""}
          onChange={(evenement) => choisir(evenement.target.value)}
          className="mt-1.5 h-12 w-full rounded-plaque border border-bord bg-papier px-3 text-encre"
        >
          {marques.map((marque) => (
            <option key={marque.id} value={marque.id}>
              {marque.nom}
            </option>
          ))}
        </select>
      </div>

      <form onSubmit={ajouter} className="mt-3" noValidate>
        <label htmlFor="ajout-modele" className="block text-sm font-medium text-encre">
          Ajouter un modèle {marqueActive ? `chez ${marqueActive.nom}` : ""}
        </label>
        <div className="mt-1.5 flex gap-2">
          <input
            id="ajout-modele"
            value={nom}
            maxLength={LONGUEUR_NOM_MAX}
            placeholder="Crux, YBR 125, Star 110"
            onChange={(evenement) => setNom(evenement.target.value)}
            className="h-12 min-w-0 flex-1 rounded-plaque border border-bord bg-papier px-3 text-encre placeholder:text-encre-doux"
          />
          <button
            type="submit"
            className="inline-flex h-12 shrink-0 items-center gap-2 rounded-plaque border border-plaque-bord bg-plaque px-4 font-semibold text-encre-fixe"
          >
            <Plus aria-hidden="true" className="size-4" />
            Ajouter
          </button>
        </div>
        <p role="alert" aria-live="assertive" className="mt-1 min-h-5 text-sm text-alerte">
          {erreurSaisie ?? ""}
        </p>
      </form>

      {erreur && (
        <p role="alert" className="mt-3 text-sm text-alerte">
          {erreur}
        </p>
      )}

      {modeles === null && !erreur ? (
        <p className="mt-3 flex items-center gap-3 text-encre-doux">
          <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
          Chargement…
        </p>
      ) : deLaMarque.length === 0 && !erreur ? (
        <p className="mt-3 rounded-plaque border border-dashed border-bord p-4 text-encre-doux">
          Aucun modèle chez {marqueActive?.nom}. Ajoutez ceux que vous vendez réellement.
        </p>
      ) : (
        <ul className="mt-3 divide-y divide-bord overflow-hidden rounded-plaque border border-bord bg-papier">
          {deLaMarque.map((modele) => (
            <LigneModele key={modele.id} modele={modele} freres={deLaMarque} />
          ))}
        </ul>
      )}
    </section>
  );
}

function LigneModele({ modele, freres }: { modele: Modele; freres: Modele[] }) {
  const session = useSession();
  const [edition, setEdition] = useState(false);
  const [nom, setNom] = useState(modele.nom);
  const [erreur, setErreur] = useState<string | null>(null);

  const auteur =
    session.statut === "connecte"
      ? { uid: session.utilisateur.uid, nom: session.utilisateur.nom }
      : null;

  function enregistrer(evenement: React.FormEvent) {
    evenement.preventDefault();
    if (!auteur) return;

    const probleme = validerNom(nom, "modèle");
    if (probleme) {
      setErreur(probleme);
      return;
    }
    if (nomDejaPris(nom, freres, modele.id)) {
      setErreur(`« ${nom.trim()} » existe déjà chez cette marque.`);
      return;
    }

    setErreur(null);
    renommerModele(modele.id, nom, auteur).catch((cause) =>
      setErreur(messageErreurReferentiel(cause)),
    );
    setEdition(false);
  }

  return (
    <li className="px-4 py-3">
      {edition ? (
        <form onSubmit={enregistrer} className="flex flex-wrap gap-2" noValidate>
          <label className="sr-only" htmlFor={`modele-${modele.id}`}>
            Nouveau nom du modèle
          </label>
          <input
            id={`modele-${modele.id}`}
            autoFocus
            value={nom}
            maxLength={LONGUEUR_NOM_MAX}
            onChange={(evenement) => setNom(evenement.target.value)}
            className="h-11 min-w-0 flex-1 rounded-plaque border border-bord bg-papier px-3 text-encre"
          />
          <button
            type="submit"
            className="inline-flex h-11 items-center rounded-plaque border border-plaque-bord bg-plaque px-3 text-sm font-semibold text-encre-fixe"
          >
            Enregistrer
          </button>
          <button
            type="button"
            onClick={() => {
              setNom(modele.nom);
              setEdition(false);
              setErreur(null);
            }}
            className="inline-flex h-11 items-center rounded-plaque border border-bord px-3 text-sm font-medium text-encre hover:bg-fond"
          >
            Annuler
          </button>
        </form>
      ) : (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <span className="flex min-w-0 flex-1 items-center gap-2">
            <span className={modele.actif ? "font-medium text-encre" : "text-encre-doux"}>
              {modele.nom}
            </span>
            {!modele.actif && (
              <span className="rounded-plaque border border-bord px-1.5 py-0.5 text-xs font-medium text-alerte">
                Retiré des choix
              </span>
            )}
          </span>
          <span className="flex shrink-0 gap-2">
            <button
              type="button"
              onClick={() => setEdition(true)}
              className="inline-flex h-11 items-center rounded-plaque border border-bord px-3 text-sm font-medium text-encre hover:bg-fond"
            >
              Renommer
            </button>
            <button
              type="button"
              onClick={() => {
                if (!auteur) return;
                setErreur(null);
                changerActivationModele(modele.id, !modele.actif, auteur).catch((cause) =>
                  setErreur(messageErreurReferentiel(cause)),
                );
              }}
              className="inline-flex h-11 items-center rounded-plaque border border-bord px-3 text-sm font-medium text-encre hover:bg-fond"
            >
              {modele.actif ? "Retirer" : "Remettre"}
            </button>
          </span>
        </div>
      )}

      {erreur && (
        <p role="alert" className="mt-2 text-sm text-alerte">
          {erreur}
        </p>
      )}
    </li>
  );
}
