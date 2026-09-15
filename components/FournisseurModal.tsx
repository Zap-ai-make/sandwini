"use client";

import { useState } from "react";
import { Champ } from "@/components/patrons/Champ";
import { EtatErreurSaisie } from "@/components/patrons/Etats";
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
 * **Un calque, pas un `<dialog>` natif.** Ce modal s'ouvre par-dessus celui de
 * l'arrivage, qui est un `<dialog>` modal : imbriquer deux `<dialog>` natifs les
 * fait se refermer l'un l'autre (mesuré). Un simple calque positionné, rendu à
 * l'intérieur du dialogue parent, se pose donc dans la même couche supérieure et
 * s'affiche au-dessus, sans piéger le natif. Échap et le clic sur le fond
 * ferment, à la main ; le clic hors du cadre se lit sur `onMouseDown` pour ne
 * pas fermer si le geste a commencé dans le cadre.
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

  if (!ouvert) return null;

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
        aria-labelledby="titre-fournisseur"
        onKeyDown={(evenement) => {
          if (evenement.key === "Escape") {
            evenement.preventDefault();
            onFermer();
          }
          if (evenement.key === "Enter" && evenement.target instanceof HTMLInputElement) {
            evenement.preventDefault();
            soumettre();
          }
        }}
        className="w-[min(28rem,calc(100vw-2rem))] rounded-carte border border-bord bg-papier text-encre shadow-panneau"
      >
        <div className="colonne-formulaire p-5">
          <h2 id="titre-fournisseur" className="text-lg font-semibold text-encre">
            Nouveau fournisseur
          </h2>
          <p className="text-corps text-encre-doux">
            De qui vient ce lot. Le nom suffit ; le reste sert à le relancer.
          </p>

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

          <div className="flex flex-wrap justify-end gap-2">
            <button type="button" onClick={onFermer} className="bouton bouton-discret">
              Annuler
            </button>
            <button type="button" onClick={soumettre} className="bouton bouton-principal">
              Ajouter le fournisseur
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
