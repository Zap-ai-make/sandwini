"use client";

import { useState } from "react";

import { Champ } from "@/components/patrons/Champ";
import { EtatErreurSaisie } from "@/components/patrons/Etats";
import { Modale } from "@/components/patrons/Modale";
import { jourLocal } from "@/lib/domain/format";
import {
  LONGUEUR_IMMATRICULATION_MAX,
  validerDossierExterieur,
  validerRemise,
  validerRetour,
  type DossierCarteGrise,
  type SaisieDossierExterieur,
  type SaisieRemise,
  type SaisieRetour,
} from "@/lib/domain/dossier-carte-grise";
import { LONGUEUR_NOM_MAX, LONGUEUR_TELEPHONE_MAX } from "@/lib/domain/client";
import { LONGUEUR_CHASSIS_MAX } from "@/lib/domain/moto";
import {
  enregistrerRetour,
  messageErreurDossierCarteGrise,
  ouvrirDossierExterieur,
  remettreDossier,
} from "@/lib/repositories/dossiers-carte-grise";
import { type Auteur } from "@/lib/repositories/referentiels";

/**
 * Les trois gestes que le client a demandés (S59).
 *
 * Ouvrir un dossier venu du dehors, inscrire l'immatriculation au retour, et
 * noter **qui** est venu chercher le papier. Rassemblés dans un fichier parce
 * qu'ils partagent la même forme — une modale, une validation du domaine, une
 * écriture qu'on n'attend pas — et que les disperser aurait fait trois fois le
 * même squelette.
 *
 * **Aucun n'attend le serveur** (D76). L'écriture est acquise au cache local ;
 * attendre l'accusé de réception bloquerait le geste au comptoir là où le
 * hors-ligne devait le rendre possible. Le refus tardif arrive par le `catch`,
 * et le bandeau dit ce qui reste à envoyer.
 */

/* --- Ouvrir un dossier venu du dehors ------------------------------------- */

/**
 * **La raison d'être de la collection.** Le commanditaire : « souvent on peut
 * leur confier de gérer une carte grise de l'extérieur ». Sous l'ancien
 * modèle, un tel dossier n'avait nulle part où être écrit.
 */
export function NouveauDossierModale({
  boutiqueId,
  auteur,
  onFermer,
}: {
  boutiqueId: string;
  auteur: Auteur;
  onFermer: () => void;
}) {
  const [saisie, setSaisie] = useState<SaisieDossierExterieur>({
    clientNom: "",
    motoLibelle: "",
    numeroChassis: "",
  });
  const [erreur, setErreur] = useState<string | null>(null);

  function changer(partie: Partial<SaisieDossierExterieur>) {
    setSaisie((avant) => ({ ...avant, ...partie }));
    setErreur(null);
  }

  function envoyer() {
    const probleme = validerDossierExterieur(saisie);
    if (probleme) {
      setErreur(probleme);
      return;
    }
    ouvrirDossierExterieur(saisie, boutiqueId, auteur).catch((cause) =>
      setErreur(messageErreurDossierCarteGrise(cause)),
    );
    onFermer();
  }

  return (
    <Modale
      ouvert
      onFermer={onFermer}
      titre="Nouveau dossier"
      description="Une carte grise qui ne vient pas d’une vente d’ici."
      pied={
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={envoyer} className="bouton bouton-principal">
            Ouvrir le dossier
          </button>
          <button type="button" onClick={onFermer} className="bouton bouton-neutre">
            Annuler
          </button>
        </div>
      }
    >
      <div className="colonne-formulaire space-y-4">
        <Champ id="ext-nom" libelle="Nom du propriétaire">
          <input
            id="ext-nom"
            value={saisie.clientNom}
            maxLength={LONGUEUR_NOM_MAX}
            onChange={(evenement) => changer({ clientNom: evenement.target.value })}
            className="saisie"
          />
        </Champ>

        <Champ
          id="ext-chassis"
          libelle="Numéro de châssis"
          /* **Aucune longueur annoncée, et c'est un relevé.** Les châssis du
             client font dix à douze caractères là où une voiture en porte
             dix-sept : promettre un compte ferait corriger une saisie juste. */
          aide="Tel qu’il est frappé sur le cadre, lettres et chiffres."
        >
          <input
            id="ext-chassis"
            value={saisie.numeroChassis}
            maxLength={LONGUEUR_CHASSIS_MAX}
            onChange={(evenement) => changer({ numeroChassis: evenement.target.value })}
            className="saisie font-mono uppercase"
          />
        </Champ>

        <Champ id="ext-moto" libelle="Modèle" facultatif aide="Le fichier du client en a sans.">
          <input
            id="ext-moto"
            value={saisie.motoLibelle}
            maxLength={LONGUEUR_NOM_MAX}
            onChange={(evenement) => changer({ motoLibelle: evenement.target.value })}
            className="saisie"
          />
        </Champ>

        <EtatErreurSaisie message={erreur} />
      </div>
    </Modale>
  );
}

/* --- Le retour du prestataire --------------------------------------------- */

/**
 * **`Immatriculation` est un résultat, pas une étape** (S48, confirmé par le
 * fichier du client). Le numéro de plaque s'obtient avec la carte grise : on
 * l'inscrit sur le dossier qui rentre, et il ne devient pas un second papier à
 * poursuivre.
 */
