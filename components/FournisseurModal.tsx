"use client";

import { useState } from "react";
import { Champ } from "@/components/patrons/Champ";
import { EtatErreurSaisie } from "@/components/patrons/Etats";
import { Modale } from "@/components/patrons/Modale";
import {
  FOURNISSEUR_VIDE,
  LONGUEUR_LOCALITE_MAX,
  LONGUEUR_NOM_MAX,
  LONGUEUR_TELEPHONE_MAX,
  validerFournisseur,
  type SaisieFournisseur,
} from "@/lib/domain/fournisseur";
import { creerFournisseur, messageErreurFournisseur } from "@/lib/repositories/fournisseurs";
import type { Auteur } from "@/lib/repositories/referentiels";

/**
 * Ajouter un fournisseur sans quitter la saisie du lot.
 *
 * **Il s'ouvre par-dessus le modal de l'arrivage**, et c'est ce qui a décidé de
 * la mécanique du produit : deux `<dialog>` natifs imbriqués se referment l'un
 * l'autre, et le lot partait alors **sans fournisseur** (mesuré en S42). Depuis
 * S44 l'empilement n'est plus bricolé ici — `Modale` tient la pile, le focus,
 * Échap et le verrou de défilement pour les quatre modals du produit.
 *
 * L'identifiant du fournisseur créé est rendu **tout de suite** (comme une
 * marque, S39) : le `<select>` du lot le retient dans la foulée, sans réseau.
 */
export function FournisseurModal({
  ouvert,
  onFermer,
  onCree,
  auteur,
}: {
  ouvert: boolean;
  onFermer: () => void;
  onCree: (id: string) => void;
  auteur: Auteur | null;
}) {
  /* Monté seulement quand il est ouvert (cf. `SelectFournisseur`) : l'état part
     donc vide à chaque ouverture, sans le remettre à zéro dans un effet. */
  const [saisie, setSaisie] = useState<SaisieFournisseur>(FOURNISSEUR_VIDE);
  const [erreur, setErreur] = useState<string | null>(null);

  const changer = (partie: Partial<SaisieFournisseur>) =>
    setSaisie((actuel) => ({ ...actuel, ...partie }));

  function soumettre() {
    if (!auteur) return;
    const probleme = validerFournisseur(saisie);
    if (probleme) {
      setErreur(probleme);
      return;
    }
    const { id, enregistre } = creerFournisseur(saisie, auteur);
    enregistre.catch((cause) => setErreur(messageErreurFournisseur(cause)));
    onCree(id);
    onFermer();
  }

  return (
    <Modale
      ouvert={ouvert}
      onFermer={onFermer}
      titre="Nouveau fournisseur"
      taille="etroite"
      pied={
        <div className="ml-auto flex flex-wrap gap-2">
          <button type="button" onClick={onFermer} className="bouton bouton-discret">
            Annuler
          </button>
          <button type="button" onClick={soumettre} className="bouton bouton-principal">
            Ajouter le fournisseur
          </button>
        </div>
      }
    >
      <div
        /* Entrée valide, comme le ferait un formulaire — mais ce n'en est pas
           un : ce modal s'ouvre à l'intérieur de celui du lot, et deux `<form>`
           ne s'imbriquent pas davantage que deux `<dialog>`. */
        onKeyDown={(evenement) => {
          if (evenement.key === "Enter" && evenement.target instanceof HTMLInputElement) {
            evenement.preventDefault();
            soumettre();
          }
        }}
        className="rangee-champs"
      >
        <Champ id="f-nom" libelle="Nom">
          <input
            id="f-nom"
            value={saisie.nom}
            maxLength={LONGUEUR_NOM_MAX}
            autoFocus
            onChange={(evenement) => changer({ nom: evenement.target.value })}
            className="saisie"
          />
        </Champ>

        <Champ id="f-tel" libelle="Téléphone" facultatif>
          <input
            id="f-tel"
            inputMode="tel"
            value={saisie.telephone}
            maxLength={LONGUEUR_TELEPHONE_MAX}
            onChange={(evenement) => changer({ telephone: evenement.target.value })}
            className="saisie"
          />
        </Champ>

        <Champ id="f-localite" libelle="Localité" facultatif>
          <input
            id="f-localite"
            value={saisie.localite}
            maxLength={LONGUEUR_LOCALITE_MAX}
            onChange={(evenement) => changer({ localite: evenement.target.value })}
            className="saisie"
          />
        </Champ>

        <EtatErreurSaisie message={erreur} />
      </div>
    </Modale>
  );
}
