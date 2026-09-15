import type { Ecoulement } from "@/lib/domain/arrivage";
import { formaterNombre } from "@/lib/domain/format";

/**
 * La barre d'écoulement d'un lot : la part vendue, et ce qui reste (S43).
 *
 * La couleur ne travaille jamais seule : le compte est écrit sous la barre
 * (DESIGN §5). Un lot sans moto le dit en toutes lettres plutôt qu'une barre
 * vide qui laisserait croire « rien vendu ».
 */
export function BarreEcoulement({ compte }: { compte: Ecoulement }) {
  if (compte.total === 0) return <span className="text-encre-doux">Lot vide</span>;
  const part = Math.round((compte.vendues / compte.total) * 100);
  return (
    <div className="min-w-36">
      <div className="h-2 overflow-hidden rounded-full bg-fond">
        <div
          className="h-full rounded-full"
          style={{ width: `${part}%`, background: "var(--color-solde)" }}
        />
      </div>
      <p className="mt-1 text-legende text-encre-doux">
        <span className="font-semibold text-encre">{formaterNombre(compte.restant)}</span> en stock
        {" · "}
        <span className="font-semibold text-encre">{formaterNombre(compte.vendues)}</span> vendues
      </p>
    </div>
  );
}
