import { Champ } from "@/components/patrons/Champ";
import type { LigneReception } from "@/lib/domain/reception";

/**
 * Les deux champs d'une ligne d'arrivage (S66) : la quantité reçue, et le prix
 * d'achat du lot.
 *
 * **Le prix d'achat est pré-rempli du catalogue et facultatif.** Un carton
 * arrive souvent au même prix, et le re-saisir invite à l'erreur ; le laisser
 * vide ne touche pas au coût. S'il change, il met à jour le prix d'achat de la
 * référence — le coût vit sur la pièce (`3c8b2fe`), et c'est celui qui vend qui
 * le fixe.
 */
export function ChampsReception({
  ligne,
  changer,
}: {
  ligne: LigneReception;
  changer: (partie: Partial<Omit<LigneReception, "pieceId">>) => void;
}) {
  return (
    <div className="mt-3 grid gap-3 sm:grid-cols-2">
      <Champ id={`q-recue-${ligne.pieceId}`} libelle="Quantité reçue">
        <input
          id={`q-recue-${ligne.pieceId}`}
          inputMode="numeric"
          value={ligne.quantite}
          onChange={(evenement) => changer({ quantite: evenement.target.value })}
          className="saisie"
        />
      </Champ>
      <Champ
        id={`pa-recue-${ligne.pieceId}`}
        libelle="Prix d’achat"
        facultatif
        aide="Modifié, il met à jour le coût au catalogue."
      >
        <input
          id={`pa-recue-${ligne.pieceId}`}
          inputMode="numeric"
          value={ligne.prixAchat}
          aria-describedby={`pa-recue-${ligne.pieceId}-aide`}
          onChange={(evenement) => changer({ prixAchat: evenement.target.value })}
          className="saisie"
        />
      </Champ>
    </div>
  );
}
