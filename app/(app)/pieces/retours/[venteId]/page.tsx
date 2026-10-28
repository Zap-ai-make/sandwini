"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { Printer, ShoppingCart } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { GardeCapacite, GardeEspace } from "@/components/GardeSession";
import { RecuRetour } from "@/components/RecuRetour";
import { Champ } from "@/components/patrons/Champ";
import { EtatErreurSaisie, EtatVide, SansBoutique } from "@/components/patrons/Etats";
import { TetePage } from "@/components/patrons/Page";
import { useSession } from "@/lib/auth/session";
import { formaterMontant, formaterNombre } from "@/lib/domain/format";
import {
  LONGUEUR_MOTIF_MAX,
  changerLigneRetour,
  lignesReprises,
  retourDepuisVente,
  totalRembourse,
  validerRetour,
  type RetourPiece,
  type SaisieRetour,
} from "@/lib/domain/retour";
import { LIBELLE_MOYEN, MOYENS_PAIEMENT, type MoyenPaiement } from "@/lib/domain/vente";
import type { VentePiece } from "@/lib/domain/vente-piece";
import { usePerimetre } from "@/lib/perimetre/perimetre";
import { useAbonnement } from "@/lib/repositories/abonnement";
import { ecouterVentePiece, messageErreurVentePiece } from "@/lib/repositories/ventes-pieces";
import { enregistrerRetour } from "@/lib/repositories/retours-pieces";

export default function PageRetour() {
  return (
    <GardeEspace espace="pieces">
      <GardeCapacite capacite="gerer_pieces">
        <Retour />
      </GardeCapacite>
    </GardeEspace>
  );
}

/**
 * Reprendre une vente de pièces (S67).
 *
 * **La vente d'origine commande tout.** On la lit, on coche ce qui revient, et
 * on rembourse au prix où ça a été vendu. La vente n'est jamais touchée : le
 * retour est une contre-passation — un document, une entrée de stock, un
 * décaissement — qui la cite.
 *
 * **L'échange se fait en deux gestes.** Une fois le retour fait, l'écran propose
 * « Vendre maintenant » : la pièce rapportée est remboursée, la nouvelle se vend
 * normalement. Deux écritures honnêtes plutôt qu'un net masqué.
 */
