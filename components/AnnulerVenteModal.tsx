"use client";

import { Ban } from "lucide-react";
import { useCallback, useState } from "react";
import { Champ } from "@/components/patrons/Champ";
import { Modale } from "@/components/patrons/Modale";
import { useSession } from "@/lib/auth/session";
import {
  LONGUEUR_MOTIF_ANNULATION_MAX,
  remboursementsDAnnulation,
  validerMotifAnnulation,
} from "@/lib/domain/annulation-vente";
import type { DossierCarteGrise } from "@/lib/domain/dossier-carte-grise";
import { formaterMontant } from "@/lib/domain/format";
import { numeroLisible } from "@/lib/domain/numerotation";
import { LIBELLE_MOYEN, type Vente, type Versement } from "@/lib/domain/vente";
import { useAbonnement } from "@/lib/repositories/abonnement";
import { ecouterDossierDeVente } from "@/lib/repositories/dossiers-carte-grise";
import { annulerVente, messageErreurAnnulation } from "@/lib/repositories/ventes";

/**
 * Annuler une vente (S25).
 *
 * **La conséquence s'annonce avant le geste**, parce qu'il ne se défait pas :
 * la moto revient en stock, et l'argent ressort de la caisse, moyen par moyen.
 * C'est l'un des rares textes que la règle du 28 octobre garde à l'écran — un
 * avertissement avant une action qu'on ne peut pas annuler.
 *
 * **Le motif est obligatoire** (arbitrage du 31 octobre 2026) : c'est lui qui
 * rend une annulation lisible des mois plus tard, par le responsable qui la
 * relit.
 *
 * Le dossier de carte grise est lu avant de proposer le geste : s'il est déjà
 * parti chez un prestataire, il reste au classeur, marqué. S'il ne peut pas
 * être lu, l'annulation part sans lui — un dossier absent ferait échouer le
 * lot entier.
 */
export function AnnulerVenteModal({
  vente,
  versements,
  onFermer,
  onRefus,
}: {
  vente: Vente;
  versements: readonly Versement[];
  onFermer: () => void;
  /**
   * Un refus du serveur, qui arrive après la fermeture : la fiche le porte, et
   * la vente y redevient active d'elle-même quand le cache annule l'écriture.
   */
  onRefus: (message: string) => void;
}) {
  const session = useSession();
  const [motif, setMotif] = useState("");
  const [erreur, setErreur] = useState<string | null>(null);

  const { id: venteId, boutiqueId } = vente;
  const souscrireDossier = useCallback(
    (
      auChangement: (lu: { dossier: DossierCarteGrise | null }) => void,
      enErreur: (cause: unknown) => void,
    ) => ecouterDossierDeVente({ id: venteId, boutiqueId }, auChangement, enErreur),
    [venteId, boutiqueId],
  );
  const { valeur: lu, erreur: erreurDossier } = useAbonnement(
    souscrireDossier,
    "Le dossier de carte grise n’a pas pu être lu.",
  );
  const dossierConnu = lu !== null || erreurDossier !== null;

  const remboursements = remboursementsDAnnulation(vente, versements);
  const rendu = remboursements.reduce((somme, r) => somme + r.montant, 0);

  function annuler() {
    if (session.statut !== "connecte") return;
    const probleme = validerMotifAnnulation(motif);
    if (probleme) {
      setErreur(probleme);
      return;
    }
    /* Pas d'attente (D76) : hors ligne, la promesse ne se résout qu'au retour
       du réseau, et l'écran voit déjà la vente annulée dans son cache. Un refus
       tardif ne peut plus s'afficher ici, la fenêtre étant fermée : il remonte
       à la fiche. */
    annulerVente(
      { vente, versements, dossier: lu?.dossier ?? null },
      motif,
      { uid: session.utilisateur.uid, nom: session.utilisateur.nom },
    ).catch((cause) => onRefus(messageErreurAnnulation(cause)));
    onFermer();
  }

  return (
    <Modale
      ouvert
      onFermer={onFermer}
      titre={`Annuler la vente n° ${numeroLisible(vente.numero)}`}
      taille="moyenne"
      pied={
        <div className="flex flex-wrap justify-end gap-2">
          <button type="button" onClick={onFermer} className="bouton bouton-neutre">
            Garder la vente
          </button>
          <button
            type="button"
            onClick={annuler}
            disabled={!dossierConnu}
            className="bouton bouton-destructif"
          >
            <Ban aria-hidden="true" className="size-4" />
            {dossierConnu ? "Annuler la vente" : "Lecture du dossier…"}
          </button>
        </div>
      }
    >
      <ul className="space-y-1 text-corps text-encre">
        <li>La moto redevient « En stock ».</li>
        <li>
          {rendu > 0 ? (
            <>
              <strong className="font-semibold">{formaterMontant(rendu)}</strong> sortent de la
              caisse :{" "}
              {remboursements
                .map((r) => `${LIBELLE_MOYEN[r.moyenPaiement]} ${formaterMontant(r.montant)}`)
                .join(" · ")}
              .
            </>
          ) : (
            "Rien n’a été encaissé : la caisse ne bouge pas."
          )}
        </li>
        <li>Une annulation ne se défait pas.</li>
      </ul>

      <div className="mt-4">
        <Champ id="motif-annulation" libelle="Motif" erreur={erreur}>
          <input
            id="motif-annulation"
            value={motif}
            maxLength={LONGUEUR_MOTIF_ANNULATION_MAX}
            autoFocus
            placeholder="Erreur de saisie, client rétracté…"
            aria-invalid={erreur ? true : undefined}
            aria-describedby={erreur ? "motif-annulation-erreur" : undefined}
            onChange={(evenement) => {
              setMotif(evenement.target.value);
              setErreur(null);
            }}
            className="saisie"
          />
        </Champ>
      </div>
    </Modale>
  );
}
