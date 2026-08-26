"use client";

import { ArrowLeft, LoaderCircle, Phone } from "lucide-react";
import Link from "next/link";
import { useCallback, useState } from "react";
import { GardeCapacite } from "@/components/GardeSession";
import { useSession } from "@/lib/auth/session";
import {
  LIBELLE_TYPE_DOCUMENT,
  LONGUEUR_NOM_MAX,
  LONGUEUR_TELEPHONE_MAX,
  TYPES_DOCUMENTS,
  libelleTypes,
  validerPrestataire,
  type Prestataire,
  type SaisiePrestataire,
  type TypeDocument,
} from "@/lib/domain/prestataire";
import { useAbonnement } from "@/lib/repositories/abonnement";
import {
  changerActivationPrestataire,
  creerPrestataire,
  ecouterPrestataires,
  modifierPrestataire,
} from "@/lib/repositories/prestataires";
import { messageErreurReferentiel } from "@/lib/repositories/referentiels";

/**
 * Les prestataires.
 *
 * Ce ne sont pas des noms dans une liste : on leur confie un dossier, on leur
 * verse une avance, et le client rappelle pour savoir où en est sa carte grise.
 * D'où le téléphone, obligatoire, et le type de document — proposer un
 * fabricant de plaques pour une carte grise est une erreur qui ne se voit
 * qu'une semaine plus tard.
 */
export default function PagePrestataires() {
  return (
    <GardeCapacite capacite="gerer_referentiels">
      <Prestataires />
    </GardeCapacite>
  );
}

const VIDE: SaisiePrestataire = { nom: "", telephone: "", typesDocuments: [] };

function Prestataires() {
  const souscrire = useCallback(
    (auChangement: (v: Prestataire[]) => void, enErreur: (c: unknown) => void) =>
      ecouterPrestataires(auChangement, enErreur),
    [],
  );
  const { valeur, erreur } = useAbonnement(
    souscrire,
    "La liste des prestataires n’a pas pu être chargée.",
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
      <h1 className="mt-2 text-2xl font-semibold tracking-tight text-encre">Prestataires</h1>
      <p className="mt-2 max-w-prose text-encre-doux">
        Ceux à qui vous confiez les cartes grises et les plaques. Ils apparaîtront au moment de
        déposer un dossier, filtrés selon ce qu’ils traitent.
      </p>

      <Formulaire />

      <h2 className="mt-8 text-sm font-semibold tracking-wide text-encre-doux uppercase">
        Prestataires enregistrés
      </h2>

      {erreur && (
        <p role="alert" className="mt-3 text-sm text-alerte">
          {erreur}
        </p>
      )}

      {valeur === null && !erreur ? (
        <p className="mt-3 flex items-center gap-3 text-encre-doux">
          <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
          Chargement des prestataires…
        </p>
      ) : (valeur ?? []).length === 0 && !erreur ? (
        <p className="mt-3 rounded-plaque border border-dashed border-bord p-4 text-encre-doux">
          Aucun prestataire pour l’instant. Tant qu’il n’y en a pas, un dossier ne peut pas être
          marqué comme déposé.
        </p>
      ) : (
        <ul className="mt-3 divide-y divide-bord overflow-hidden rounded-plaque border border-bord bg-papier">
          {(valeur ?? []).map((prestataire) => (
            <Ligne key={prestataire.id} prestataire={prestataire} />
          ))}
        </ul>
      )}
    </div>
  );
}

