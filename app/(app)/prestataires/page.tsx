"use client";

import { Download, Link2, Phone, Plus, Printer, Send } from "lucide-react";
import { useCallback, useState } from "react";
import { BordereauPaquet } from "@/components/BordereauPaquet";
import { ConfierDepuisPrestataire } from "@/components/ConfierDepuisPrestataire";
import { GardeEspace } from "@/components/GardeSession";
import { LienDeSuivi } from "@/components/LienDeSuivi";
import { Champ } from "@/components/patrons/Champ";
import {
  EtatChargement,
  EtatErreur,
  EtatErreurSaisie,
} from "@/components/patrons/Etats";
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
import type { PaquetConfie } from "@/lib/domain/paquet";
import { peut } from "@/lib/domain/roles";
import { usePerimetre } from "@/lib/perimetre/perimetre";
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
 * verse une avance, et le client rappelle pour savoir où en est sa carte
 * grise. D'où le téléphone, obligatoire.
 *
 * **L'écran a quitté les paramètres** (20 octobre 2026, demande du client).
 * Un paramètre se pose une fois et s'oublie ; on confie des cartes grises
 * toutes les semaines. Il était rangé selon ce qu'il contient — une liste de
 * noms — et non selon ce qu'on y fait.
 *
 * **Et il s'ouvre au gérant, ce qui est le vrai changement.** La garde était
 * `gerer_referentiels`, c'est-à-dire le responsable seul. Or celui qui tend le
 * paquet au prestataire est le gérant, et il le fait déjà depuis la file des
 * dossiers : lui fermer cette porte-ci aurait laissé deux chemins vers le même
 * dépôt, l'un ouvert et l'autre non.
 *
 * Ce qui reste au responsable vit **dans** l'écran : créer, renommer, retirer
 * un prestataire, et son lien de suivi. Même partage que les dépenses (S55) —
 * le geste du comptoir est ouvert, le mot que des mois d'écritures citent ne
 * l'est pas.
 */
