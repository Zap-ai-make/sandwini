"use client";

import { LoaderCircle, Truck } from "lucide-react";
import { useMemo, useState } from "react";

import { Champ } from "@/components/patrons/Champ";
import { Avis } from "@/components/patrons/Avis";
import { EtatErreurSaisie } from "@/components/patrons/Etats";
import { Modale } from "@/components/patrons/Modale";
import type { Boutique } from "@/lib/domain/boutique";
import type { Moto } from "@/lib/domain/moto";
import {
  LONGUEUR_MOTIF_MAX,
  MOTOS_PAR_DEPLACEMENT_MAX,
  TRANSFERT_VIDE,
  destinationsGroupees,
  repartirPourDeplacement,
  type SaisieTransfert,
} from "@/lib/domain/transfert";
import type { Auteur } from "@/lib/repositories/referentiels";
import { deplacerMotos } from "@/lib/repositories/transferts";

/**
 * Déplacer plusieurs motos d'un coup (26 octobre 2026).
 *
 * **Le geste existait, une moto à la fois.** Le commanditaire déplace des
 * lots : « on doit pouvoir transférer plusieurs motos à la fois ». Ouvrir
 * vingt fiches pour vingt motos d'un même camion n'est pas un geste de
 * comptoir, c'est une corvée.
 *
 * **Les cases étaient déjà là** — celles de l'export Excel. Le bouton se pose
 * à côté du sien et lit la même sélection : une seule façon de choisir des
 * lignes dans cet écran.
 *
 * **Ce qui ne peut pas partir est nommé, pas écarté en silence.** La liste
 * mélange les statuts, et le responsable posé sur « Toutes les boutiques »
 * peut cocher des motos de magasins différents. Sans ce décompte, on croirait
 * avoir déplacé vingt motos quand dix-sept sont parties.
 *
 * **Aucune promesse de sécurité ici.** Qui a le droit d'envoyer, et vers où,
 * est tenu par `firestore.rules` : la règle vérifie le compte contre la
 * boutique que la moto *quitte*, ce qui laisse pousser et jamais tirer.
 */
export function DeplacerMotosModal({
  motos,
  boutiques,
  auteur,
  voitLesCouts,
  onFermer,
}: {
  /** Les motos cochées. Le tri entre partantes et bloquées est fait ici. */
  motos: Moto[];
  boutiques: Boutique[];
  auteur: Auteur;
  /** Le responsable seul peut corriger le `boutiqueId` du coût privé (D2). */
  voitLesCouts: boolean;
  onFermer: () => void;
}) {
  const [saisie, setSaisie] = useState<SaisieTransfert>(TRANSFERT_VIDE);
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  const destinations = useMemo(() => destinationsGroupees(boutiques), [boutiques]);
  const choisie = destinations.find((boutique) => boutique.id === saisie.versBoutiqueId);

  const { partantes, bloquees } = useMemo(
    () => repartirPourDeplacement(motos, saisie.versBoutiqueId.trim(), boutiques),
    [motos, saisie.versBoutiqueId, boutiques],
  );

  function soumettre() {
    if (envoi) return;
    if (!choisie) {
      setErreur("Choisissez la boutique de destination.");
      return;
    }
    if (saisie.motif.trim().length > LONGUEUR_MOTIF_MAX) {
      setErreur(`Le motif dépasse ${LONGUEUR_MOTIF_MAX} caractères.`);
      return;
    }
    if (partantes.length === 0) {
      setErreur("Aucune des motos cochées ne peut partir vers cette boutique.");
      return;
    }
    if (partantes.length > MOTOS_PAR_DEPLACEMENT_MAX) {
      setErreur(
        `Pas plus de ${MOTOS_PAR_DEPLACEMENT_MAX} motos à la fois : au-delà, l’envoi ne peut plus être garanti d’un seul tenant.`,
      );
      return;
    }

    setErreur(null);
    setEnvoi(true);
    /* L'écriture n'est pas attendue : hors ligne elle part en file et ne
       revient jamais. L'écran se ferme tout de suite, et l'échec éventuel
       remonte par le bandeau comme pour le reste du produit (D66). */
    const { enregistre } = deplacerMotos(partantes, saisie, auteur, voitLesCouts);
    enregistre.catch((cause) => console.error("Déplacement groupé refusé", cause));
    onFermer();
  }

  return (
    <Modale
      ouvert
      onFermer={onFermer}
      titre={`Déplacer ${motos.length} moto(s)`}
      description="Elles quittent leur boutique et entrent dans le stock de celle que vous choisissez."
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
            disabled={envoi || !choisie || partantes.length === 0}
            className="bouton bouton-principal"
          >
            {envoi ? (
              <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
            ) : (
              <Truck aria-hidden="true" className="size-4" />
            )}
            {choisie
              ? `Envoyer ${partantes.length} moto(s) vers ${choisie.nom}`
              : "Choisissez une destination"}
          </button>
        </div>
      }
    >
      <div className="colonne-formulaire space-y-4">
        <Champ id="vers-boutique" libelle="Boutique de destination">
          <select
            id="vers-boutique"
            value={saisie.versBoutiqueId}
            onChange={(evenement) =>
              setSaisie((avant) => ({ ...avant, versBoutiqueId: evenement.target.value }))
            }
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
          id="motif-transfert"
          libelle="Motif"
          facultatif
          /* L'exiger ferait taper « transfert » à chaque fois : la trace se
             remplirait de bruit, et on ne distinguerait plus les déplacements
             qui avaient une raison de ceux qui n'en avaient pas. */
          aide="Il s’écrit sur chacune des traces."
        >
          <input
            id="motif-transfert"
            value={saisie.motif}
            maxLength={LONGUEUR_MOTIF_MAX}
            onChange={(evenement) =>
              setSaisie((avant) => ({ ...avant, motif: evenement.target.value }))
            }
            className="saisie"
          />
        </Champ>

        {choisie && bloquees.length > 0 && (
          /* **Nommées une par une.** Un décompte seul — « 3 motos ne partiront
             pas » — oblige à rouvrir vingt fiches pour trouver lesquelles. */
          <Avis
            ton="transit"
            titre={`${bloquees.length} moto(s) cochée(s) ne partiront pas`}
          >
            <ul className="mt-1 space-y-1">
              {bloquees.map(({ moto, raison }) => (
                <li key={moto.id}>
                  <span className="plaque-code">{moto.numeroChassis}</span> — {raison}
                </li>
              ))}
            </ul>
          </Avis>
        )}

        <EtatErreurSaisie message={erreur} />
      </div>
    </Modale>
  );
}
