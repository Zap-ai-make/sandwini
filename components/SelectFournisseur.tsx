"use client";

import { Plus } from "lucide-react";
import { useState } from "react";
import { FournisseurModal } from "@/components/FournisseurModal";
import type { Fournisseur } from "@/lib/domain/fournisseur";
import type { Auteur } from "@/lib/repositories/referentiels";

/**
 * Choisir un fournisseur, ou en ajouter un sur place.
 *
 * Le `<select>` liste les existants ; le bouton « Nouveau » superpose la modal.
 * Le fournisseur créé se sélectionne aussitôt — on ne quitte pas le lot en
 * cours pour aller le déclarer ailleurs (même geste que la marque en S39).
 *
 * `fournisseurs` à `null` veut dire « pas encore lu » : le champ se désactive
 * et le dit, plutôt que d'afficher une liste vide qui ferait croire qu'il n'y
 * en a aucun (S40, D95).
 */
export function SelectFournisseur({
  valeur,
  changer,
  fournisseurs,
  auteur,
  erreur,
}: {
  valeur: string;
  changer: (id: string) => void;
  fournisseurs: Fournisseur[] | null;
  auteur: Auteur | null;
  erreur?: string | null;
}) {
  const [modaleOuverte, setModaleOuverte] = useState(false);
  const chargement = fournisseurs === null;

  return (
    <div>
      <label htmlFor="fournisseur" className="block font-medium text-encre">
        Fournisseur
      </label>
      <div className="mt-1.5 flex flex-wrap gap-2">
        <select
          id="fournisseur"
          value={valeur}
          disabled={chargement}
          onChange={(evenement) => changer(evenement.target.value)}
          aria-describedby={erreur ? "fournisseur-erreur" : undefined}
          className="saisie min-w-0 flex-1"
        >
          <option value="">{chargement ? "Chargement…" : "Choisir un fournisseur"}</option>
          {(fournisseurs ?? []).map((fournisseur) => (
            <option key={fournisseur.id} value={fournisseur.id}>
              {fournisseur.nom}
              {fournisseur.localite ? ` — ${fournisseur.localite}` : ""}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => setModaleOuverte(true)}
          className="bouton bouton-discret shrink-0"
        >
          <Plus aria-hidden="true" className="size-4" />
          Nouveau
        </button>
      </div>
      {erreur && (
        <p id="fournisseur-erreur" className="mt-1 text-corps font-semibold text-alerte">
          {erreur}
        </p>
      )}

      {modaleOuverte && (
        <FournisseurModal
          ouvert
          onFermer={() => setModaleOuverte(false)}
          onCree={(id) => changer(id)}
          auteur={auteur}
        />
      )}
    </div>
  );
}
