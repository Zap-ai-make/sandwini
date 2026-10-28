"use client";

import { useMemo, useState } from "react";
import { SelectFournisseur } from "@/components/SelectFournisseur";
import { Champ } from "@/components/patrons/Champ";
import { EtatErreurSaisie } from "@/components/patrons/Etats";
import {
  LONGUEUR_DESCRIPTION_MAX,
  LONGUEUR_NOM_MAX,
  lignesDuLot,
  preparerCorrectionLot,
  validerArrivage,
  type Arrivage,
  type LigneCorrection,
  type SaisieArrivage,
} from "@/lib/domain/arrivage";
import { Modale } from "@/components/patrons/Modale";
import type { Fournisseur } from "@/lib/domain/fournisseur";
import { jourLocal } from "@/lib/domain/format";
import { LONGUEUR_CHASSIS_MAX, LONGUEUR_TEXTE_MAX, type Moto } from "@/lib/domain/moto";
import type { Modele, Referentiel } from "@/lib/domain/referentiel";
import { corrigerLot, messageErreurArrivage } from "@/lib/repositories/arrivages";
import type { Auteur } from "@/lib/repositories/referentiels";

/**
 * Corriger un lot — son entête **et** ses motos (26 octobre 2026).
 *
 * **Ce qui manquait.** Cette modale ne reprenait que l'entête, et l'annonçait :
 * « l'entête seule, les motos du lot ne changent pas ici ». Or rien d'autre
 * dans le produit ne reprenait l'identité d'une moto : un châssis se relève à
 * la main sur un cadre, parfois sous la poussière, et un chiffre faux restait
 * faux pour toujours. Le commanditaire l'a demandé en ces termes : « modifier
 * doit pouvoir modifier tous les éléments, pas uniquement nom, fournisseur…
 * même les motos, numéro… au cas où si le client se trompe à
 * l'enregistrement ».
 *
 * **La même grille que le classeur des cartes grises** (S59), parce que c'est
 * la forme que le commanditaire lit sans l'apprendre : une ligne par moto,
 * l'entête en haut, le numéro de ligne figé à gauche quand on part vers la
 * droite. Les colonnes sont celles qui décrivent la moto ; ce qui lui est
 * *arrivé* — statut, papiers, scans, coût — a ses gestes ailleurs.
 *
 * **La marque se choisit, elle ne s'invente pas ici.** Une cellule de grille ne
 * porte pas le « ou créer » du formulaire de réception : on corrige une marque
 * mal choisie, et une marque qui n'existe pas encore s'ajoute là où le
 * catalogue se tient.
 *
 * Monté seulement à l'ouverture : l'état part du lot à corriger, sans effet de
 * remise à zéro. Le calque, le focus, Échap et le verrou de défilement viennent
 * de `Modale` depuis S44.
 */
