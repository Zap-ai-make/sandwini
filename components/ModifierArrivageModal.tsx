"use client";

import { useState } from "react";
import { SelectFournisseur } from "@/components/SelectFournisseur";
import { Champ } from "@/components/patrons/Champ";
import { EtatErreurSaisie } from "@/components/patrons/Etats";
import {
  LONGUEUR_DESCRIPTION_MAX,
  LONGUEUR_NOM_MAX,
  validerArrivage,
  type Arrivage,
  type SaisieArrivage,
} from "@/lib/domain/arrivage";
import { Modale } from "@/components/patrons/Modale";
import type { Fournisseur } from "@/lib/domain/fournisseur";
import { jourLocal } from "@/lib/domain/format";
import { messageErreurArrivage, modifierArrivage } from "@/lib/repositories/arrivages";
import type { Auteur } from "@/lib/repositories/referentiels";

/**
 * Corriger l'entête d'un arrivage (S43) — nom, fournisseur, date, description.
 *
 * On ne touche pas aux motos du lot : leur fiche s'en charge. Monté seulement à
 * l'ouverture : l'état part de l'arrivage à corriger, sans effet de remise à
 * zéro. Le calque, le focus, Échap et le verrou de défilement viennent de
 * `Modale` depuis S44 — ils étaient recopiés ici, et **Échap ne marchait pas** :
 * la touche était écoutée sur une boîte que rien ne focalisait à l'ouverture.
 */
export function ModifierArrivageModal({
  arrivage,
  fournisseurs,
  auteur,
  onFermer,
  onModifie,
}: {
  arrivage: Arrivage;
  fournisseurs: Fournisseur[] | null;
  auteur: Auteur | null;
  onFermer: () => void;
  onModifie: () => void;
}) {
  const [saisie, setSaisie] = useState<SaisieArrivage>({
    nom: arrivage.nom,
    fournisseurId: arrivage.fournisseurId,
    date: arrivage.date ? jourLocal(arrivage.date) : "",
    description: arrivage.description,
  });
  const [erreur, setErreur] = useState<string | null>(null);

  const changer = (partie: Partial<SaisieArrivage>) =>
    setSaisie((actuel) => ({ ...actuel, ...partie }));

  function soumettre() {
    if (!auteur) return;
    const probleme = validerArrivage(saisie);
    if (probleme) {
      setErreur(probleme);
      return;
    }
    const { enregistre } = modifierArrivage(arrivage.id, saisie, auteur);
    enregistre.catch((cause) => setErreur(messageErreurArrivage(cause)));
    onModifie();
    onFermer();
  }

  return (
    <Modale
      ouvert
      onFermer={onFermer}
      titre="Modifier l’arrivage"
      description="L’entête seule. Les motos du lot ne changent pas ici."
      taille="moyenne"
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
      <div className="space-y-4">
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

        <EtatErreurSaisie message={erreur} />
      </div>
    </Modale>
  );
}
