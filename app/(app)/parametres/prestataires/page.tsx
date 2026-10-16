"use client";

import { Phone, Plus } from "lucide-react";
import { useCallback, useState } from "react";
import { GardeCapacite } from "@/components/GardeSession";
import { LienDeSuivi } from "@/components/LienDeSuivi";
import {
  EtatChargement,
  EtatErreur,
  EtatErreurSaisie,
  EtatSansResultat,
} from "@/components/patrons/Etats";
import { Champ } from "@/components/patrons/Champ";
import { Modale } from "@/components/patrons/Modale";
import { TetePage } from "@/components/patrons/Page";
import { useSession } from "@/lib/auth/session";
import {
  LONGUEUR_NOM_MAX,
  LONGUEUR_TELEPHONE_MAX,
  TYPES_DOCUMENTS,
  libelleTypes,
  validerPrestataire,
  type Prestataire,
  type SaisiePrestataire,
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

/* Le type est posé ici et nulle part ailleurs (S53) : tous les prestataires
   traitent la carte grise, et c'est le seul type depuis S48. Le jour où un
   second apparaît, c'est ce tableau qui redeviendra un choix à l'écran — pas
   l'inverse. */
const VIDE: SaisiePrestataire = {
  nom: "",
  telephone: "",
  typesDocuments: [...TYPES_DOCUMENTS],
};

const FORMULAIRE_PRESTATAIRE = "creer-prestataire";

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
  const [creation, setCreation] = useState(false);

  return (
    <div>
      {/* La liste d'abord, la création en modale (S54). Le formulaire occupait
          le haut de l'écran en permanence : on venait presque toujours pour
          consulter ou corriger, et il fallait le dépasser à chaque fois. Un
          bouton en tête, et l'écran redevient ce qu'il est — une liste. */}
      <TetePage
        retour={{ href: "/parametres", libelle: "Paramètres" }}
        titre="Prestataires"
        actions={
          <button
            type="button"
            onClick={() => setCreation(true)}
            className="bouton bouton-principal"
          >
            <Plus aria-hidden="true" className="size-4" />
            Ajouter un prestataire
          </button>
        }
      />
      <p className="mt-2 max-w-prose text-encre-doux">
        Ceux à qui vous confiez les cartes grises. Ils apparaîtront au moment de déposer un
        dossier, filtrés selon ce qu’ils traitent.
      </p>

      {creation && <Formulaire onFermer={() => setCreation(false)} />}

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

      {/* **Le groupe « Documents traités » a quitté ce formulaire** (S53). Il
          proposait une seule case depuis S48, quand la plaque est sortie du
          dossier : un choix à une seule option n'est pas un choix, c'est une
          saisie obligatoire déguisée — et on la découvrait en voyant le
          formulaire refusé sans comprendre pourquoi. Le type est désormais posé
          implicitement par `VIDE`. */}
    </div>
  );
}

function Formulaire({ onFermer }: { onFermer: () => void }) {
  const session = useSession();
  const [saisie, setSaisie] = useState<SaisiePrestataire>(VIDE);
  const [erreur, setErreur] = useState<string | null>(null);

  function soumettre(evenement: React.FormEvent) {
    evenement.preventDefault();
    if (session.statut !== "connecte") return;

    const probleme = validerPrestataire(saisie);
    if (probleme) {
      setErreur(probleme);
      return;
    }

    setErreur(null);
    /* Même raison que pour une boutique : l'écriture est locale d'abord
       (D76), donc la ligne est déjà dans la liste derrière. */
    creerPrestataire(saisie, {
      uid: session.utilisateur.uid,
      nom: session.utilisateur.nom,
    }).catch((cause) => setErreur(messageErreurReferentiel(cause)));
    setSaisie(VIDE);
    onFermer();
  }

  return (
    <Modale
      ouvert
      onFermer={onFermer}
      titre="Ajouter un prestataire"
      pied={
        <div className="flex flex-wrap gap-2">
          <button type="submit" form={FORMULAIRE_PRESTATAIRE} className="bouton bouton-principal">
            Enregistrer le prestataire
          </button>
          {/* « Annuler » et non « Fermer » : on abandonne une saisie, on ne
              referme pas une consultation. Sur l'écran des boutiques, le mot
              « Fermer » est déjà pris — il désigne la fermeture d'un point de
              vente, à deux centimètres de là. */}
          <button type="button" onClick={onFermer} className="bouton bouton-neutre">
            Annuler
          </button>
        </div>
      }
    >
    <form id={FORMULAIRE_PRESTATAIRE} onSubmit={soumettre} noValidate>
      <Champs
        saisie={saisie}
        changer={(partie) => setSaisie((actuel) => ({ ...actuel, ...partie }))}
        prefixe="nouveau"
      />

      <EtatErreurSaisie message={erreur} className="mt-3" />
    </form>
    </Modale>
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
          {/* **Un prestataire sans type est signalé** (S53). Il n'apparaîtra
              dans aucune liste de dépôt, et « Aucun type de document » en gris
              doux ne le disait pas : c'était une phrase parmi d'autres, sur une
              fiche qui a l'air complète. Le trou de S48 en a produit — des
              fiches nées avec `plaque` seul, dont le type a cessé d'exister. */}
          {prestataire.typesDocuments.length === 0 ? (
            <span className="block text-sm font-medium text-alerte">
              Aucun type de document : ce prestataire n’est proposé nulle part.
            </span>
          ) : (
            <span className="block text-sm text-encre-doux">
              {libelleTypes(prestataire.typesDocuments)}
            </span>
          )}
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

      {/* **Le lien de suivi vit sur la fiche, pas derriere le bouton
          « Modifier »** (S56). On ne vient pas ici pour corriger un
          prestataire quand on veut lui envoyer son lien : on vient pour le
          lien. Le cacher dans le formulaire d'edition en ferait une option
          d'un geste qui n'a rien a voir. */}
      <LienDeSuivi prestataire={prestataire} />

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
