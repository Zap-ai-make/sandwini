"use client";

import Link from "next/link";
import { useCallback, useMemo } from "react";
import { EtatChargement } from "@/components/patrons/Etats";
import { TitreSection } from "@/components/patrons/Page";
import { stockParPiece, type MouvementPiece, type Piece } from "@/lib/domain/piece";
import { piecesEnAlerte } from "@/lib/domain/vente-piece";
import { usePerimetre } from "@/lib/perimetre/perimetre";
import { useAbonnement } from "@/lib/repositories/abonnement";
import { ecouterCatalogue, ecouterMouvements } from "@/lib/repositories/pieces";

/**
 * Les pièces à réapprovisionner, pour le responsable (S21, `prompt.md` §14).
 *
 * **Pourquoi une carte ici plutôt qu'un écran « Alertes ».** Les filtres
 * « Stock bas » et « Épuisé » de `/pieces` répondent déjà à cette question, et
 * un second endroit qui y répondrait autrement finirait par diverger (D73). Ce
 * qui manquait n'était pas un écran, c'était un **lecteur** : le responsable ne
 * passe pas sa journée dans le catalogue, et une rupture ne lui parvient
 * aujourd'hui que par un coup de téléphone d'un gérant.
 *
 * **Elle compte ce qu'elle montre, et rien de plus.** Aucun agrégat entretenu :
 * la quantité est la somme des mouvements, lue en direct (D61, D94). Le prix de
 * ce choix est connu et écrit dans `SEUIL_MOUVEMENTS`.
 *
 * **Elle ne s'affiche pas quand il n'y a rien.** Une carte « 0 pièce en
 * alerte » occupe la place d'une information et n'en porte aucune ; l'absence
 * d'alerte se dit en ne disant rien. C'est le même raisonnement que D63 sur les
 * compteurs à zéro.
 */
const MAX_LIGNES = 6;

export function PiecesEnAlerte({ className }: { className?: string }) {
  const { perimetre } = usePerimetre();
  const boutiqueId = perimetre.boutiqueId;
  const surUneBoutique = perimetre.type === "boutique";

  const souscrireCatalogue = useCallback(
    (auChangement: (pieces: Piece[]) => void, enErreur: (cause: unknown) => void) =>
      ecouterCatalogue(auChangement, enErreur),
    [],
  );
  const souscrireMouvements = useCallback(
    (auChangement: (m: MouvementPiece[]) => void, enErreur: (cause: unknown) => void) =>
      ecouterMouvements(boutiqueId, auChangement, enErreur),
    [boutiqueId],
  );

  const catalogue = useAbonnement(souscrireCatalogue, "Le catalogue n’a pas pu être lu.");
  const journal = useAbonnement(souscrireMouvements, "Le stock n’a pas pu être lu.");

  const pieces = catalogue.valeur;
  const mouvements = journal.valeur;

  const alertes = useMemo(() => {
    if (pieces === null || mouvements === null) return null;
    return piecesEnAlerte(pieces, stockParPiece(mouvements));
  }, [pieces, mouvements]);

  /* Une erreur de lecture ne se raconte pas ici : cette carte est un
     complément, et l'écran qui la porte a déjà ses propres blocs d'erreur. On
     s'efface plutôt que d'ajouter un second message rouge à côté du premier. */
  if (catalogue.erreur || journal.erreur) return null;

  if (alertes === null) {
    return (
      <section className={className} aria-labelledby="titre-alertes-pieces">
        <TitreSection id="titre-alertes-pieces">Pièces à réapprovisionner</TitreSection>
        <EtatChargement className="mt-3">Lecture du stock…</EtatChargement>
      </section>
    );
  }

  if (alertes.length === 0) return null;

  const montrees = alertes.slice(0, MAX_LIGNES);
  const reste = alertes.length - montrees.length;

  return (
    <section className={className} aria-labelledby="titre-alertes-pieces">
      <TitreSection id="titre-alertes-pieces">Pièces à réapprovisionner</TitreSection>
      <p className="mt-1 text-corps text-encre-doux">
        {surUneBoutique
          ? `Sur l’étagère de ${perimetre.nom}.`
          : "Toutes boutiques réunies : une pièce peut manquer ici et non ailleurs."}
      </p>

      <ul className="mt-3 cadre cadre-liste">
        {montrees.map(({ piece, quantite, epuisee }) => (
          <li key={piece.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3">
            <span className="min-w-0 flex-1">
              <span className="block font-medium text-encre">
                <span className="plaque-code">{piece.reference}</span> {piece.designation}
              </span>
              <span className="block text-corps text-encre-doux">
                {epuisee
                  ? "Plus rien en stock"
                  : `${quantite} en stock · alerte à ${piece.seuilAlerte}`}
              </span>
            </span>
            {/* L'état ne passe jamais par la seule couleur (`DESIGN.md` §5). */}
            <span className={`pastille shrink-0 ${epuisee ? "pastille-retard" : "pastille-transit"}`}>
              {epuisee ? "Épuisé" : "Stock bas"}
            </span>
          </li>
        ))}
      </ul>

      <div className="mt-3 flex flex-wrap items-baseline gap-3">
        <Link href="/pieces?stock=bas" className="bouton bouton-neutre">
          Voir le catalogue
        </Link>
        {reste > 0 && (
          <p className="text-corps text-encre-doux">
            {reste === 1 ? "1 autre référence" : `${reste} autres références`} dans le même cas.
          </p>
        )}
      </div>
    </section>
  );
}
