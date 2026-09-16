import { formaterMontant, formaterNombre } from "@/lib/domain/format";
import type { BilanVentes } from "@/lib/domain/vente";

/**
 * Les quatre chiffres de tête du registre des ventes (S44).
 *
 * **Tout est lu, rien n'est stocké** (D61) : le bilan se recalcule des ventes
 * déjà affichées. Aucune écoute de plus, donc l'écran garde ses chiffres réseau
 * coupé — et aucun agrégat écrit, donc rien qui puisse finir par contredire ce
 * dont il est tiré.
 *
 * **Aucune marge ici, et c'est une frontière.** Les trois montants se lisent
 * sur le document de vente, que le gérant a le droit de lire ; le coût et la
 * marge vivent dans `prive/marge`, hors de sa portée (D2). Une cinquième carte
 * les ferait entrer par la fenêtre.
 *
 * Un périmètre sans vente n'affiche rien du tout : quatre zéros alignés
 * ressemblent à une information, et n'en sont pas une (D63).
 */
export function CartesVentes({ bilan }: { bilan: BilanVentes }) {
  if (bilan.ventes === 0) return null;

  const cartes = [
    { nom: "Ventes", valeur: formaterNombre(bilan.ventes), couleur: "var(--color-encre)" },
    {
      nom: "Chiffre d’affaires",
      valeur: formaterMontant(bilan.chiffreAffaires),
      couleur: "var(--color-encre)",
    },
    { nom: "Encaissé", valeur: formaterMontant(bilan.encaisse), couleur: "var(--color-solde)" },
    {
      nom: "Reste à percevoir",
      valeur: formaterMontant(bilan.resteAPercevoir),
      /* La couleur double le mot, elle ne le remplace pas : « reste à
         percevoir » est déjà écrit au-dessus du chiffre (`DESIGN.md` §5). Et
         un reste nul n'est pas une alerte — c'est un registre soldé. */
      couleur: bilan.resteAPercevoir > 0 ? "var(--color-alerte)" : "var(--color-encre)",
    },
  ];

  return (
    <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {cartes.map((carte) => (
        <div key={carte.nom} className="cadre p-4">
          <p className="text-legende font-bold tracking-[0.07em] text-encre-doux uppercase">
            {carte.nom}
          </p>
          {/* Les montants sont plus longs qu'un compteur : ils descendent d'un
              cran pour ne pas se casser en deux dans une carte de quart de
              largeur. Les chiffres restent tabulaires — ces quatre cartes se
              comparent entre elles et d'un jour à l'autre. */}
          <p
            className="mt-1 font-code text-bloc leading-tight tabular-nums"
            style={{ color: carte.couleur }}
          >
            {carte.valeur}
          </p>
        </div>
      ))}
    </div>
  );
}
