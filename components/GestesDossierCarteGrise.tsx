"use client";

import { useId, useState } from "react";

import { EtatErreurSaisie } from "@/components/patrons/Etats";
import { Modale } from "@/components/patrons/Modale";
import { LONGUEUR_NOM_MAX, LONGUEUR_TELEPHONE_MAX } from "@/lib/domain/client";
import {
  ENTETES_LIGNE,
  LIGNE_VIDE,
  LONGUEUR_IMMATRICULATION_MAX,
  ligneDuDossier,
  validerLigne,
  type DossierCarteGrise,
  type SaisieLigne,
} from "@/lib/domain/dossier-carte-grise";
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
 * **Les cases sont en ligne et elles défilent de côté.** Dix colonnes ne
 * tiennent pas dans la largeur d'un pouce ; sur téléphone, on fait glisser. La
 * disposition est celle de son tableur, pas celle d'un formulaire empilé, parce
 * que c'est de son tableur qu'il recopie — l'œil suit la même route.
 *
 * **Chaque case porte son entête en vrai texte au-dessus d'elle.** C'est à la
 * fois la ligne d'entêtes d'Excel et l'étiquette dont un lecteur d'écran a
 * besoin : dix valeurs annoncées sans leur nom ne disent rien (`CAHIER-UI.md`
 * §12).
 *
 * **Elle n'attend pas le serveur** (D76). L'écriture est acquise au cache
 * local ; attendre l'accusé de réception bloquerait le geste au comptoir là où
 * le hors-ligne devait le rendre possible. Le refus tardif arrive par le
 * `catch`, et le bandeau dit ce qui reste à envoyer.
 */

/** La largeur de chaque case, dans l'ordre de son classeur. */
const LARGEURS: Record<keyof SaisieLigne, string> = {
  client: "w-48",
  moto: "w-32",
  chassis: "w-40",
  recu: "w-16",
  credit: "w-32",
  reception: "w-32",
  retrait: "w-36",
  depot: "w-36",
  immatriculation: "w-40",
  transite: "w-40",
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

  function envoyer() {
    const probleme = validerLigne(saisie);
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
          saisie.transite.trim().toLocaleLowerCase("fr"),
      ) ?? null;

    const ecriture = dossier
      ? corrigerLigne(dossier, saisie, reconnu?.id ?? null, auteur)
      : ouvrirLigne(saisie, boutiqueId, reconnu?.id ?? null, auteur);

    ecriture.catch((cause) => setErreur(messageErreurDossierCarteGrise(cause)));
    onFermer();
  }

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
          <button type="button" onClick={envoyer} className="bouton bouton-principal">
            {dossier ? "Enregistrer les corrections" : "Ajouter la ligne"}
          </button>
          <button type="button" onClick={onFermer} className="bouton bouton-neutre">
            Annuler
          </button>
        </div>
      }
    >
      {/* La bande qui défile de côté : c'est elle qui tient la disposition de
          son tableur quand l'écran est plus étroit que la ligne. */}
      <div className="-mx-1 overflow-x-auto px-1 pb-2">
        <div className="flex w-max items-start gap-3">
          <Case cle="client" id={`${identifiant}-client`}>
            <input
              id={`${identifiant}-client`}
              value={saisie.client}
              maxLength={LONGUEUR_NOM_MAX}
              onChange={(evenement) => changer({ client: evenement.target.value })}
              className="saisie w-full"
            />
          </Case>

          <Case cle="moto" id={`${identifiant}-moto`}>
            <input
              id={`${identifiant}-moto`}
              value={saisie.moto}
              maxLength={LONGUEUR_NOM_MAX}
              onChange={(evenement) => changer({ moto: evenement.target.value })}
              className="saisie w-full"
            />
          </Case>

          <Case cle="chassis" id={`${identifiant}-chassis`}>
            <input
              id={`${identifiant}-chassis`}
              value={saisie.chassis}
              maxLength={LONGUEUR_CHASSIS_MAX}
              onChange={(evenement) => changer({ chassis: evenement.target.value })}
              className="saisie w-full font-mono uppercase"
            />
          </Case>

          {/* `√` ou `OK` dans son fichier : deux façons d'écrire oui, donc une
              case à cocher. Le commanditaire a confirmé que `Reci` est le reçu. */}
          <Case cle="recu" id={`${identifiant}-recu`}>
            <div className="flex h-10 items-center justify-center">
              <input
                id={`${identifiant}-recu`}
                type="checkbox"
                checked={saisie.recu}
                onChange={(evenement) => changer({ recu: evenement.target.checked })}
                className="size-[18px] shrink-0 accent-encre"
              />
            </div>
          </Case>

          <Case cle="credit" id={`${identifiant}-credit`}>
            <input
              id={`${identifiant}-credit`}
              inputMode="numeric"
              value={saisie.credit}
              onChange={(evenement) => changer({ credit: evenement.target.value })}
              className="saisie w-full text-right font-mono"
            />
          </Case>

          <Case cle="reception" id={`${identifiant}-reception`}>
            <input
              id={`${identifiant}-reception`}
              inputMode="tel"
              value={saisie.reception}
              maxLength={LONGUEUR_TELEPHONE_MAX}
              onChange={(evenement) => changer({ reception: evenement.target.value })}
              className="saisie w-full font-mono"
            />
          </Case>

          <Case cle="retrait" id={`${identifiant}-retrait`}>
            <input
              id={`${identifiant}-retrait`}
              type="date"
              value={saisie.retrait}
              onChange={(evenement) => changer({ retrait: evenement.target.value })}
              className="saisie w-full"
            />
          </Case>

          <Case cle="depot" id={`${identifiant}-depot`}>
            <input
              id={`${identifiant}-depot`}
              type="date"
              value={saisie.depot}
              onChange={(evenement) => changer({ depot: evenement.target.value })}
              className="saisie w-full"
            />
          </Case>

          <Case cle="immatriculation" id={`${identifiant}-immat`}>
            <input
              id={`${identifiant}-immat`}
              value={saisie.immatriculation}
              maxLength={LONGUEUR_IMMATRICULATION_MAX}
              onChange={(evenement) => changer({ immatriculation: evenement.target.value })}
              className="saisie w-full font-mono"
            />
          </Case>

          <Case cle="transite" id={`${identifiant}-transite`}>
            <input
              id={`${identifiant}-transite`}
              list={listeId}
              value={saisie.transite}
              maxLength={LONGUEUR_NOM_MAX}
              onChange={(evenement) => changer({ transite: evenement.target.value })}
              className="saisie w-full"
            />
            {/* Les noms déjà connus sont proposés, sans être imposés : il confie
                aussi à des gens qu'il n'a pas enregistrés. */}
            <datalist id={listeId}>
              {prestataires.map((prestataire) => (
                <option key={prestataire.id} value={prestataire.nom} />
              ))}
            </datalist>
          </Case>
        </div>
      </div>

      <EtatErreurSaisie message={erreur} className="mt-3" />
    </Modale>
  );
}

/** Une cellule : son entête au-dessus, en vrai texte, et la case en dessous. */
function Case({
  cle,
  id,
  children,
}: {
  cle: keyof SaisieLigne;
  id: string;
  children: React.ReactNode;
}) {
  return (
    <div className={`shrink-0 ${LARGEURS[cle]}`}>
      <label htmlFor={id} className="block pb-1 text-legende text-encre-doux">
        {ENTETES_LIGNE[cle]}
      </label>
      {children}
    </div>
  );
}
