"use client";

import { ArrowLeft, Check, Printer, RotateCcw, Share2 } from "lucide-react";
import Link from "next/link";
import { useCallback, useState } from "react";
import { RecuPiece } from "@/components/RecuPiece";
import { EtatErreur } from "@/components/patrons/Etats";
import { useSession } from "@/lib/auth/session";
import { nomDuClient } from "@/lib/domain/client";
import { IDENTITE } from "@/lib/domain/entreprise";
import { formaterMontant } from "@/lib/domain/format";
import type { RetourPiece } from "@/lib/domain/retour";
import { peut } from "@/lib/domain/roles";
import { textePartageVentePiece, type VentePiece } from "@/lib/domain/vente-piece";
import { usePerimetre } from "@/lib/perimetre/perimetre";
import { useAbonnement } from "@/lib/repositories/abonnement";
import { useFichierClients } from "@/lib/repositories/fichier-clients";
import { ecouterRetoursDeVente } from "@/lib/repositories/retours-pieces";

/**
 * Le reçu d'une vente de pièces, dans un panneau (S64).
 *
 * **La vente lui est donnée, pas relue.** L'écran des ventes la tient déjà en
 * mémoire — toute la collection du périmètre y est chargée pour la recherche
 * hors ligne. Ouvrir une seconde écoute sur un document unique dupliquerait ce
 * qu'on a déjà et ferait clignoter « Chargement… » sur une vente présente.
 *
 * L'impression reprend le mécanisme du reçu des motos : le marqueur
 * `a-imprimer` isole le document, et `window.print()` produit aussi le PDF via
 * la boîte d'impression du navigateur — sans réseau, sans bibliothèque (D60).
 */
export function PanneauVentePiece({
  vente,
  base = "/pieces/ventes",
}: {
  vente: VentePiece;
  base?: string;
}) {
  const session = useSession();
  const { boutiques } = usePerimetre();
  const { clients } = useFichierClients();

  const boutique = boutiques.find((b) => b.id === vente.boutiqueId) ?? null;
  /* Vente récente : `clientId` porte le nom tapé au comptoir (pas de fiche).
     Vente ancienne : un identifiant qu'on résout en fiche. « Fiche connue → son
     nom, sinon la chaîne EST le nom » couvre les deux sans migration. */
  const client = clients.find((fiche) => fiche.id === vente.clientId) ?? null;
  const nom = client ? nomDuClient(client) : vente.clientId;

  /* Les retours déjà faits sur cette vente : la vente n'est pas modifiée, elle
     les montre (S67). */
  const souscrireRetours = useCallback(
    (auChangement: (retours: RetourPiece[]) => void, enErreur: (cause: unknown) => void) =>
      ecouterRetoursDeVente(vente.id, auChangement, enErreur),
    [vente.id],
  );
  const { valeur: retours } = useAbonnement(souscrireRetours, "Les retours n’ont pas pu être lus.");
  const totalRepris = (retours ?? []).reduce((somme, retour) => somme + retour.total, 0);

  const peutReprendre =
    session.statut === "connecte" && peut(session.utilisateur.role, "gerer_pieces");

  return (
    <div>
      <div className="print:hidden">
        <Link
          href={base}
          className="inline-flex items-center gap-2 text-sm text-encre-doux hover:text-encre"
        >
          <ArrowLeft aria-hidden="true" className="size-4" />
          Ventes
        </Link>
      </div>

      {(peutReprendre || totalRepris > 0) && (
        <div className="mt-3 print:hidden">
          {peutReprendre && (
            <Link href={`/pieces/retours/${vente.id}`} className="bouton bouton-neutre">
              <RotateCcw aria-hidden="true" className="size-4" />
              Retour / échange
            </Link>
          )}
          {totalRepris > 0 && (
            <p className="mt-2 text-sm text-encre-doux">
              Déjà repris sur cette vente : {formaterMontant(totalRepris)} remboursé
              {totalRepris > 1 ? "s" : ""}.
            </p>
          )}
        </div>
      )}

      <Actions
        texte={textePartageVentePiece(vente, nom, IDENTITE.raisonSociale)}
        titre={`Reçu de vente ${vente.numero}`}
      />

      {/* `a-imprimer` : ce qui sort de l'imprimante, et rien d'autre (la règle
          vit dans globals.css ; sans ce marqueur, la liste des ventes voisine
          sortirait avec le reçu). */}
      <div className="a-imprimer mt-4 print:mt-0">
        <RecuPiece
          vente={vente}
          boutique={boutique}
          client={client}
          nomLibre={client ? "" : vente.clientId}
        />
      </div>
    </div>
  );
}

/**
 * Imprimer et partager, comme pour le reçu des motos : `window.print()` d'un
 * côté (qui sert aussi le PDF), Web Share ou presse-papiers de l'autre — les
 * deux natifs, donc disponibles hors ligne. Un partage annulé n'est pas une
 * erreur.
 */
function Actions({ texte, titre }: { texte: string; titre: string }) {
  const [message, setMessage] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  async function partager() {
    setErreur(null);
    setMessage(null);
    try {
      if (typeof navigator !== "undefined" && navigator.share) {
        await navigator.share({ title: titre, text: texte });
        setMessage("Récapitulatif partagé.");
        return;
      }
      await navigator.clipboard.writeText(texte);
      setMessage("Récapitulatif copié : collez-le dans WhatsApp ou un SMS.");
    } catch (cause) {
      if ((cause as { name?: string }).name === "AbortError") return;
      setErreur("Le partage n’a pas abouti. Le reçu, lui, reste imprimable.");
    }
  }

  return (
    <div className="mt-3 print:hidden">
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => window.print()} className="bouton bouton-principal">
          <Printer aria-hidden="true" className="size-4" />
          Imprimer le reçu
        </button>
        <button type="button" onClick={partager} className="bouton bouton-neutre">
          <Share2 aria-hidden="true" className="size-4" />
          Partager le récapitulatif
        </button>
      </div>


      {message && (
        <p role="status" className="mt-2 flex items-center gap-2 text-sm text-encre">
          <Check aria-hidden="true" className="size-4 shrink-0" />
          {message}
        </p>
      )}
      <EtatErreur message={erreur} className="mt-2" />
    </div>
  );
}
