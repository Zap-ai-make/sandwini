"use client";

import { useCallback } from "react";
import { ModaleVente } from "@/components/ModaleVente";
import { EtatChargement, EtatErreur } from "@/components/patrons/Etats";
import { Modale } from "@/components/patrons/Modale";
import type { DossierCarteGrise } from "@/lib/domain/dossier-carte-grise";
import type { Vente, Versement } from "@/lib/domain/vente";
import { useAbonnement } from "@/lib/repositories/abonnement";
import { ecouterDossierDeVente } from "@/lib/repositories/dossiers-carte-grise";
import { ecouterVente, ecouterVersements } from "@/lib/repositories/ventes";

/**
 * Ouvre la modale de vente en mode correction (S25).
 *
 * Elle ne s'ouvre qu'une fois **la vente et ses versements lus** : la saisie
 * repart de ce qui a été versé, et une correction ouverte trop tôt partirait
 * d'un montant faux — que la correction rendrait au client. Le dossier de
 * carte grise, lui, peut manquer : la correction part alors sans y toucher.
 */
export function CorrigerVente({ id, onFermer }: { id: string; onFermer: () => void }) {
  const { valeur: vente, erreur } = useAbonnement(
    useCallback(
      (auChangement: (vente: Vente | null) => void, enErreur: (cause: unknown) => void) =>
        ecouterVente(id, auChangement, enErreur),
      [id],
    ),
    "Cette vente n’a pas pu être chargée.",
  );
  const { valeur: versements, erreur: erreurVersements } = useAbonnement(
    useCallback(
      (auChangement: (versements: Versement[]) => void, enErreur: (cause: unknown) => void) =>
        ecouterVersements(id, auChangement, enErreur),
      [id],
    ),
    "Les versements n’ont pas pu être lus.",
  );
  const boutiqueId = vente?.boutiqueId ?? "";
  const { valeur: lu, erreur: erreurDossier } = useAbonnement(
    useCallback(
      (
        auChangement: (lu: { dossier: DossierCarteGrise | null }) => void,
        enErreur: (cause: unknown) => void,
      ) =>
        boutiqueId ? ecouterDossierDeVente({ id, boutiqueId }, auChangement, enErreur) : () => {},
      [id, boutiqueId],
    ),
    "Le dossier de carte grise n’a pas pu être lu.",
  );

  const probleme =
    erreur ??
    erreurVersements ??
    (vente?.annulation != null ? "Cette vente est annulée : elle ne se modifie plus." : null);
  const pret = vente !== null && versements !== null && (lu !== null || erreurDossier !== null);

  if (probleme || !pret) {
    return (
      <Modale
        ouvert
        onFermer={onFermer}
        titre="Modifier la vente"
        taille="moyenne"
        pied={
          <button type="button" onClick={onFermer} className="ml-auto bouton bouton-neutre">
            Fermer
          </button>
        }
      >
        {probleme ? (
          <EtatErreur message={probleme} />
        ) : (
          <EtatChargement>Lecture de la vente…</EtatChargement>
        )}
      </Modale>
    );
  }

  return (
    <ModaleVente
      onFermer={onFermer}
      corrige={{ vente, versements, dossier: lu?.dossier ?? null }}
    />
  );
}