export function ModifierArrivageModal({
  arrivage,
  stock,
  fournisseurs,
  marques,
  modeles,
  auteur,
  onFermer,
  onModifie,
  onEchec,
}: {
  arrivage: Arrivage;
  /** Tout le stock de la boutique : il porte les motos du lot, et sert à vérifier
      qu'un châssis corrigé n'est pas déjà celui d'une autre moto. `null` = pas lu. */
  stock: Moto[] | null;
  fournisseurs: Fournisseur[] | null;
  marques: Referentiel[] | null;
  modeles: Modele[] | null;
  auteur: Auteur | null;
  onFermer: () => void;
  onModifie: () => void;
  /** Un refus du serveur arrive après la fermeture : c'est l'écran qui le porte. */
  onEchec: (message: string) => void;
}) {
  const motosDuLot = useMemo(
    () => (stock ?? []).filter((moto) => moto.arrivageId === arrivage.id),
    [stock, arrivage.id],
  );

  const [saisie, setSaisie] = useState<SaisieArrivage>({
    nom: arrivage.nom,
    fournisseurId: arrivage.fournisseurId,
    date: arrivage.date ? jourLocal(arrivage.date) : "",
    description: arrivage.description,
  });
  const [lignes, setLignes] = useState<LigneCorrection[]>(() => lignesDuLot(motosDuLot));
  /* Le rang voyage avec le message : la grille allume la ligne fautive plutôt
     que de laisser chercher laquelle des trente l'est (`DESIGN.md` §5). */
  const [refus, setRefus] = useState<{ message: string; rang: number | null } | null>(null);

  const changer = (partie: Partial<SaisieArrivage>) =>
    setSaisie((actuel) => ({ ...actuel, ...partie }));

  const changerLigne = (rang: number, partie: Partial<LigneCorrection>) =>
    setLignes((actuelles) =>
      actuelles.map((ligne, index) => (index === rang ? { ...ligne, ...partie } : ligne)),
    );

  function soumettre() {
    if (!auteur) return;

    const probleme = validerArrivage(saisie);
    if (probleme) {
      setRefus({ message: probleme, rang: null });
      return;
    }

    const resultat = preparerCorrectionLot(lignes, motosDuLot, stock);
    if (!resultat.ok) {
      setRefus({ message: resultat.erreur, rang: resultat.rang });
      return;
    }

    const { enregistre } = corrigerLot(arrivage.id, saisie, resultat.corrigees, auteur);
    /* L'écriture n'est pas attendue : hors ligne elle part en file et ne revient
       jamais. L'écran se ferme tout de suite, et un refus remonte à la page,
       qui reste là pour l'afficher (D66). */
    enregistre.catch((cause: unknown) => onEchec(messageErreurArrivage(cause)));
    onModifie();
    onFermer();
  }

  return (
    <Modale
      ouvert
      onFermer={onFermer}
      titre="Modifier l’arrivage"
      taille={motosDuLot.length > 0 ? "pleine" : "moyenne"}
      pied={
        <div className="ml-auto flex flex-wrap gap-2">
          <button type="button" onClick={onFermer} className="bouton bouton-discret">
            Annuler
          </button>
          <button type="button" onClick={soumettre} className="bouton bouton-principal">
            Enregistrer les modifications
          </button>
        </div>
      }
    >
      <div className="space-y-6">
        {/* L'entête garde la largeur d'un formulaire même quand la modale
            s'élargit pour la grille : un champ « Nom » étiré sur 78rem ne se
            lit pas. La borne est posée ici, sur la mise en page, et non sur le
            champ — c'est ce que dit `globals.css` au sujet de la colonne. */}
        <div className="colonne-formulaire max-w-2xl space-y-4">
          <Champ id="mod-nom" libelle="Nom de l’arrivage">
            <input
              id="mod-nom"
              value={saisie.nom}
              maxLength={LONGUEUR_NOM_MAX}
              autoComplete="off"
              onChange={(evenement) => changer({ nom: evenement.target.value })}
              className="saisie"
            />
          </Champ>

          <SelectFournisseur
            valeur={saisie.fournisseurId}
            changer={(fournisseurId) => changer({ fournisseurId })}
            fournisseurs={fournisseurs}
            auteur={auteur}
          />

          <div className="grid gap-3 sm:grid-cols-2">
            <Champ id="mod-date" libelle="Date d’arrivée" facultatif>
              <input
                id="mod-date"
                type="date"
                value={saisie.date}
                onChange={(evenement) => changer({ date: evenement.target.value })}
                className="saisie"
              />
            </Champ>
            <Champ id="mod-desc" libelle="Description" facultatif>
              <input
                id="mod-desc"
                value={saisie.description}
                maxLength={LONGUEUR_DESCRIPTION_MAX}
                onChange={(evenement) => changer({ description: evenement.target.value })}
                className="saisie"
              />
            </Champ>
          </div>
        </div>

        <section aria-labelledby="titre-motos-lot">
          <h3 id="titre-motos-lot" className="text-sm font-semibold text-encre">
            Les motos du lot
          </h3>

          {stock === null ? (
            null
          ) : motosDuLot.length === 0 ? (
            null
          ) : (
            <>
              <GrilleMotos
                lignes={lignes}
                marques={marques}
                modeles={modeles}
                rangFautif={refus?.rang ?? null}
                changer={changerLigne}
              />
            </>
          )}
        </section>

        <EtatErreurSaisie message={refus?.message ?? null} />
      </div>
    </Modale>
  );
}

