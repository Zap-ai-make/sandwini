"use client";

import { Plus, X } from "lucide-react";
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
  ligneEstVide,
  ligneSuivante,
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
  ouvrirLignes,
} from "@/lib/repositories/dossiers-carte-grise";
import { type Auteur } from "@/lib/repositories/referentiels";

/**
 * La feuille de saisie des dossiers de carte grise (S59).
 *
 * **Elle sert deux gestes qui n'ont pas la même forme.** Ouvrir des lignes —
 * plusieurs d'affilée, parce qu'il transcrit un classeur et non un dossier
 * isolé — et rouvrir une ligne déjà écrite pour la corriger. La seconde n'a
 * qu'une ligne : c'est une correction, pas une saisie.
 *
 * **Ses colonnes, son ordre, ses noms.** Le commanditaire veut à la fois ce
 * qui lui est familier et « quelque chose de super moderne » ; il a tranché :
 * moderne sur la forme, sa hiérarchie intacte. L'ordre vient de `ORDRE_LIGNE`,
 * la même liste que le tableau de la liste — la ligne qu'on remplit et la
 * ligne qu'on relit ne peuvent pas diverger.
 *
 * **Rien ne descend dans la liste avant l'enregistrement, et tout y descend
 * ensemble.** Un `writeBatch` est atomique, hors ligne compris : une saisie de
 * douze lignes passe entière ou pas du tout. La moitié d'une transcription
 * serait pire que rien — personne ne saurait où elle s'est arrêtée.
 *
 * **Elle n'attend pas le serveur** (D76). L'écriture est acquise au cache
 * local ; attendre l'accusé de réception bloquerait le geste au comptoir là où
 * le hors-ligne devait le rendre possible. Le refus tardif arrive par le
 * `catch`, et le bandeau dit ce qui reste à envoyer.
 */

