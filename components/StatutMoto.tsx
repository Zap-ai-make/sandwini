import { LIBELLE_STATUT, type StatutMoto } from "@/lib/domain/moto";

/* Trois statuts sur quatre se lisent d'un mot ; la couleur ne fait que doubler
   le mot (DESIGN.md §5). « Réservée » prend le bleu de la goutte : la moto est
   promise et n'est pas encore partie (D70). Vendue et transférée sont des faits
   accomplis, sans rien à décider : elles restent neutres.

   Sortie de `app/(app)/motos/page.tsx` en S50, quand l'historique d'un
   fournisseur a eu besoin de la même pastille : recopier la table des tons
   aurait suffi à les faire diverger au premier changement. */
const TON_STATUT: Record<StatutMoto, string> = {
  en_stock: "pastille-solde",
  reservee: "pastille-transit",
  vendue: "",
  transferee: "",
};

export function Statut({ statut }: { statut: StatutMoto }) {
  return <span className={`pastille ${TON_STATUT[statut]}`}>{LIBELLE_STATUT[statut]}</span>;
}
