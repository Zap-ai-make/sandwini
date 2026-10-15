"use client";

import { Plus } from "lucide-react";
import { useState } from "react";
import { useSession } from "@/lib/auth/session";
import {
  LONGUEUR_NOM_MAX,
  nomDejaPris,
  validerNom,
  type Referentiel,
} from "@/lib/domain/referentiel";
import { EtatChargement, EtatErreur, EtatErreurSaisie, EtatSansResultat } from "@/components/patrons/Etats";

/**
 * Une liste de référentiel : un nom, un état, rien de plus.
 *
 * Marques, provenances, types de frais ont exactement cette forme. Leur donner
 * trois écrans différents serait de la décoration ; ce composant les sert tous
 * les trois, et chaque page lui passe ses mots à elle — « cette marque », « ce
 * type de frais » — parce qu'un bouton qui dit « Ajouter un élément » ne dit
 * rien (`DESIGN.md` §12).
 *
 * Ce qu'il ne fait pas : supprimer. Une marque est citée par des motos, un type
 * de frais par des lignes de coût. Désactivée, l'entrée sort des listes de
 * choix et reste lisible partout où elle a déjà servi.
 */

export type ActionsReferentiel = {
  creer: (nom: string, auteur: { uid: string; nom: string }) => Promise<unknown>;
  renommer: (id: string, nom: string, auteur: { uid: string; nom: string }) => Promise<unknown>;
  basculer: (
    id: string,
    actif: boolean,
    auteur: { uid: string; nom: string },
  ) => Promise<unknown>;
  messageErreur: (cause: unknown) => string;
};

