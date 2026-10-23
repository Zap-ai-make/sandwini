"use client";

import { useId, useState, type ReactNode } from "react";

import { EtatErreurSaisie } from "@/components/patrons/Etats";
import { Modale } from "@/components/patrons/Modale";
import { LONGUEUR_NOM_MAX, LONGUEUR_TELEPHONE_MAX } from "@/lib/domain/client";
import {
  ENTETES_LIGNE,
  estTerminal,
  LIGNE_VIDE,
  LONGUEUR_IMMATRICULATION_MAX,
  ligneDuDossier,
  ORDRE_LIGNE,
  validerLigne,
  type CleColonneLigne,
  type DossierCarteGrise,
  type SaisieLigne,
} from "@/lib/domain/dossier-carte-grise";
import { jourLocal } from "@/lib/domain/format";
import { LONGUEUR_CHASSIS_MAX } from "@/lib/domain/moto";
import type { Prestataire } from "@/lib/domain/prestataire";
import {
  corrigerLigne,
  messageErreurDossierCarteGrise,
  ouvrirLigne,
} from "@/lib/repositories/dossiers-carte-grise";
import { type Auteur } from "@/lib/repositories/referentiels";

/**
 * Une ligne de son classeur, ouverte pour saisie ou pour correction (S59).
 *
 * **Une seule modale pour les deux, et c'est la demande.** Le commanditaire :
 * « les champs en horizontal comme Excel avec des champs à remplir, si rempli
 * descend dans la liste », et « la possibilité d'ouvrir chaque ligne en modale
 * pour modification ». Même ligne, mêmes dix cases, même ordre : seul le titre
 * change. Deux formulaires auraient divergé au premier ajout de colonne.
 *
 * **C'est un vrai tableau, et le premier essai ne l'était pas.** Dix champs
 * posés côte à côte flottaient sans filets : l'œil ne savait pas où finissait
 * une case, et la correspondance avec la ligne du tableau en dessous se
 * perdait. « Fais ça en tableau » — donc `<table>`, entêtes en tête de
 * colonne, et le champ qui remplit sa cellule sans rien dessiner lui-même.
 *
 * **La bande défile de côté.** Dix colonnes ne tiennent pas dans la largeur
 * d'un pouce ; sur téléphone, on fait glisser. La disposition est celle de son
 * tableur, pas celle d'un formulaire empilé, parce que c'est de son tableur
 * qu'il recopie — l'œil suit la même route.
 *
 * **Elle n'attend pas le serveur** (D76). L'écriture est acquise au cache
 * local ; attendre l'accusé de réception bloquerait le geste au comptoir là où
 * le hors-ligne devait le rendre possible. Le refus tardif arrive par le
 * `catch`, et le bandeau dit ce qui reste à envoyer.
 */

/** La largeur de chaque colonne, dans l'ordre de son classeur. */
const LARGEURS: Record<CleColonneLigne, string> = {
  client: "12rem",
  moto: "8rem",
  chassis: "9.5rem",
  recu: "3.5rem",
  credit: "7rem",
  reception: "8rem",
  retrait: "9rem",
  depot: "9rem",
  immatriculation: "9.5rem",
  transite: "9.5rem",
};

