"use client";

import { CircleAlert, LoaderCircle, Truck } from "lucide-react";
import { useState } from "react";
import { Champ } from "@/components/patrons/Champ";
import { EtatErreurSaisie } from "@/components/patrons/Etats";
import { Modale } from "@/components/patrons/Modale";
import { nomDeBoutique, type Boutique } from "@/lib/domain/boutique";
import type { Moto } from "@/lib/domain/moto";
import {
  LONGUEUR_MOTIF_MAX,
  TRANSFERT_VIDE,
  destinationsPossibles,
  validerTransfert,
  type SaisieTransfert,
} from "@/lib/domain/transfert";
import type { Auteur } from "@/lib/repositories/referentiels";
import { deplacerMoto, messageErreurTransfert } from "@/lib/repositories/transferts";

/**
 * Déplacer une moto d'une boutique à une autre (S17).
 *
 * **L'origine n'est pas choisie : c'est celle de la moto.** Le responsable posé
 * sur « Toutes les boutiques » n'a pas de boutique courante, et le geste doit
 * marcher pour lui comme pour le gérant. Faire venir l'origine du sélecteur du
 * bandeau aurait créé deux chemins pour un seul geste.
 *
 * **La confirmation nomme les deux boutiques**, parce qu'une liste déroulante
 * de codes à trois lettres se trompe de ligne sans prévenir — et qu'ici
 * l'erreur fait disparaître une moto du stock de quelqu'un.
 *
 * **Ce composant ne garde aucune promesse de sécurité.** Qui a le droit
 * d'envoyer, et vers où, est tenu par `firestore.rules` : la règle vérifie le
 * compte contre la boutique que la moto *quitte*, ce qui laisse pousser et
 * jamais tirer. Ce qui est fait ici sert à ne pas proposer un geste qui serait
 * refusé ensuite.
 */
export function DeplacerMotoModal({
  moto,
  boutiques,
  auteur,
  voitLesCouts,
  ouvert,
  onFermer,
}: {
  moto: Moto;
  /** Toutes les boutiques lisibles. Le tri et le filtre sont faits ici. */
  boutiques: Boutique[];
  auteur: Auteur;
  /** Le responsable seul peut corriger le `boutiqueId` du coût privé (D2). */
  voitLesCouts: boolean;
  ouvert: boolean;
  onFermer: () => void;
}) {
  /* Monté seulement quand il est ouvert : l'état part vide à chaque ouverture,
     sans effet de remise à zéro. */
  const [saisie, setSaisie] = useState<SaisieTransfert>(TRANSFERT_VIDE);
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  const destinations = destinationsPossibles(boutiques, moto.boutiqueId);
  const choisie = destinations.find((boutique) => boutique.id === saisie.versBoutiqueId);

  async function soumettre() {
    if (envoi) return;
    const probleme = validerTransfert(saisie, moto.boutiqueId);
    if (probleme) {
      setErreur(probleme);
      return;
    }

    setErreur(null);
    setEnvoi(true);
    try {
      /* L'écriture n'est pas attendue : hors ligne elle part en file et ne
         revient jamais. L'écran se ferme tout de suite, et l'échec éventuel
         remonte par le bandeau comme pour le reste du produit (D66). */
      const { enregistre } = deplacerMoto(moto, saisie, auteur, voitLesCouts);
      enregistre.catch((cause) => console.error("Déplacement refusé", cause));
      onFermer();
    } catch (cause) {
      setErreur(messageErreurTransfert(cause));
      setEnvoi(false);
    }
  }

  return (
    <Modale
      ouvert={ouvert}
      onFermer={onFermer}
      titre="Déplacer cette moto"
      taille="etroite"
      pied={
        <div className="ml-auto flex flex-wrap gap-2">
          <button
            type="button"
            onClick={onFermer}
            disabled={envoi}
            className="bouton bouton-discret"
          >
            Annuler
          </button>
          <button
            type="button"
            onClick={soumettre}
            disabled={envoi || !choisie}
            className="bouton bouton-principal"
          >
            {envoi ? (
              <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
            ) : (
              <Truck aria-hidden="true" className="size-4" />
            )}
            {envoi ? "Déplacement…" : "Déplacer"}
          </button>
        </div>
      }
    >
      <div className="rangee-champs">
        {/* La moto visée, en toutes lettres : un châssis se confond avec le
            suivant à deux caractères près. */}
        <div className="rounded-plaque border border-bord bg-fond p-3">
          <p className="font-code text-encre">{moto.numeroChassis}</p>
          <p className="text-corps text-encre-doux">
            Aujourd’hui à {nomDeBoutique(boutiques, moto.boutiqueId)}
          </p>
        </div>

        <Champ id="transfert-destination" libelle="Boutique de destination">
          <select
            id="transfert-destination"
            value={saisie.versBoutiqueId}
            onChange={(evenement) =>
              setSaisie((actuel) => ({ ...actuel, versBoutiqueId: evenement.target.value }))
            }
            autoFocus
            className="saisie"
          >
            <option value="">Choisir…</option>
            {destinations.map((boutique) => (
              <option key={boutique.id} value={boutique.id}>
                {boutique.nom}
              </option>
            ))}
          </select>
        </Champ>

        <Champ
          id="transfert-motif"
          libelle="Motif"
          facultatif
        >
          <input
            id="transfert-motif"
            value={saisie.motif}
            maxLength={LONGUEUR_MOTIF_MAX}
            onChange={(evenement) =>
              setSaisie((actuel) => ({ ...actuel, motif: evenement.target.value }))
            }
            className="saisie"
          />
        </Champ>


        <p className="flex gap-2 text-corps text-encre-doux">
          <CircleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          <span>
            Un déplacement ne s’annule pas&nbsp;: pour la faire revenir, on la déplace à nouveau, et
            les deux trajets restent lisibles.
          </span>
        </p>

        <EtatErreurSaisie message={erreur} />
      </div>
    </Modale>
  );
}