function ChoixTypes({
  valeurs,
  changer,
  prefixe,
}: {
  valeurs: TypeDocument[];
  changer: (types: TypeDocument[]) => void;
  prefixe: string;
}) {
  return (
    <fieldset className="mt-4">
      <legend className="text-sm font-medium text-encre">Documents traités</legend>
      <div className="mt-1.5 flex flex-wrap gap-4">
        {TYPES_DOCUMENTS.map((type) => (
          <label key={type} className="flex items-center gap-2 text-encre">
            <input
              type="checkbox"
              id={`${prefixe}-${type}`}
              checked={valeurs.includes(type)}
              onChange={(evenement) =>
                changer(
                  evenement.target.checked
                    ? [...valeurs, type]
                    : valeurs.filter((autre) => autre !== type),
                )
              }
              className="size-5 rounded-plaque border-bord accent-plaque"
            />
            {LIBELLE_TYPE_DOCUMENT[type]}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function Champs({
  saisie,
  changer,
  prefixe,
}: {
  saisie: SaisiePrestataire;
  changer: (partie: Partial<SaisiePrestataire>) => void;
  prefixe: string;
}) {
  return (
    <>
      <div className="mt-4">
        <label htmlFor={`${prefixe}-nom`} className="block text-sm font-medium text-encre">
          Nom
        </label>
        <input
          id={`${prefixe}-nom`}
          value={saisie.nom}
          maxLength={LONGUEUR_NOM_MAX}
          onChange={(evenement) => changer({ nom: evenement.target.value })}
          className="mt-1.5 h-12 w-full rounded-plaque border border-bord bg-papier px-3 text-encre"
        />
      </div>

      <div className="mt-4">
        <label htmlFor={`${prefixe}-telephone`} className="block text-sm font-medium text-encre">
          Téléphone
        </label>
        <input
          id={`${prefixe}-telephone`}
          type="tel"
          inputMode="tel"
          value={saisie.telephone}
          maxLength={LONGUEUR_TELEPHONE_MAX}
          onChange={(evenement) => changer({ telephone: evenement.target.value })}
          className="mt-1.5 h-12 w-full rounded-plaque border border-bord bg-papier px-3 text-encre"
        />
      </div>

      <ChoixTypes
        valeurs={saisie.typesDocuments}
        changer={(typesDocuments) => changer({ typesDocuments })}
        prefixe={prefixe}
      />
    </>
  );
}

function Formulaire() {
  const session = useSession();
  const [saisie, setSaisie] = useState<SaisiePrestataire>(VIDE);
  const [erreur, setErreur] = useState<string | null>(null);
  const [succes, setSucces] = useState<string | null>(null);

  function soumettre(evenement: React.FormEvent) {
    evenement.preventDefault();
    if (session.statut !== "connecte") return;
    setSucces(null);

    const probleme = validerPrestataire(saisie);
    if (probleme) {
      setErreur(probleme);
      return;
    }

    setErreur(null);
    const nom = saisie.nom.trim();
    creerPrestataire(saisie, {
      uid: session.utilisateur.uid,
      nom: session.utilisateur.nom,
    }).catch((cause) => setErreur(messageErreurReferentiel(cause)));
    setSaisie(VIDE);
    setSucces(`${nom} est enregistré.`);
  }

  return (
    <form
      onSubmit={soumettre}
      className="mt-6 rounded-plaque border border-bord bg-papier p-4"
      noValidate
    >
      <h2 className="font-semibold text-encre">Ajouter un prestataire</h2>

      <Champs
        saisie={saisie}
        changer={(partie) => setSaisie((actuel) => ({ ...actuel, ...partie }))}
        prefixe="nouveau"
      />

      <p role="alert" aria-live="assertive" className="mt-3 min-h-5 text-sm text-alerte">
        {erreur ?? ""}
      </p>
      {succes && (
        <p role="status" aria-live="polite" className="text-sm text-solde">
          {succes}
        </p>
      )}

      <button
        type="submit"
        className="mt-3 inline-flex h-12 items-center rounded-plaque border border-plaque-bord bg-plaque px-5 font-semibold text-encre-fixe"
      >
        Enregistrer le prestataire
      </button>
    </form>
  );
}

function Ligne({ prestataire }: { prestataire: Prestataire }) {
  const session = useSession();
  const [edition, setEdition] = useState(false);
  const [saisie, setSaisie] = useState<SaisiePrestataire>({
    nom: prestataire.nom,
    telephone: prestataire.telephone,
    typesDocuments: prestataire.typesDocuments,
  });
  const [erreur, setErreur] = useState<string | null>(null);

  const auteur =
    session.statut === "connecte"
      ? { uid: session.utilisateur.uid, nom: session.utilisateur.nom }
      : null;

  function enregistrer(evenement: React.FormEvent) {
    evenement.preventDefault();
    if (!auteur) return;

    const probleme = validerPrestataire(saisie);
    if (probleme) {
      setErreur(probleme);
      return;
    }

    setErreur(null);
    modifierPrestataire(prestataire.id, saisie, auteur).catch((cause) =>
      setErreur(messageErreurReferentiel(cause)),
    );
    setEdition(false);
  }

  return (
    <li className="px-4 py-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2">
            <span className={prestataire.actif ? "font-medium text-encre" : "text-encre-doux"}>
              {prestataire.nom}
            </span>
            {!prestataire.actif && (
              <span className="rounded-plaque border border-bord px-1.5 py-0.5 text-xs font-medium text-alerte">
                Retiré des choix
              </span>
            )}
          </span>
          <span className="flex items-center gap-1.5 text-sm text-encre-doux">
            <Phone aria-hidden="true" className="size-3.5 shrink-0" />
            {prestataire.telephone}
          </span>
          <span className="block text-sm text-encre-doux">
            {libelleTypes(prestataire.typesDocuments)}
          </span>
        </span>

        <span className="flex shrink-0 gap-2">
          <button
            type="button"
            onClick={() => setEdition((ouvert) => !ouvert)}
            aria-expanded={edition}
            className="inline-flex h-11 items-center rounded-plaque border border-bord px-3 text-sm font-medium text-encre hover:bg-fond"
          >
            {edition ? "Annuler" : "Modifier"}
          </button>
          <button
            type="button"
            onClick={() => {
              if (!auteur) return;
              setErreur(null);
              changerActivationPrestataire(prestataire.id, !prestataire.actif, auteur).catch(
                (cause) => setErreur(messageErreurReferentiel(cause)),
              );
            }}
            className="inline-flex h-11 items-center rounded-plaque border border-bord px-3 text-sm font-medium text-encre hover:bg-fond"
          >
            {prestataire.actif ? "Retirer" : "Remettre"}
          </button>
        </span>
      </div>

      {erreur && (
        <p role="alert" className="mt-2 text-sm text-alerte">
          {erreur}
        </p>
      )}

      {edition && (
        <form
          onSubmit={enregistrer}
          className="mt-3 rounded-plaque border border-bord bg-fond p-4"
          noValidate
        >
          <h3 className="text-sm font-semibold text-encre">Modifier {prestataire.nom}</h3>
          <Champs
            saisie={saisie}
            changer={(partie) => setSaisie((actuel) => ({ ...actuel, ...partie }))}
            prefixe={`edition-${prestataire.id}`}
          />
          <button
            type="submit"
            className="mt-4 inline-flex h-12 items-center rounded-plaque border border-plaque-bord bg-plaque px-5 font-semibold text-encre-fixe"
          >
            Enregistrer
          </button>
        </form>
      )}
    </li>
  );
}