/** La largeur de chaque colonne, dans l'ordre de son classeur. */
const LARGEURS: Record<CleColonneLigne, string> = {
  tel: "8rem",
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

/** Ce qui est refusé, et par quelle ligne. `rang` à `null` vise la saisie entière. */
type Refus = { message: string; rang: number | null };

export function LigneModale({
  dossier,
  boutiqueId,
  prestataires,
  auteur,
  onFermer,
}: {
  /** `null` ouvre une feuille vierge ; sinon on rouvre cette ligne-là. */
  dossier: DossierCarteGrise | null;
  boutiqueId: string;
  prestataires: Prestataire[];
  auteur: Auteur;
  onFermer: () => void;
}) {
  const identifiant = useId();
  const listeId = `${identifiant}-prestataires`;
  const correction = dossier !== null;

  const [lignes, setLignes] = useState<SaisieLigne[]>(() =>
    dossier ? [ligneDuDossier(dossier)] : [LIGNE_VIDE],
  );
  const [refus, setRefus] = useState<Refus | null>(null);

  function changer(rang: number, partie: Partial<SaisieLigne>) {
    setLignes((avant) =>
      avant.map((ligne, index) => (index === rang ? { ...ligne, ...partie } : ligne)),
    );
    setRefus(null);
  }

  function ajouter() {
    /* Elle hérite du dépôt et du transitaire de celle du dessus : son classeur
       porte la même date sur tout un bloc, c'est un paquet confié le même
       jour. */
    setLignes((avant) => [...avant, ligneSuivante(avant[avant.length - 1])]);
    setRefus(null);
  }

  function retirer(rang: number) {
    setLignes((avant) => (avant.length === 1 ? avant : avant.filter((_, i) => i !== rang)));
    setRefus(null);
  }

  /** Le prestataire reconnu dans `TRANSITE`, s'il en est un d'enregistré. */
  function reconnu(ligne: SaisieLigne): string | null {
    /* **Un nom tapé, comme chez lui — mais on reconnaît les siens.** Quand le
       nom correspond à un prestataire enregistré, le dossier garde son
       identifiant : c'est lui que lira le portail du prestataire, et lui qui
       rattache un dépôt à une fiche. Un nom inconnu reste accepté, parce qu'il
       en confie à des gens qu'il n'a pas saisis. */
    const trouve = prestataires.find(
      (prestataire) =>
        prestataire.nom.trim().toLocaleLowerCase("fr") ===
        ligne.transite.trim().toLocaleLowerCase("fr"),
    );
    return trouve?.id ?? null;
  }

  function corriger(valeurs: SaisieLigne) {
    if (dossier === null) return;
    const probleme = validerLigne(valeurs);
    if (probleme) {
      setRefus({ message: probleme, rang: 0 });
      return;
    }
    corrigerLigne(dossier, valeurs, reconnu(valeurs), auteur).catch((cause) =>
      setRefus({ message: messageErreurDossierCarteGrise(cause), rang: null }),
    );
    onFermer();
  }

  function ouvrir() {
    /* Une ligne entièrement vide est ignorée, sans un mot : on clique « + » une
       fois de trop, et cela n'a pas à devenir une erreur. */
    const retenues = lignes
      .map((saisie, rang) => ({ saisie, rang }))
      .filter(({ saisie }) => !ligneEstVide(saisie));

    if (retenues.length === 0) {
      setRefus({ message: "Il n’y a rien à enregistrer : aucune ligne n’est remplie.", rang: null });
      return;
    }

    for (const { saisie, rang } of retenues) {
      const probleme = validerLigne(saisie);
      /* On nomme la ligne fautive, et on la marque. Sur douze lignes à l'écran,
         « il manque un châssis » sans dire laquelle oblige à toutes les
         relire. */
      if (probleme) {
        setRefus({ message: probleme, rang });
        return;
      }
    }

    ouvrirLignes(
      retenues.map(({ saisie }) => ({ saisie, prestataireId: reconnu(saisie) })),
      boutiqueId,
      auteur,
    ).catch((cause) => setRefus({ message: messageErreurDossierCarteGrise(cause), rang: null }));
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
    const ligne = lignes[0];
    corriger({ ...ligne, retrait: ligne.retrait || jourLocal(new Date()) });
  }

  const remplies = lignes.filter((ligne) => !ligneEstVide(ligne)).length;
  const fini = dossier !== null && estTerminal(dossier.statut);

  return (
    <Modale
      ouvert
      onFermer={onFermer}
      taille="pleine"
      titre={correction ? "Modifier la ligne" : "Nouvelles lignes"}
      pied={
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={correction ? () => corriger(lignes[0]) : ouvrir}
            className="bouton bouton-principal"
          >
            {correction
              ? "Enregistrer"
              : remplies > 1
                ? `Enregistrer les ${remplies} lignes`
                : "Enregistrer la ligne"}
          </button>

          {/* Un dossier déjà fini n'a rien à terminer : le bouton disparaît
              plutôt que de se griser, parce qu'un bouton gris pose la question
              de ce qu'il faudrait faire pour l'allumer. */}
          {correction && !fini && (
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
      <div className="cadre-grille">
        <table className="grille-saisie">
          <caption className="sr-only">
            Les dossiers à enregistrer, une ligne chacun, colonne par colonne dans l’ordre du
            classeur.
          </caption>
          <thead>
            <tr>
              {!correction && (
                <th scope="col" className="gouttiere">
                  <span className="sr-only">Ligne</span>
                  <span aria-hidden="true">#</span>
                </th>
              )}
              {ORDRE_LIGNE.map((cle) => (
                <th key={cle} scope="col" style={{ width: LARGEURS[cle] }}>
                  {ENTETES_LIGNE[cle]}
                </th>
              ))}
              {!correction && (
                <th scope="col" style={{ width: "2.75rem" }}>
                  <span className="sr-only">Retirer la ligne</span>
                </th>
              )}
            </tr>
          </thead>

          <tbody>
            {lignes.map((ligne, rang) => (
              <tr key={rang} className={refus?.rang === rang ? "ligne-fautive" : undefined}>
                {!correction && <td className="gouttiere">{rang + 1}</td>}

                {ORDRE_LIGNE.map((cle) => (
                  <td key={cle}>
                    <Champ
                      cle={cle}
                      ligne={ligne}
                      rang={rang}
                      changer={changer}
                      listeId={listeId}
                    />
                  </td>
                ))}

                {!correction && (
                  <td>
                    <button
                      type="button"
                      onClick={() => retirer(rang)}
                      disabled={lignes.length === 1}
                      className="flex h-11 w-full items-center justify-center text-encre-doux transition hover:text-alerte disabled:opacity-30"
                    >
                      <X aria-hidden="true" className="size-4" />
                      <span className="sr-only">Retirer la ligne {rang + 1}</span>
                    </button>
                  </td>
                )}
              </tr>
            ))}

            {/* La rangée d'ajout est à la place exacte où la prochaine ligne
                apparaîtra : le bouton et son effet sont au même endroit. */}
            {!correction && (
              <tr className="rangee-ajout">
                <td colSpan={ORDRE_LIGNE.length + 2}>
                  <button type="button" onClick={ajouter}>
                    <Plus aria-hidden="true" className="size-4" />
                    Ajouter une ligne
                  </button>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Les noms déjà connus sont proposés, sans être imposés : il confie
          aussi à des gens qu'il n'a pas enregistrés. Une seule liste pour
          toutes les lignes. */}
      <datalist id={listeId}>
        {prestataires.map((prestataire) => (
          <option key={prestataire.id} value={prestataire.nom} />
        ))}
      </datalist>

      <EtatErreurSaisie
        message={
          refus === null
            ? null
            : refus.rang === null
              ? refus.message
              : `Ligne ${refus.rang + 1} — ${refus.message}`
        }
        className="mt-3"
      />
    </Modale>
  );
}

/** La case d'une colonne, pour une ligne donnée. */
function Champ({
  cle,
  ligne,
  rang,
  changer,
  listeId,
}: {
  cle: CleColonneLigne;
  ligne: SaisieLigne;
  rang: number;
  changer: (rang: number, partie: Partial<SaisieLigne>) => void;
  listeId: string;
}): ReactNode {
  /* L'intitulé annonce aussi son rang : dans une feuille de douze lignes, « Tel »
     douze fois de suite ne dit pas à un lecteur d'écran laquelle il parcourt. */
  const intitule = `${ENTETES_LIGNE[cle]}, ligne ${rang + 1}`;

  switch (cle) {
    case "tel":
      return (
        <input
          aria-label={intitule}
          inputMode="tel"
          value={ligne.tel}
          maxLength={LONGUEUR_TELEPHONE_MAX}
          onChange={(evenement) => changer(rang, { tel: evenement.target.value })}
          className="cellule font-mono"
        />
      );
    case "client":
      return (
        <input
          aria-label={intitule}
          value={ligne.client}
          maxLength={LONGUEUR_NOM_MAX}
          onChange={(evenement) => changer(rang, { client: evenement.target.value })}
          className="cellule"
        />
      );
    case "moto":
      return (
        <input
          aria-label={intitule}
          value={ligne.moto}
          maxLength={LONGUEUR_NOM_MAX}
          onChange={(evenement) => changer(rang, { moto: evenement.target.value })}
          className="cellule"
        />
      );
    case "chassis":
      return (
        <input
          aria-label={intitule}
          value={ligne.chassis}
          maxLength={LONGUEUR_CHASSIS_MAX}
          onChange={(evenement) => changer(rang, { chassis: evenement.target.value })}
          className="cellule font-mono uppercase"
        />
      );
    /* `√` ou `OK` dans son fichier : deux façons d'écrire oui, donc une case à
       cocher. Le commanditaire a confirmé que `Reci` est le reçu. */
    case "recu":
      return (
        <label className="flex h-11 cursor-pointer items-center justify-center">
          <input
            aria-label={intitule}
            type="checkbox"
            checked={ligne.recu}
            onChange={(evenement) => changer(rang, { recu: evenement.target.checked })}
            className="size-[18px] shrink-0 accent-encre"
          />
        </label>
      );
    case "credit":
      return (
        <input
          aria-label={intitule}
          inputMode="numeric"
          value={ligne.credit}
          onChange={(evenement) => changer(rang, { credit: evenement.target.value })}
          className="cellule text-right font-mono"
        />
      );
    case "reception":
      return (
        <input
          aria-label={intitule}
          inputMode="tel"
          value={ligne.reception}
          maxLength={LONGUEUR_TELEPHONE_MAX}
          onChange={(evenement) => changer(rang, { reception: evenement.target.value })}
          className="cellule font-mono"
        />
      );
    case "retrait":
      return (
        <input
          aria-label={intitule}
          type="date"
          value={ligne.retrait}
          onChange={(evenement) => changer(rang, { retrait: evenement.target.value })}
          className="cellule"
        />
      );
    case "depot":
      return (
        <input
          aria-label={intitule}
          type="date"
          value={ligne.depot}
          onChange={(evenement) => changer(rang, { depot: evenement.target.value })}
          className="cellule"
        />
      );
    case "immatriculation":
      return (
        <input
          aria-label={intitule}
          value={ligne.immatriculation}
          maxLength={LONGUEUR_IMMATRICULATION_MAX}
          onChange={(evenement) => changer(rang, { immatriculation: evenement.target.value })}
          className="cellule font-mono"
        />
      );
    case "transite":
      return (
        <input
          aria-label={intitule}
          list={listeId}
          value={ligne.transite}
          maxLength={LONGUEUR_NOM_MAX}
          onChange={(evenement) => changer(rang, { transite: evenement.target.value })}
          className="cellule"
        />
      );
  }
}