function Retour() {
  const session = useSession();
  const { perimetre, boutiques } = usePerimetre();
  const parametres = useParams<{ venteId: string }>();
  const venteId = parametres.venteId;
  const boutiqueId = perimetre.boutiqueId;
  const surUneBoutique = perimetre.type === "boutique";

  const souscrire = useCallback(
    (auChangement: (etat: { vente: VentePiece | null }) => void, enErreur: (cause: unknown) => void) =>
      ecouterVentePiece(venteId, (vente) => auChangement({ vente }), enErreur),
    [venteId],
  );
  const { valeur: etat, erreur } = useAbonnement(souscrire, "Cette vente n’a pas pu être lue.");
  const vente = etat?.vente ?? null;

  const [saisie, setSaisie] = useState<SaisieRetour | null>(null);
  const [amorceePour, setAmorceePour] = useState<string | null>(null);
  const [messageErreur, setMessageErreur] = useState<string | null>(null);
  const [fait, setFait] = useState<RetourPiece | null>(null);

  /* La saisie s'amorce dès que la vente est lue, une fois par vente — ajusté
     pendant le rendu, le patron que React recommande (pas de `useEffect` qui
     relance un rendu). */
  if (vente && amorceePour !== vente.id && fait === null) {
    setSaisie(retourDepuisVente(vente));
    setAmorceePour(vente.id);
  }

  const total = useMemo(
    () => (vente && saisie ? totalRembourse(saisie, vente) : 0),
    [vente, saisie],
  );

  function enregistrer() {
    if (session.statut !== "connecte" || !surUneBoutique || !boutiqueId || !vente || !saisie) return;
    const probleme = validerRetour(saisie, vente);
    if (probleme) {
      setMessageErreur(probleme);
      return;
    }
    setMessageErreur(null);
    const auteur = { uid: session.utilisateur.uid, nom: session.utilisateur.nom };
    const { id, enregistre } = enregistrerRetour(saisie, vente, boutiqueId, auteur);
    enregistre.catch((cause) => setMessageErreur(messageErreurVentePiece(cause)));
    /* Le reçu se compose tout de suite, en mémoire : le numéro et l'identifiant
       existent dès la saisie, même hors ligne (D76). */
    setFait({
      id,
      venteId: vente.id,
      venteNumero: vente.numero,
      boutiqueId,
      date: new Date(),
      lignes: lignesReprises(saisie, vente),
      total: totalRembourse(saisie, vente),
      moyenPaiement: saisie.moyenPaiement,
      motif: saisie.motif.trim(),
      operateur: session.utilisateur.nom,
    });
  }

  if (!surUneBoutique) {
    return (
      <SansBoutique
        titre="Reprendre une vente"
        sansBoutiqueDeclaree="Un retour se fait dans la boutique où la vente a eu lieu. Choisissez-la dans le bandeau, en haut de l’écran."
      />
    );
  }

  const boutique = boutiques.find((b) => b.id === boutiqueId) ?? null;

  /* Le reçu de retour, une fois le retour fait. L'écran bascule entièrement
     dessus : la saisie n'a plus lieu d'être. */
  if (fait) {
    return (
      <div>
        <div className="print:hidden">
          <TetePage
            retour={{ href: `/pieces/ventes?vente=${fait.venteId}`, libelle: "Reçu de la vente" }}
            titre="Retour enregistré"
          />
          <div className="mt-4 flex flex-wrap gap-2">
            <button type="button" onClick={() => window.print()} className="bouton bouton-principal">
              <Printer aria-hidden="true" className="size-4" />
              Imprimer le reçu de retour
            </button>
            {/* L'échange : la pièce est reprise, on vend la remplaçante. */}
            <Link href="/pieces/vendre" className="bouton bouton-neutre">
              <ShoppingCart aria-hidden="true" className="size-4" />
              Vendre maintenant
            </Link>
          </div>
          <p className="mt-2 max-w-prose text-sm text-encre-doux">
            Pour un PDF, choisissez « Enregistrer au format PDF » dans la boîte d’impression.
          </p>
        </div>
        <div className="a-imprimer mt-4 print:mt-0">
          <RecuRetour retour={fait} boutique={boutique} />
        </div>
      </div>
    );
  }

  if (erreur && etat === null) {
    return (
      <div>
        <TetePage titre="Reprendre une vente" />
        <EtatVide titre={`Cette vente n’a pas pu être lue : ${erreur}`} />
      </div>
    );
  }

  if (etat !== null && !vente) {
    return (
      <div>
        <TetePage retour={{ href: "/pieces/ventes", libelle: "Ventes" }} titre="Vente introuvable" />
        <EtatVide titre="Cette vente n’existe pas ici" />
      </div>
    );
  }

  const chargement = etat === null || !vente || !saisie;

  return (
    <div>
      <TetePage
        retour={{ href: vente ? `/pieces/ventes?vente=${vente.id}` : "/pieces/ventes", libelle: "Reçu de la vente" }}
        titre="Reprendre une vente"
      />

      {chargement ? (
        <p className="mt-6 text-sm text-encre-doux">Lecture de la vente…</p>
      ) : (
        <div className="mt-6 max-w-[46rem]">
          <fieldset className="cadre p-4">
            <legend className="px-1 font-semibold text-encre">Ce qui revient</legend>
            <ul className="mt-2 space-y-3">
              {vente.lignes.map((ligne) => {
                const selection = saisie.lignes.find((l) => l.pieceId === ligne.pieceId);
                return (
                  <li key={ligne.pieceId} className="cadre p-3">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <span className="font-medium text-encre">
                        <span className="plaque-code">{ligne.reference}</span> {ligne.designation}
                      </span>
                      <span className="text-sm text-encre-doux">
                        {formaterNombre(ligne.quantite)} vendu{ligne.quantite > 1 ? "s" : ""} à{" "}
                        {formaterMontant(ligne.prixUnitaire)}
                      </span>
                    </div>
                    <div className="mt-3 sm:max-w-[12rem]">
                      <Champ id={`retour-q-${ligne.pieceId}`} libelle="Quantité reprise">
                        <input
                          id={`retour-q-${ligne.pieceId}`}
                          inputMode="numeric"
                          value={selection?.quantite ?? "0"}
                          onChange={(evenement) =>
                            setSaisie((actuel) =>
                              actuel ? changerLigneRetour(actuel, ligne.pieceId, evenement.target.value) : actuel,
                            )
                          }
                          className="saisie"
                        />
                      </Champ>
                    </div>
                  </li>
                );
              })}
            </ul>
          </fieldset>

          <fieldset className="mt-6 cadre p-4">
            <legend className="px-1 font-semibold text-encre">Le remboursement</legend>
            <div className="mt-2 grid gap-4 sm:grid-cols-2">
              <Champ id="retour-moyen" libelle="Rembourser par">
                <select
                  id="retour-moyen"
                  value={saisie.moyenPaiement}
                  onChange={(evenement) =>
                    setSaisie((actuel) =>
                      actuel ? { ...actuel, moyenPaiement: evenement.target.value as MoyenPaiement } : actuel,
                    )
                  }
                  className="saisie"
                >
                  {MOYENS_PAIEMENT.map((moyen) => (
                    <option key={moyen} value={moyen}>
                      {LIBELLE_MOYEN[moyen]}
                    </option>
                  ))}
                </select>
              </Champ>
              <Champ id="retour-motif" libelle="Motif" facultatif>
                <input
                  id="retour-motif"
                  maxLength={LONGUEUR_MOTIF_MAX}
                  placeholder="Défaut, erreur de référence…"
                  value={saisie.motif}
                  onChange={(evenement) =>
                    setSaisie((actuel) => (actuel ? { ...actuel, motif: evenement.target.value } : actuel))
                  }
                  className="saisie"
                />
              </Champ>
            </div>
            <p className="mt-5 flex items-baseline justify-between gap-4 border-t border-bord pt-3">
              <span className="font-medium text-encre">Total à rembourser</span>
              <span className="text-ecran font-bold tracking-tight text-encre">
                {formaterMontant(total)}
              </span>
            </p>
          </fieldset>

          <EtatErreurSaisie message={messageErreur} className="mt-3" />
          <button
            type="button"
            onClick={enregistrer}
            disabled={total === 0}
            className="mt-3 bouton bouton-principal"
          >
            Enregistrer le retour
          </button>
        </div>
      )}
    </div>
  );
}
