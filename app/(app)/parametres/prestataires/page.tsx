"use client";

import { Phone } from "lucide-react";
import { useCallback, useState } from "react";
import { GardeCapacite } from "@/components/GardeSession";
import {
  EtatChargement,
  EtatErreur,
  EtatErreurSaisie,
  EtatSansResultat,
} from "@/components/patrons/Etats";
import { Champ } from "@/components/patrons/Champ";
import { TetePage } from "@/components/patrons/Page";
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
      <TetePage retour={{ href: "/parametres", libelle: "Réglages" }} titre="Prestataires" />
      <p className="mt-2 max-w-prose text-encre-doux">
        Ceux à qui vous confiez les cartes grises et les plaques. Ils apparaîtront au moment de
        déposer un dossier, filtrés selon ce qu’ils traitent.
      </p>

      <Formulaire />

      <h2 className="mt-8 text-sm font-semibold tracking-wide text-encre-doux uppercase">
        Prestataires enregistrés
      </h2>

      <EtatErreur message={erreur} className="mt-3" />

      {valeur === null && !erreur ? (
        <EtatChargement className="mt-3">Chargement des prestataires…</EtatChargement>
      ) : (valeur ?? []).length === 0 && !erreur ? (
        <EtatSansResultat className="mt-3">
          Aucun prestataire pour l’instant. Tant qu’il n’y en a pas, un dossier ne peut pas être
          marqué comme déposé.
        </EtatSansResultat>
      ) : (
        <ul className="mt-3 cadre cadre-liste">
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
    <div className="colonne-formulaire max-w-[40rem] space-y-4">
      <div className="mt-4">
        <Champ id={`${prefixe}-nom`} libelle="Nom">
          <input
            id={`${prefixe}-nom`}
            value={saisie.nom}
            maxLength={LONGUEUR_NOM_MAX}
            onChange={(evenement) => changer({ nom: evenement.target.value })}
            className="saisie"
          />
        </Champ>
      </div>

      <Champ id={`${prefixe}-telephone`} libelle="Téléphone">
        <input
          id={`${prefixe}-telephone`}
          type="tel"
          inputMode="tel"
          value={saisie.telephone}
          maxLength={LONGUEUR_TELEPHONE_MAX}
          onChange={(evenement) => changer({ telephone: evenement.target.value })}
          className="saisie"
        />
      </Champ>

      <ChoixTypes
        valeurs={saisie.typesDocuments}
        changer={(typesDocuments) => changer({ typesDocuments })}
        prefixe={prefixe}
      />
    </div>
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
    <form onSubmit={soumettre} className="mt-6 cadre p-4" noValidate>
      <h2 className="font-semibold text-encre">Ajouter un prestataire</h2>

      <Champs
        saisie={saisie}
        changer={(partie) => setSaisie((actuel) => ({ ...actuel, ...partie }))}
        prefixe="nouveau"
      />

      <EtatErreurSaisie message={erreur} className="mt-3" />
      {succes && (
        <p role="status" aria-live="polite" className="text-sm text-solde">
          {succes}
        </p>
      )}

      <button type="submit" className="mt-3 bouton bouton-principal">
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

      <EtatErreur message={erreur} className="mt-2" />

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
          <button type="submit" className="mt-4 bouton bouton-principal">
            Enregistrer
          </button>
        </form>
      )}
    </li>
  );
}