export default function PagePrestataires() {
  return (
    <GardeEspace espace="cartes_grises">
      <Prestataires />
    </GardeEspace>
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
  const session = useSession();
  const { perimetre } = usePerimetre();
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
  /* **Le bordereau vit au niveau de la page, et c'est l'impression qui l'exige.**
     Imprimer prend la page entière : il faut que le papier soit un frère de
     l'écran masqué, pas un enfant d'une ligne de la liste. */
  const [confie, setConfie] = useState<PaquetConfie | null>(null);

  if (session.statut !== "connecte") return null;
  /* Administrer le référentiel reste au responsable ; confier est ouvert. */
  const administre = peut(session.utilisateur.role, "gerer_referentiels");
  const boutiqueId = perimetre.boutiqueId;

  return (
    <>
    <div className="print:hidden">
      {/* La liste d'abord, la création en modale (S54). Le formulaire occupait
          le haut de l'écran en permanence : on venait presque toujours pour
          consulter ou corriger, et il fallait le dépasser à chaque fois. Un
          bouton en tête, et l'écran redevient ce qu'il est — une liste. */}
      <TetePage
        titre="Prestataires"
        actions={
          administre ? (
            <button
              type="button"
              onClick={() => setCreation(true)}
              className="bouton bouton-principal"
            >
              <Plus aria-hidden="true" className="size-4" />
              Ajouter un prestataire
            </button>
          ) : undefined
        }
      />

      {creation && administre && <Formulaire onFermer={() => setCreation(false)} />}

      <h2 className="mt-8 text-sm font-semibold tracking-wide text-encre-doux uppercase">
        Prestataires enregistrés
      </h2>

      <EtatErreur message={erreur} className="mt-3" />

      {valeur === null && !erreur ? (
        <EtatChargement className="mt-3">Chargement des prestataires…</EtatChargement>
      ) : (valeur ?? []).length === 0 && !erreur ? (
        null
      ) : (
        <ul className="mt-3 cadre cadre-liste">
          {(valeur ?? []).map((prestataire) => (
            <Ligne
              key={prestataire.id}
              prestataire={prestataire}
              administre={administre}
              boutiqueId={boutiqueId}
              onConfie={setConfie}
            />
          ))}
        </ul>
      )}

      {confie !== null && (
        <ApresAvoirConfie confie={confie} onFermer={() => setConfie(null)} />
      )}
    </div>

    {/* Le bordereau ne s'affiche qu'à l'impression ; l'écran, lui, est masqué
        ci-dessus. « Exporter en PDF » n'est qu'un `window.print()` : la boîte
        du navigateur propose « Enregistrer au format PDF », sans réseau (D60). */}
    <div className="hidden print:block">
      {confie !== null && (
        <BordereauPaquet
          confie={confie}
          nomBoutique={perimetre.nom}
          auteur={session.utilisateur.nom}
        />
      )}
    </div>
    </>
  );
}

/**
 * Ce qu'on voit une fois le paquet parti.
 *
 * **Elle ne confirme pas, elle propose le papier.** Un « c'est enregistré »
 * seul ferait refermer la fenêtre, et le bordereau se perdrait avec — il n'est
 * nulle part en base, le lot ne s'attendant pas (D76). Le transitaire est
 * encore devant le comptoir à ce moment-là : c'est maintenant qu'on imprime.
 */
function ApresAvoirConfie({
  confie,
  onFermer,
}: {
  confie: PaquetConfie;
  onFermer: () => void;
}) {
  return (
    <Modale
      ouvert
      onFermer={onFermer}
      titre={`${confie.cartes.length} carte(s) confiée(s) à ${confie.prestataireNom}`}
      pied={
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => window.print()}
            className="bouton bouton-principal"
          >
            <Printer aria-hidden="true" className="size-4" />
            Imprimer
          </button>
          {/* **Le même geste, et ce n'est pas un raccourci paresseux.** La boîte
              d'impression du navigateur propose « Enregistrer au format PDF » :
              deux cents kilo-octets de librairie auraient donné le même
              fichier, dans une application qui doit se charger hors ligne. */}
          <button
            type="button"
            onClick={() => window.print()}
            className="bouton bouton-neutre"
          >
            <Download aria-hidden="true" className="size-4" />
            Exporter en PDF
          </button>
          <button type="button" onClick={onFermer} className="bouton bouton-neutre">
            Fermer
          </button>
        </div>
      }
    >

      <ul className="mt-4 cadre cadre-liste">
        {confie.cartes.map((carte) => (
          <li key={carte.dossierId} className="flex flex-wrap gap-x-3 px-4 py-2 text-corps">
            <span className="plaque-code">{carte.repere}</span>
            <span className="text-encre">{carte.client || "—"}</span>
            <span className="text-encre-doux">{carte.dossier?.numeroChassis ?? ""}</span>
          </li>
        ))}
      </ul>
    </Modale>
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
    <div className="colonne-formulaire rangee-champs mt-4 max-w-[40rem]">
      <Champ id={`${prefixe}-nom`} libelle="Nom">
        <input
          id={`${prefixe}-nom`}
          value={saisie.nom}
          maxLength={LONGUEUR_NOM_MAX}
          onChange={(evenement) => changer({ nom: evenement.target.value })}
          className="saisie"
        />
      </Champ>

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

function Ligne({
  prestataire,
  administre,
  boutiqueId,
  onConfie,
}: {
  prestataire: Prestataire;
  administre: boolean;
  boutiqueId: string | null;
  onConfie: (confie: PaquetConfie) => void;
}) {
  const session = useSession();
  const [edition, setEdition] = useState(false);
  const [lien, setLien] = useState(false);
  const [confie, setConfie] = useState(false);
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

  /* **On ne confie rien à un prestataire retiré des choix**, ni à un
     prestataire sans type : la base refuserait le dépôt, après qu'on a saisi
     l'avance. Le bouton n'existe donc pas plutôt que d'exister grisé. */
  const peutRecevoir =
    boutiqueId !== null &&
    prestataire.actif &&
    prestataire.typesDocuments.includes("carte_grise");

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
          {/* **Le téléphone et les types tiennent sur une ligne** (23 octobre
              2026). Ils en occupaient deux chacun, ce qui faisait une fiche de
              quatre lignes pour trois informations — et une liste qu'on ne
              parcourait plus du regard. */}
          <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm text-encre-doux">
            <span className="flex items-center gap-1.5">
              <Phone aria-hidden="true" className="size-3.5 shrink-0" />
              {prestataire.telephone}
            </span>
            {/* **Un prestataire sans type est signalé** (S53). Il n'apparaîtra
                dans aucune liste de dépôt, et « Aucun type de document » en
                gris doux ne le disait pas : c'était une phrase parmi d'autres,
                sur une fiche qui a l'air complète. Le trou de S48 en a produit
                — des fiches nées avec `plaque` seul, dont le type a cessé
                d'exister. */}
            {prestataire.typesDocuments.length === 0 ? (
              <span className="font-medium text-alerte">
                · Aucun type de document : proposé nulle part.
              </span>
            ) : (
              <span>· {libelleTypes(prestataire.typesDocuments)}</span>
            )}
          </span>
        </span>

        <span className="flex shrink-0 flex-wrap gap-2">
          {/* **Le geste principal de l'écran, et il est en premier.** C'est
              pour lui que le client a voulu sortir les prestataires des
              paramètres : on part de la personne, et la modale montre tous les
              dossiers en cours à cocher. */}
          {peutRecevoir && (
            <button
              type="button"
              onClick={() => setConfie(true)}
              className="bouton bouton-principal"
            >
              <Send aria-hidden="true" className="size-4" />
              Confier des cartes grises
            </button>
          )}
          {administre && (
            <>
              {/* Le lien de suivi se demande, il ne s'étale plus. Voir
                  l'explication au-dessus du panneau, plus bas. */}
              <button
                type="button"
                onClick={() => setLien((ouvert) => !ouvert)}
                aria-expanded={lien}
                className="bouton bouton-neutre"
              >
                <Link2 aria-hidden="true" className="size-4" />
                Lien de suivi
              </button>
              <button
                type="button"
                onClick={() => setEdition((ouvert) => !ouvert)}
                aria-expanded={edition}
                className="bouton bouton-neutre"
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
                className="bouton bouton-neutre"
              >
                {prestataire.actif ? "Retirer" : "Remettre"}
              </button>
            </>
          )}
        </span>
      </div>

      <EtatErreur message={erreur} className="mt-2" />

      {confie && boutiqueId !== null && (
        <ConfierDepuisPrestataire
          prestataire={prestataire}
          boutiqueId={boutiqueId}
          onFermer={() => setConfie(false)}
          onConfie={(paquet) => {
            setConfie(false);
            onConfie(paquet);
          }}
        />
      )}

      {/* **Le lien de suivi garde son bouton à lui, et c'est le point de S56** :
          on ne vient pas ici pour corriger un prestataire quand on veut lui
          envoyer son lien, donc il n'est pas rangé dans « Modifier ».

          **Mais il est replié depuis le 23 octobre 2026.** Déployé en
          permanence, il ajoutait un bloc de cinq lignes — jeton compris — sous
          chaque nom : trois prestataires remplissaient l'écran, et la liste
          cessait d'être une liste. On l'ouvre quand on en a besoin, ce qui est
          rare, et on lit les autres noms le reste du temps.

          Il reste au responsable : l'écran s'ouvre au gérant pour confier, ce
          qui n'est pas une raison d'élargir au passage la diffusion d'un
          jeton. */}
      {administre && lien && <LienDeSuivi prestataire={prestataire} />}

      {edition && administre && (
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