export function ListeReferentiel({
  titre,
  singulier,
  determinant,
  exemples,
  entrees,
  erreur,
  actions,
}: {
  /**
   * Omis quand un onglet nomme déjà le panneau (S54) : « Marques » écrit sur
   * l'onglet actif puis réécrit juste en dessous ne dit rien de plus, et c'est
   * la ligne de bruit que le commanditaire appelle « pas épuré ».
   */
  titre?: string;
  /** « marque », « provenance »… pour les libellés de champs et de messages. */
  singulier: string;
  /** « cette » ou « ce » : le français a besoin de savoir. */
  determinant: "cette" | "ce";
  /** Deux ou trois vrais exemples du métier, pas des « Élément 1 ». */
  exemples: string;
  /**
   * Les entrées, ou `null` tant que l'écoute n'a pas répondu.
   *
   * **La nullité entre ici plutôt que de s'arrêter chez l'appelant**, et c'est
   * l'arbitrage 3 de S40. Les deux pages qui montent cette liste écrivaient
   * `entrees={marques.valeur ?? []}` : l'aplatissement avait lieu dans le JSX,
   * une ligne au-dessus du composant chargé de refuser les doublons. Le
   * composant ne pouvait donc pas distinguer « pas encore lu » de « vide », et
   * son contrôle d'unicité répondait « libre » à une question non posée (D95).
   * En acceptant `null`, il retire à ses appelants — présents et à venir — la
   * possibilité de refaire ce trou.
   */
  entrees: Referentiel[] | null;
  erreur: string | null;
  actions: ActionsReferentiel;
}) {
  return (
    <section>
      {titre && (
        <h2 className="text-sm font-semibold tracking-wide text-encre-doux uppercase">{titre}</h2>
      )}

      <Ajout
        singulier={singulier}
        determinant={determinant}
        exemples={exemples}
        entrees={entrees}
        actions={actions}
      />

      <EtatErreur message={erreur} className="mt-3" />

      {/* Trois états, trois réponses, et jamais deux confondus : la liste
          n'est pas là, la liste est vide, la liste est pleine. La lecture
          échouée est déjà dite au-dessus — on n'ajoute pas « aucune entrée »
          par-dessus un refus (`DESIGN.md` §10). */}
      {entrees === null ? (
        erreur ? null : <EtatChargement className="mt-3">Chargement…</EtatChargement>
      ) : entrees.length === 0 && !erreur ? (
        <EtatSansResultat className="mt-3">
          Aucune entrée pour l’instant. Ajoutez celles que vous utilisez vraiment&nbsp;: {exemples}.
        </EtatSansResultat>
      ) : (
        <ul className="mt-3 cadre cadre-liste">
          {entrees.map((entree) => (
            <Ligne
              key={entree.id}
              entree={entree}
              designation={`${determinant} ${singulier}`}
              entrees={entrees}
              actions={actions}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

function Ajout({
  singulier,
  determinant,
  exemples,
  entrees,
  actions,
}: {
  singulier: string;
  determinant: "cette" | "ce";
  exemples: string;
  entrees: Referentiel[] | null;
  actions: ActionsReferentiel;
}) {
  const session = useSession();
  const [nom, setNom] = useState("");
  const [erreur, setErreur] = useState<string | null>(null);
  const identifiant = `ajout-${singulier.replace(/\s+/g, "-")}`;
  const designation = `${determinant} ${singulier}`;

  function soumettre(evenement: React.FormEvent) {
    evenement.preventDefault();
    if (session.statut !== "connecte") return;

    const probleme = validerNom(nom, designation);
    if (probleme) {
      setErreur(probleme);
      return;
    }
    /* Pas de liste, pas de verdict : sans elle ce contrôle répondrait « libre »
       sur une liste qu'il n'a pas lue, et créerait le doublon qu'il existe
       pour empêcher (D95). */
    if (entrees === null) {
      setErreur(`La liste n’a pas fini d’arriver. Réessayez dans un instant.`);
      return;
    }
    if (nomDejaPris(nom, entrees)) {
      setErreur(`« ${nom.trim()} » existe déjà, à la casse près.`);
      return;
    }

    setErreur(null);
    /* Pas d’attente : hors ligne, la promesse ne se résout qu’au retour du
       réseau, mais l’écriture est déjà dans le cache — la liste bouge tout de
       suite et le bandeau compte la saisie en attente. */
    actions
      .creer(nom, { uid: session.utilisateur.uid, nom: session.utilisateur.nom })
      .catch((cause) => setErreur(actions.messageErreur(cause)));
    setNom("");
  }

  return (
    <form onSubmit={soumettre} className="colonne-formulaire mt-3 max-w-[40rem]" noValidate>
      <label htmlFor={identifiant} className="block text-sm font-medium text-encre">
        Ajouter {determinant === "cette" ? "une" : "un"} {singulier}
      </label>
      <div className="mt-1.5 flex gap-2">
        <input
          id={identifiant}
          value={nom}
          maxLength={LONGUEUR_NOM_MAX}
          placeholder={exemples}
          onChange={(evenement) => setNom(evenement.target.value)}
          className="saisie min-w-0 flex-1 placeholder:text-encre-doux"
        />
        <button
          type="submit"
          disabled={entrees === null}
          className="bouton bouton-principal shrink-0"
        >
          {entrees === null ? (
            "Lecture…"
          ) : (
            <>
              <Plus aria-hidden="true" className="size-4" />
              Ajouter
            </>
          )}
        </button>
      </div>
      <EtatErreurSaisie message={erreur} className="mt-1" />
    </form>
  );
}

function Ligne({
  entree,
  designation,
  entrees,
  actions,
}: {
  entree: Referentiel;
  /** « cette marque », « ce type de frais » — déterminant compris. */
  designation: string;
  entrees: Referentiel[];
  actions: ActionsReferentiel;
}) {
  const session = useSession();
  const [edition, setEdition] = useState(false);
  const [nom, setNom] = useState(entree.nom);
  const [erreur, setErreur] = useState<string | null>(null);

  const auteur =
    session.statut === "connecte"
      ? { uid: session.utilisateur.uid, nom: session.utilisateur.nom }
      : null;

  function enregistrer(evenement: React.FormEvent) {
    evenement.preventDefault();
    if (!auteur) return;

    const probleme = validerNom(nom, designation);
    if (probleme) {
      setErreur(probleme);
      return;
    }
    if (nomDejaPris(nom, entrees, entree.id)) {
      setErreur(`« ${nom.trim()} » existe déjà, à la casse près.`);
      return;
    }

    setErreur(null);
    actions
      .renommer(entree.id, nom, auteur)
      .catch((cause) => setErreur(actions.messageErreur(cause)));
    setEdition(false);
  }

  function basculer() {
    if (!auteur) return;
    setErreur(null);
    actions
      .basculer(entree.id, !entree.actif, auteur)
      .catch((cause) => setErreur(actions.messageErreur(cause)));
  }

  return (
    <li className="px-4 py-3">
      {edition ? (
        <form onSubmit={enregistrer} className="colonne-formulaire flex max-w-[40rem] flex-wrap gap-2" noValidate>
          <label className="sr-only" htmlFor={`nom-${entree.id}`}>
            Nouveau nom
          </label>
          <input
            id={`nom-${entree.id}`}
            autoFocus
            value={nom}
            maxLength={LONGUEUR_NOM_MAX}
            onChange={(evenement) => setNom(evenement.target.value)}
            className="saisie h-11 min-w-0 flex-1"
          />
          <button
            type="submit"
            className="bouton bouton-principal h-11 text-sm"
          >
            Enregistrer
          </button>
          <button
            type="button"
            onClick={() => {
              setNom(entree.nom);
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
            <span className={entree.actif ? "font-medium text-encre" : "text-encre-doux"}>
              {entree.nom}
            </span>
            {/* L’état ne passe jamais par la seule couleur (DESIGN.md §5). */}
            {!entree.actif && (
              <span className="rounded-plaque border border-bord px-1.5 py-0.5 text-xs font-medium text-alerte">
                Retirée des choix
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
              onClick={basculer}
              className="inline-flex h-11 items-center rounded-plaque border border-bord px-3 text-sm font-medium text-encre hover:bg-fond"
            >
              {entree.actif ? "Retirer" : "Remettre"}
            </button>
          </span>
        </div>
      )}

      <EtatErreur message={erreur} className="mt-2" />
    </li>
  );
}
