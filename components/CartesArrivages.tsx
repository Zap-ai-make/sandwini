import type { BilanArrivages } from "@/lib/domain/arrivage";
import { CarteChiffre } from "@/components/patrons/CarteChiffre";

/**
 * Les cinq compteurs de tête de l'espace arrivages (S43).
 *
 * Tout est lu, rien n'est stocké (D61) : le bilan se recalcule des lots affichés
 * et de leur stock. « Vendues » se colore comme un solde, « CMC manquants »
 * comme une alerte — mais le mot reste, la couleur ne fait que le doubler.
 *
 * **Les quittances n'y figurent plus** (27 octobre 2026, demande du
 * commanditaire) : elles se suivent sur la fiche de la moto, et non sur le lot.
 * Le bilan continue de les compter — rien n'est perdu — mais l'écran des
 * arrivages ne pose plus la question.
 */
export function CartesArrivages({ bilan }: { bilan: BilanArrivages }) {
  const cartes: { nom: string; valeur: number; couleur: string }[] = [
    { nom: "Arrivages", valeur: bilan.arrivages, couleur: "var(--color-encre)" },
    { nom: "Motos reçues", valeur: bilan.motosRecues, couleur: "var(--color-encre)" },
    { nom: "En stock", valeur: bilan.enStock, couleur: "var(--color-encre)" },
    { nom: "Vendues", valeur: bilan.vendues, couleur: "var(--color-solde)" },
    { nom: "CMC manquants", valeur: bilan.cmcManquants, couleur: "var(--color-alerte)" },
  ];
  return (
    <div className="mb-5 grid gap-3 sm:grid-cols-3 xl:grid-cols-5">
      {cartes.map((carte) => (
        <div key={carte.nom} className="cadre p-4">
          <CarteChiffre nom={carte.nom} valeur={carte.valeur} couleur={carte.couleur} />
        </div>
      ))}
    </div>
  );
}
