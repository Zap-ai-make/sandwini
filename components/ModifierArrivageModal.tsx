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
import type { Fournisseur } from "@/lib/domain/fournisseur";
import { jourLocal } from "@/lib/domain/format";
import { messageErreurArrivage, modifierArrivage } from "@/lib/repositories/arrivages";
import type { Auteur } from "@/lib/repositories/referentiels";

/**
 * Corriger l'entête d'un arrivage (S43) — nom, fournisseur, date, description.
 *
 * On ne touche pas aux motos du lot : leur fiche s'en charge. Un calque simple,
 * pas un `<dialog>` natif, pour la même raison qu'en S42 — deux modals natifs
 * imbriqués se referment l'un l'autre. Monté seulement à l'ouverture : l'état
 * part de l'arrivage à corriger, sans effet de remise à zéro.
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
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-nuit/45 p-4"
      onMouseDown={(evenement) => {
        if (evenement.target === evenement.currentTarget) onFermer();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="titre-modifier-arrivage"
        onKeyDown={(evenement) => {
          if (evenement.key === "Escape") {
            evenement.preventDefault();
            onFermer();
          }
        }}
        className="w-[min(36rem,calc(100vw-2rem))] rounded-carte border border-bord bg-papier text-encre shadow-panneau"
      >
        <div className="colonne-formulaire p-5">
          <h2 id="titre-modifier-arrivage" className="text-lg font-semibold text-encre">
            Modifier l’arrivage
          </h2>
          <p className="text-corps text-encre-doux">
            L’entête seule. Les motos du lot ne changent pas ici.
          </p>

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

          <div className="flex flex-wrap justify-end gap-2">
            <button type="button" onClick={onFermer} className="bouton bouton-discret">
              Annuler
            </button>
            <button type="button" onClick={soumettre} className="bouton bouton-principal">
              Enregistrer les modifications
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
