import { formaterTelephone } from "@/lib/domain/client";
import { IDENTITE_PIECES } from "@/lib/domain/entreprise";

/**
 * L'en-tête des reçus de pièces — vente et retour (28 octobre 2026).
 *
 * Ni logo ni mention de Sandwidi : la boutique de pièces vend sous le nom de
 * Fatas, et le commanditaire a dicté la mention à imprimer. Sans logo à sa
 * gauche, l'identité se lit à gauche, comme un papier à en-tête.
 */
export function EntetePieces() {
  return (
    <header className="facture-entete">
      <div className="facture-identite text-left">
        <p className="facture-raison">{IDENTITE_PIECES.enseigne}</p>
        <p className="facture-enseigne">
          {IDENTITE_PIECES.activite} à {IDENTITE_PIECES.villes}
        </p>
        <p>Tél : {IDENTITE_PIECES.telephones.map((numero) => formaterTelephone(numero)).join(" / ")}</p>
      </div>
    </header>
  );
}