/** Les colonnes, dans l'ordre où le bordereau se lit. */
const COLONNES: { cle: keyof LigneCorrection; titre: string; largeur: string }[] = [
  { cle: "marqueId", titre: "Marque", largeur: "11rem" },
  { cle: "modeleId", titre: "Modèle", largeur: "11rem" },
  { cle: "numeroChassis", titre: "N° de cadre", largeur: "14rem" },
  { cle: "numeroMoteur", titre: "N° moteur", largeur: "12rem" },
  { cle: "couleur", titre: "Couleur", largeur: "9rem" },
  { cle: "annee", titre: "Année", largeur: "6rem" },
];

function GrilleMotos({
  lignes,
  marques,
  modeles,
  rangFautif,
  changer,
}: {
  lignes: LigneCorrection[];
  marques: Referentiel[] | null;
  modeles: Modele[] | null;
  rangFautif: number | null;
  changer: (rang: number, partie: Partial<LigneCorrection>) => void;
}) {
  return (
    <div className="cadre-grille mt-2">
      <table className="grille-saisie">
        <caption className="sr-only">
          Les motos du lot, une ligne chacune : marque, modèle, numéros, couleur, année et état.
        </caption>
        <thead>
          <tr>
            <th scope="col" className="gouttiere">
              <span className="sr-only">Ligne</span>
              <span aria-hidden="true">#</span>
            </th>
            {COLONNES.map((colonne) => (
              <th key={colonne.cle} scope="col" style={{ width: colonne.largeur }}>
                {colonne.titre}
              </th>
            ))}
          </tr>
        </thead>

        <tbody>
          {lignes.map((ligne, rang) => (
            <tr key={ligne.motoId} className={rangFautif === rang ? "ligne-fautive" : undefined}>
              <td className="gouttiere">{rang + 1}</td>

              <td>
                <select
                  value={ligne.marqueId}
                  onChange={(evenement) =>
                    /* Changer de marque vide le modèle : un modèle appartient à
                       une marque, le garder désignerait une moto qui n'existe pas. */
                    changer(rang, { marqueId: evenement.target.value, modeleId: "" })
                  }
                  className="cellule"
                  aria-label={`Marque, ligne ${rang + 1}`}
                >
                  <option value="">—</option>
                  {(marques ?? []).map((marque) => (
                    <option key={marque.id} value={marque.id}>
                      {marque.nom}
                    </option>
                  ))}
                </select>
              </td>

              <td>
                <select
                  value={ligne.modeleId}
                  disabled={!ligne.marqueId}
                  onChange={(evenement) => changer(rang, { modeleId: evenement.target.value })}
                  className="cellule"
                  aria-label={`Modèle, ligne ${rang + 1}`}
                >
                  <option value="">—</option>
                  {(modeles ?? [])
                    .filter((modele) => modele.marqueId === ligne.marqueId)
                    .map((modele) => (
                      <option key={modele.id} value={modele.id}>
                        {modele.nom}
                      </option>
                    ))}
                </select>
              </td>

              <td>
                <input
                  value={ligne.numeroChassis}
                  maxLength={LONGUEUR_CHASSIS_MAX}
                  autoComplete="off"
                  spellCheck={false}
                  onChange={(evenement) =>
                    changer(rang, { numeroChassis: evenement.target.value })
                  }
                  className="cellule font-code"
                  aria-label={`Numéro de cadre, ligne ${rang + 1}`}
                />
              </td>

              <td>
                <input
                  value={ligne.numeroMoteur}
                  maxLength={LONGUEUR_CHASSIS_MAX}
                  autoComplete="off"
                  spellCheck={false}
                  onChange={(evenement) => changer(rang, { numeroMoteur: evenement.target.value })}
                  className="cellule font-code"
                  aria-label={`Numéro de moteur, ligne ${rang + 1}`}
                />
              </td>

              <td>
                <input
                  value={ligne.couleur}
                  maxLength={LONGUEUR_TEXTE_MAX}
                  autoComplete="off"
                  onChange={(evenement) => changer(rang, { couleur: evenement.target.value })}
                  className="cellule"
                  aria-label={`Couleur, ligne ${rang + 1}`}
                />
              </td>

              <td>
                <input
                  value={ligne.annee}
                  inputMode="numeric"
                  maxLength={4}
                  autoComplete="off"
                  onChange={(evenement) => changer(rang, { annee: evenement.target.value })}
                  className="cellule font-code tabular-nums"
                  aria-label={`Année, ligne ${rang + 1}`}
                />
              </td>

            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
