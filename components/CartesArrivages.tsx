import type { BilanArrivages } from "@/lib/domain/arrivage";
import { Chiffre } from "@/components/patrons/Chiffre";
import { formaterNombre } from "@/lib/domain/format";

/**
 * Les cinq compteurs de tête de l'espace arrivages (S43).
 *
 * Tout est lu, rien n'est stocké (D61) : le bilan se recalcule des lots affichés
 * et de leur stock. « Vendues » se colore comme un solde, « CMC manquants »
 * comme une alerte — mais le mot reste, la couleur ne fait que le doubler.
 */
export function CartesArrivages({ bilan }: { bilan: BilanArrivages }) {
  const cartes: { nom: string; valeur: number; couleur: string }[] = [
    { nom: "Arrivages", valeur: bilan.arrivages, couleur: "var(--color-encre)" },
    { nom: "Motos reçues", valeur: bilan.motosRecues, couleur: "var(--color-encre)" },
    { nom: "En stock", valeur: bilan.enStock, couleur: "var(--color-encre)" },
    { nom: "Vendues", valeur: bilan.vendues, couleur: "var(--color-solde)" },
    {
      nom: "Quittances manquantes",
      valeur: bilan.quittancesManquantes,
      couleur: "var(--color-alerte)",
    },
    { nom: "CMC manquants", valeur: bilan.cmcManquants, couleur: "var(--color-alerte)" },
  ];
  return (
    <div className="mb-5 grid gap-3 sm:grid-cols-3 xl:grid-cols-6">
      {cartes.map((carte) => (
        <div key={carte.nom} className="cadre p-4">
          <p className="text-legende font-bold tracking-[0.07em] text-encre-doux uppercase">
            {carte.nom}
          </p>
          <p
            className="mt-1 font-code text-chiffre leading-tight tabular-nums"
            style={{ color: carte.couleur }}
          >
            <Chiffre valeur={formaterNombre(carte.valeur)} />
          </p>
        </div>
      ))}
    </div>
  );
}
