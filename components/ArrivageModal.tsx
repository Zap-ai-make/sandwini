"use client";

import { Plus, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { ChoixOuNouveau } from "@/components/ChoixOuNouveau";
import { SaisieLotMotos } from "@/components/SaisieLotMotos";
import { SelectFournisseur } from "@/components/SelectFournisseur";
import { Champ } from "@/components/patrons/Champ";
import { EtatErreurSaisie } from "@/components/patrons/Etats";
import {
  ARRIVAGE_VIDE,
  LIGNE_VIDE,
  LONGUEUR_DESCRIPTION_MAX,
  LONGUEUR_NOM_MAX,
  ajusterNombreDeLignes,
  preparerLot,
  type Arrivage,
  type LigneLot,
  type SaisieArrivage,
  type SousLot,
} from "@/lib/domain/arrivage";
import type { Fournisseur } from "@/lib/domain/fournisseur";
import type { Modele, Referentiel } from "@/lib/domain/referentiel";
import type { Moto } from "@/lib/domain/moto";
import { enregistrerArrivage, messageErreurArrivage } from "@/lib/repositories/arrivages";
import { creerEntree, creerModele, type Auteur } from "@/lib/repositories/referentiels";

/**
 * Enregistrer un arrivage — le lot entier, dans un modal (S42).
 *
 * Un seul geste : l'entête (nom, fournisseur), puis un ou plusieurs **groupes**.
 * Un lot vient d'un même fournisseur mais peut mêler plusieurs marques : chaque
 * groupe fixe sa marque, son modèle et son prix, puis liste ses châssis. On
 * ajoute un groupe pour une autre marque. Le nom propose les arrivages passés :
 * en choisir un reprend son fournisseur et amorce la première marque — un
 * nouveau lot du même fournisseur ressemble au précédent. Le prix reste
 * cloisonné : il n'apparaît qu'au responsable (D2/S39).
 */

/** Un groupe en cours de saisie : le sous-lot, plus le compteur qui le dimensionne. */
type GroupeSaisie = SousLot & { nombre: string };

const groupeVide = (): GroupeSaisie => ({
  marqueId: "",
  modeleId: "",
  prixAchat: "",
  lignes: [{ ...LIGNE_VIDE }],
  nombre: "1",
});

export function ArrivageModal({
  ouvert,
  onFermer,
  onEnregistre,
  fournisseurs,
  marques,
  modeles,
  stock,
  arrivages,
  auteur,
  boutiqueId,
  voitLesCouts,
}: {
  ouvert: boolean;
  onFermer: () => void;
  onEnregistre: (info: { nombre: number }) => void;
  fournisseurs: Fournisseur[] | null;
  marques: Referentiel[] | null;
  modeles: Modele[] | null;
  stock: Moto[] | null;
  arrivages: Arrivage[] | null;
  auteur: Auteur | null;
  boutiqueId: string;
  voitLesCouts: boolean;
}) {
  const reference = useRef<HTMLDialogElement>(null);
  const [saisie, setSaisie] = useState<SaisieArrivage>(ARRIVAGE_VIDE);
  const [groupes, setGroupes] = useState<GroupeSaisie[]>([groupeVide()]);
  const [erreur, setErreur] = useState<string | null>(null);

  useEffect(() => {
    const dialogue = reference.current;
    if (!dialogue) return;
    if (ouvert && !dialogue.open) {
      setSaisie(ARRIVAGE_VIDE);
      setGroupes([groupeVide()]);
      setErreur(null);
      dialogue.showModal();
    } else if (!ouvert && dialogue.open) {
      dialogue.close();
    }
  }, [ouvert]);

  const changer = (partie: Partial<SaisieArrivage>) =>
    setSaisie((actuel) => ({ ...actuel, ...partie }));

  const changerGroupe = (index: number, partie: Partial<GroupeSaisie>) =>
    setGroupes((actuel) => actuel.map((g, i) => (i === index ? { ...g, ...partie } : g)));

  const changerNombre = (index: number, valeur: string) =>
    setGroupes((actuel) =>
      actuel.map((g, i) => {
        if (i !== index) return g;
        const n = Number.parseInt(valeur, 10);
        return { ...g, nombre: valeur, lignes: ajusterNombreDeLignes(g.lignes, Number.isNaN(n) ? 1 : n) };
      }),
    );

  const changerLignes = (index: number, lignes: LigneLot[]) =>
    setGroupes((actuel) => actuel.map((g, i) => (i === index ? { ...g, lignes } : g)));

  const ajouterGroupe = () => setGroupes((actuel) => [...actuel, groupeVide()]);
  const retirerGroupe = (index: number) =>
    setGroupes((actuel) => (actuel.length > 1 ? actuel.filter((_, i) => i !== index) : actuel));

  /* On garde `null` (« pas encore lu ») distinct de `[]` (« aucun modèle ») :
     `ChoixOuNouveau` s'en sert pour ne proposer « + Ajouter » qu'une fois la
     liste connue, sinon il croirait un nom libre alors qu'il ne sait pas (S40). */
  const modelesDeLaMarque = (marqueId: string) =>
    modeles === null ? null : modeles.filter((modele) => modele.marqueId === marqueId);

  /* Le fournisseur et la première marque du lot précédent, retrouvés par son
     nom. La marque et le modèle ne vivent pas sur l'arrivage mais sur ses
     motos : on les lit donc dans le stock, sur la première moto du lot. */
  const arrivageParNom = useMemo(() => {
    const table = new Map<string, Arrivage>();
    for (const arrivage of arrivages ?? []) if (!table.has(arrivage.nom)) table.set(arrivage.nom, arrivage);
    return table;
  }, [arrivages]);
  const attributsParArrivage = useMemo(() => {
    const table = new Map<string, { marqueId: string; modeleId: string }>();
    for (const moto of stock ?? []) {
      if (moto.arrivageId && !table.has(moto.arrivageId)) {
        table.set(moto.arrivageId, { marqueId: moto.marqueId, modeleId: moto.modeleId });
      }
    }
    return table;
  }, [stock]);

  function changerNom(valeur: string) {
    const precedent = arrivageParNom.get(valeur.trim());
    if (!precedent) {
      changer({ nom: valeur });
      return;
    }
    changer({ nom: valeur, fournisseurId: precedent.fournisseurId });
    const attributs = attributsParArrivage.get(precedent.id);
    if (attributs) {
      setGroupes((actuel) =>
        actuel.map((g, i) =>
          i === 0 ? { ...g, marqueId: attributs.marqueId, modeleId: attributs.modeleId } : g,
        ),
      );
    }
  }

  function soumettre() {
    if (!auteur || !boutiqueId) return;
    const resultat = preparerLot(saisie, groupes, stock, voitLesCouts);
    if (!resultat.ok) {
      setErreur(resultat.erreur);
      return;
    }
    setErreur(null);
    const { enregistre } = enregistrerArrivage(saisie, resultat.motos, boutiqueId, auteur, voitLesCouts);
    enregistre.catch((cause) => setErreur(messageErreurArrivage(cause)));
    onEnregistre({ nombre: resultat.motos.length });
    onFermer();
  }

  /* Les motos se numérotent en continu d'un groupe à l'autre : chaque champ
     châssis garde ainsi un libellé unique même quand deux marques se suivent. */
  const offsets: number[] = [];
  let cumul = 0;
  for (const groupe of groupes) {
    offsets.push(cumul);
    cumul += groupe.lignes.length;
  }
  const plusieurs = groupes.length > 1;

  return (
    <dialog
      ref={reference}
      onClose={onFermer}
      onClick={(evenement) => {
        if (evenement.target === reference.current) onFermer();
      }}
      aria-labelledby="titre-arrivage"
      className="fixed inset-0 m-auto h-fit max-h-[calc(100dvh-2rem)] w-[min(56rem,calc(100vw-2rem))] overflow-y-auto rounded-carte border border-bord bg-papier p-0 text-encre shadow-panneau backdrop:bg-nuit/45"
    >
      <div className="colonne-formulaire p-5 sm:p-6">
        <div>
          <h2 id="titre-arrivage" className="text-lg font-semibold text-encre">
            Enregistrer un arrivage
          </h2>
          <p className="text-corps text-encre-doux">
            Un lot d’un même fournisseur. Une marque par groupe : ajoutez-en un pour une autre marque.
          </p>
        </div>

        <fieldset className="cadre p-4">
          <legend className="px-1 font-semibold text-encre">L’arrivage</legend>
          <div className="mt-2 colonne-formulaire">
            <Champ
              id="arr-nom"
              libelle="Nom de l’arrivage"
              aide="Choisissez un arrivage passé pour reprendre son fournisseur et sa marque."
            >
              <input
                id="arr-nom"
                list="arrivages-passes"
                value={saisie.nom}
                maxLength={LONGUEUR_NOM_MAX}
                autoComplete="off"
                onChange={(evenement) => changerNom(evenement.target.value)}
                className="saisie"
              />
              <datalist id="arrivages-passes">
                {[...arrivageParNom.keys()].map((nom) => (
                  <option key={nom} value={nom} />
                ))}
              </datalist>
            </Champ>

            <SelectFournisseur
              valeur={saisie.fournisseurId}
              changer={(fournisseurId) => changer({ fournisseurId })}
              fournisseurs={fournisseurs}
              auteur={auteur}
            />

            <div className="grid gap-3 sm:grid-cols-2">
              <Champ id="arr-date" libelle="Date d’arrivée" facultatif>
                <input
                  id="arr-date"
                  type="date"
                  value={saisie.date}
                  onChange={(evenement) => changer({ date: evenement.target.value })}
                  className="saisie"
                />
              </Champ>
              <Champ id="arr-desc" libelle="Description" facultatif>
                <input
                  id="arr-desc"
                  value={saisie.description}
                  maxLength={LONGUEUR_DESCRIPTION_MAX}
                  placeholder="Ex. dédouanement du 12 mars"
                  onChange={(evenement) => changer({ description: evenement.target.value })}
                  className="saisie"
                />
              </Champ>
            </div>
          </div>
        </fieldset>

        {groupes.map((groupe, index) => (
          <fieldset key={index} className="cadre p-4">
            <legend className="flex items-center gap-2 px-1 font-semibold text-encre">
              {plusieurs ? `Groupe ${index + 1}` : "La marque et ses motos"}
              {plusieurs && (
                <button
                  type="button"
                  onClick={() => retirerGroupe(index)}
                  className="bouton bouton-discret px-2 py-1 text-corps"
                  aria-label={`Retirer le groupe ${index + 1}`}
                >
                  <X aria-hidden="true" className="size-4" />
                  Retirer
                </button>
              )}
            </legend>

            <div className="mt-2 grid gap-3 sm:grid-cols-2">
              <ChoixOuNouveau
                id={`arr-marque-${index}`}
                libelle="Marque"
                singulier="marque"
                determinant="cette"
                valeur={groupe.marqueId}
                changer={(marqueId) => changerGroupe(index, { marqueId, modeleId: "" })}
                toutes={marques}
                invite="Choisir une marque"
                creer={(nom, auteur) => creerEntree("marques", nom, auteur)}
              />

              <ChoixOuNouveau
                id={`arr-modele-${index}`}
                libelle="Modèle"
                singulier="modèle"
                determinant="ce"
                valeur={groupe.modeleId}
                changer={(modeleId) => changerGroupe(index, { modeleId })}
                toutes={modelesDeLaMarque(groupe.marqueId)}
                invite={groupe.marqueId ? "Choisir un modèle" : "Choisissez d’abord une marque"}
                desactive={!groupe.marqueId}
                creer={(nom, auteur) => creerModele(groupe.marqueId, nom, auteur)}
              />

              <Champ id={`arr-nombre-${index}`} libelle="Nombre de motos">
                <input
                  id={`arr-nombre-${index}`}
                  inputMode="numeric"
                  value={groupe.nombre}
                  onChange={(evenement) => changerNombre(index, evenement.target.value)}
                  className="saisie"
                />
              </Champ>

              {voitLesCouts && (
                <Champ id={`arr-prix-${index}`} libelle="Prix d’achat commun" facultatif>
                  <input
                    id={`arr-prix-${index}`}
                    inputMode="numeric"
                    value={groupe.prixAchat}
                    placeholder="450000"
                    onChange={(evenement) => changerGroupe(index, { prixAchat: evenement.target.value })}
                    className="saisie"
                  />
                </Champ>
              )}
            </div>

            <p className="mt-3 text-corps text-encre-doux">
              Une ligne par moto : son numéro de châssis, et sa couleur si vous l’avez.
            </p>
            <div className="mt-2">
              <SaisieLotMotos
                lignes={groupe.lignes}
                setLignes={(lignes) => changerLignes(index, lignes)}
                numeroDepart={offsets[index]}
              />
            </div>
          </fieldset>
        ))}

        <div>
          <button type="button" onClick={ajouterGroupe} className="bouton bouton-discret">
            <Plus aria-hidden="true" className="size-4" />
            Ajouter une marque
          </button>
        </div>

        <EtatErreurSaisie message={erreur} />

        <div className="flex flex-wrap justify-end gap-2">
          <button type="button" onClick={onFermer} className="bouton bouton-discret">
            Annuler
          </button>
          <button
            type="button"
            onClick={soumettre}
            disabled={stock === null}
            className="bouton bouton-principal"
          >
            {stock === null ? "Lecture du stock…" : "Enregistrer le lot"}
          </button>
        </div>
      </div>
    </dialog>
  );
}