export function RetourModale({
  dossier,
  auteur,
  onFermer,
}: {
  dossier: DossierCarteGrise;
  auteur: Auteur;
  onFermer: () => void;
}) {
  const [saisie, setSaisie] = useState<SaisieRetour>({
    immatriculation: dossier.immatriculation,
    revenuLe: dossier.revenuLe ? jourLocal(dossier.revenuLe) : jourLocal(new Date()),
  });
  const [erreur, setErreur] = useState<string | null>(null);

  function changer(partie: Partial<SaisieRetour>) {
    setSaisie((avant) => ({ ...avant, ...partie }));
    setErreur(null);
  }

  function envoyer() {
    const probleme = validerRetour(saisie);
    if (probleme) {
      setErreur(probleme);
      return;
    }
    enregistrerRetour(dossier, saisie, auteur).catch((cause) =>
      setErreur(messageErreurDossierCarteGrise(cause)),
    );
    onFermer();
  }

  return (
    <Modale
      ouvert
      onFermer={onFermer}
      titre="Le papier est revenu"
      description={`${dossier.clientNom} — ${dossier.numeroChassis}`}
      pied={
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={envoyer} className="bouton bouton-principal">
            Enregistrer le retour
          </button>
          <button type="button" onClick={onFermer} className="bouton bouton-neutre">
            Annuler
          </button>
        </div>
      }
    >
      <div className="colonne-formulaire space-y-4">
        <Champ id="ret-date" libelle="Revenu le">
          <input
            id="ret-date"
            type="date"
            value={saisie.revenuLe}
            onChange={(evenement) => changer({ revenuLe: evenement.target.value })}
            className="saisie"
          />
        </Champ>

        <Champ
          id="ret-immat"
          libelle="Numéro d’immatriculation"
          facultatif
          /* **Le numéro n'est pas exigé, et c'est délibéré.** La carte est
             physiquement revenue ; refuser de l'enregistrer parce que le numéro
             n'est pas sous la main ferait mentir l'écran sur un fait accompli. */
          aide="Si vous ne l’avez pas sous la main, vous pourrez le compléter."
        >
          <input
            id="ret-immat"
            value={saisie.immatriculation}
            maxLength={LONGUEUR_IMMATRICULATION_MAX}
            onChange={(evenement) => changer({ immatriculation: evenement.target.value })}
            className="saisie font-mono"
          />
        </Champ>

        <EtatErreurSaisie message={erreur} />
      </div>
    </Modale>
  );
}

/* --- La remise au comptoir ------------------------------------------------ */

/**
 * **Qui est venu chercher le papier**, demande du client : ce sont ses colonnes
 * `RECEPTION` et `retrait`.
 *
 * Ce n'est pas toujours l'acheteur — souvent un frère, un employé. C'est
 * précisément pour ça qu'on l'écrit : c'est la seule question qu'on posera
 * quand quelqu'un affirmera n'avoir rien reçu.
 */
export function RemiseModale({
  dossier,
  auteur,
  onFermer,
}: {
  dossier: DossierCarteGrise;
  auteur: Auteur;
  onFermer: () => void;
}) {
  const [saisie, setSaisie] = useState<SaisieRemise>({
    /* Pré-rempli avec le propriétaire, parce que c'est le cas le plus fréquent
       — mais modifiable sans friction, parce que l'autre cas est courant. */
    nom: dossier.clientNom,
    telephone: "",
    remisLe: jourLocal(new Date()),
  });
  const [erreur, setErreur] = useState<string | null>(null);

  function changer(partie: Partial<SaisieRemise>) {
    setSaisie((avant) => ({ ...avant, ...partie }));
    setErreur(null);
  }

  function envoyer() {
    const probleme = validerRemise(saisie);
    if (probleme) {
      setErreur(probleme);
      return;
    }
    remettreDossier(dossier, saisie, auteur).catch((cause) =>
      setErreur(messageErreurDossierCarteGrise(cause)),
    );
    onFermer();
  }

  return (
    <Modale
      ouvert
      onFermer={onFermer}
      titre="Remettre le papier"
      description={`${dossier.clientNom} — ${dossier.numeroChassis}`}
      pied={
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={envoyer} className="bouton bouton-principal">
            Enregistrer la remise
          </button>
          <button type="button" onClick={onFermer} className="bouton bouton-neutre">
            Annuler
          </button>
        </div>
      }
    >
      <div className="colonne-formulaire space-y-4">
        <Champ
          id="rem-nom"
          libelle="Qui est venu chercher"
          aide="Ce n’est pas toujours le propriétaire."
        >
          <input
            id="rem-nom"
            value={saisie.nom}
            maxLength={LONGUEUR_NOM_MAX}
            onChange={(evenement) => changer({ nom: evenement.target.value })}
            className="saisie"
          />
        </Champ>

        <Champ id="rem-tel" libelle="Téléphone" facultatif>
          <input
            id="rem-tel"
            inputMode="tel"
            value={saisie.telephone}
            maxLength={LONGUEUR_TELEPHONE_MAX}
            onChange={(evenement) => changer({ telephone: evenement.target.value })}
            className="saisie"
          />
        </Champ>

        <Champ id="rem-date" libelle="Remis le">
          <input
            id="rem-date"
            type="date"
            value={saisie.remisLe}
            onChange={(evenement) => changer({ remisLe: evenement.target.value })}
            className="saisie"
          />
        </Champ>

        <EtatErreurSaisie message={erreur} />
      </div>
    </Modale>
  );
}