export function LigneModale({
  dossier,
  boutiqueId,
  prestataires,
  auteur,
  onFermer,
}: {
  /** `null` ouvre une ligne neuve ; sinon on rouvre celle-là. */
  dossier: DossierCarteGrise | null;
  boutiqueId: string;
  prestataires: Prestataire[];
  auteur: Auteur;
  onFermer: () => void;
}) {
  const identifiant = useId();
  const listeId = `${identifiant}-prestataires`;
  const [saisie, setSaisie] = useState<SaisieLigne>(
    dossier ? ligneDuDossier(dossier) : LIGNE_VIDE,
  );
  const [erreur, setErreur] = useState<string | null>(null);

  function changer(partie: Partial<SaisieLigne>) {
    setSaisie((avant) => ({ ...avant, ...partie }));
    setErreur(null);
  }

  function enregistrer(valeurs: SaisieLigne) {
    const probleme = validerLigne(valeurs);
    if (probleme) {
      setErreur(probleme);
      return;
    }

    /* **`TRANSITE` est un nom tapé, comme chez lui — mais on reconnaît les
       siens.** Quand le nom correspond à un prestataire enregistré, le dossier
       garde son identifiant : c'est lui que lira le portail du prestataire, et
       c'est lui qui rattache un dépôt à une fiche. Un nom inconnu reste
       accepté, parce qu'il en confie à des gens qu'il n'a pas saisis. */
    const reconnu =
      prestataires.find(
        (prestataire) =>
          prestataire.nom.trim().toLocaleLowerCase("fr") ===
          valeurs.transite.trim().toLocaleLowerCase("fr"),
      ) ?? null;

    const ecriture = dossier
      ? corrigerLigne(dossier, valeurs, reconnu?.id ?? null, auteur)
      : ouvrirLigne(valeurs, boutiqueId, reconnu?.id ?? null, auteur);

    ecriture.catch((cause) => setErreur(messageErreurDossierCarteGrise(cause)));
    onFermer();
  }

  /**
   * Terminer un dossier, c'est dater son retrait.
   *
   * **Le bouton ne pose pas un état à part.** Un dossier est fini quand le
   * papier est reparti avec quelqu'un : c'est sa colonne `retrait`, et c'est
   * elle que le bouton remplit — du jour même, s'il est vide. Poser « terminé »
   * sans la date aurait fait une ligne que la moindre réouverture aurait
   * défaite, puisque c'est le remplissage qui dit l'état.
   *
   * Une date déjà inscrite n'est pas écrasée : il l'a peut-être saisie à la
   * main parce que le client est passé hier.
   */
  function terminer() {
    enregistrer({ ...saisie, retrait: saisie.retrait || jourLocal(new Date()) });
  }

  /* Les cases, par colonne. Le tableau est monté en parcourant `ORDRE_LIGNE` :
     l'entête et la cellule ne peuvent pas se décaler, et oublier une colonne
     devient une erreur de compilation. */
  const cases: Record<CleColonneLigne, ReactNode> = {
    client: (
      <input
        aria-label={ENTETES_LIGNE.client}
        value={saisie.client}
        maxLength={LONGUEUR_NOM_MAX}
        onChange={(evenement) => changer({ client: evenement.target.value })}
        className="cellule"
      />
    ),
    moto: (
      <input
        aria-label={ENTETES_LIGNE.moto}
        value={saisie.moto}
        maxLength={LONGUEUR_NOM_MAX}
        onChange={(evenement) => changer({ moto: evenement.target.value })}
        className="cellule"
      />
    ),
    chassis: (
      <input
        aria-label={ENTETES_LIGNE.chassis}
        value={saisie.chassis}
        maxLength={LONGUEUR_CHASSIS_MAX}
        onChange={(evenement) => changer({ chassis: evenement.target.value })}
        className="cellule font-mono uppercase"
      />
    ),
    /* `√` ou `OK` dans son fichier : deux façons d'écrire oui, donc une case à
       cocher. Le commanditaire a confirmé que `Reci` est le reçu. */
    recu: (
      <div className="flex h-10 items-center justify-center">
        <input
          aria-label={ENTETES_LIGNE.recu}
          type="checkbox"
          checked={saisie.recu}
          onChange={(evenement) => changer({ recu: evenement.target.checked })}
          className="size-[18px] shrink-0 accent-encre"
        />
      </div>
    ),
    credit: (
      <input
        aria-label={ENTETES_LIGNE.credit}
        inputMode="numeric"
        value={saisie.credit}
        onChange={(evenement) => changer({ credit: evenement.target.value })}
        className="cellule text-right font-mono"
      />
    ),
    reception: (
      <input
        aria-label={ENTETES_LIGNE.reception}
        inputMode="tel"
        value={saisie.reception}
        maxLength={LONGUEUR_TELEPHONE_MAX}
        onChange={(evenement) => changer({ reception: evenement.target.value })}
        className="cellule font-mono"
      />
    ),
    retrait: (
      <input
        aria-label={ENTETES_LIGNE.retrait}
        type="date"
        value={saisie.retrait}
        onChange={(evenement) => changer({ retrait: evenement.target.value })}
        className="cellule"
      />
    ),
    depot: (
      <input
        aria-label={ENTETES_LIGNE.depot}
        type="date"
        value={saisie.depot}
        onChange={(evenement) => changer({ depot: evenement.target.value })}
        className="cellule"
      />
    ),
    immatriculation: (
      <input
        aria-label={ENTETES_LIGNE.immatriculation}
        value={saisie.immatriculation}
        maxLength={LONGUEUR_IMMATRICULATION_MAX}
        onChange={(evenement) => changer({ immatriculation: evenement.target.value })}
        className="cellule font-mono"
      />
    ),
    transite: (
      <>
        <input
          aria-label={ENTETES_LIGNE.transite}
          list={listeId}
          value={saisie.transite}
          maxLength={LONGUEUR_NOM_MAX}
          onChange={(evenement) => changer({ transite: evenement.target.value })}
          className="cellule"
        />
        {/* Les noms déjà connus sont proposés, sans être imposés : il confie
            aussi à des gens qu'il n'a pas enregistrés. */}
        <datalist id={listeId}>
          {prestataires.map((prestataire) => (
            <option key={prestataire.id} value={prestataire.nom} />
          ))}
        </datalist>
      </>
    ),
  };

  const fini = dossier !== null && estTerminal(dossier.statut);

  return (
    <Modale
      ouvert
      onFermer={onFermer}
      taille="large"
      titre={dossier ? "Modifier la ligne" : "Nouvelle ligne"}
      description={
        dossier
          ? `${dossier.clientNom} — ${dossier.numeroChassis}`
          : "Remplissez ce que vous avez. La ligne descend dans la liste."
      }
      pied={
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => enregistrer(saisie)}
            className="bouton bouton-principal"
          >
            {dossier ? "Enregistrer" : "Ajouter la ligne"}
          </button>

          {/* Un dossier déjà fini n'a rien à terminer : le bouton disparaît
              plutôt que de se griser, parce qu'un bouton gris pose la question
              de ce qu'il faudrait faire pour l'allumer. */}
          {dossier !== null && !fini && (
            <button type="button" onClick={terminer} className="bouton bouton-neutre">
              Terminer
            </button>
          )}

          <button type="button" onClick={onFermer} className="bouton bouton-neutre">
            Annuler
          </button>
        </div>
      }
    >
      {/* Le conteneur qui défile de côté : c'est lui qui tient la disposition du
          tableur quand l'écran est plus étroit que la ligne. */}
      <div className="-mx-1 overflow-x-auto px-1 pb-2">
        <table className="grille-saisie">
          <caption className="sr-only">
            Une ligne de dossier, colonne par colonne, dans l’ordre du classeur.
          </caption>
          <thead>
            <tr>
              {ORDRE_LIGNE.map((cle) => (
                <th key={cle} scope="col" style={{ width: LARGEURS[cle] }}>
                  {ENTETES_LIGNE[cle]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              {ORDRE_LIGNE.map((cle) => (
                <td key={cle}>{cases[cle]}</td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>

      {dossier !== null && !fini && (
        <p className="mt-3 text-legende text-encre-doux">
          « Terminer » date le retrait d’aujourd’hui et fait descendre la ligne dans l’onglet
          Terminés.
        </p>
      )}

      <EtatErreurSaisie message={erreur} className="mt-3" />
    </Modale>
  );
}
