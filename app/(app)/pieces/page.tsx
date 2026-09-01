import { EspaceAVenir } from "@/components/EspaceAVenir";
import { GardeEspace } from "@/components/GardeSession";

export const metadata = { title: "Pièces — SDI" };

export default function EspacePieces() {
  return (
    <GardeEspace espace="pieces">
      <EspaceAVenir
        titre="Espace pièces détachées"
        spec="S20 · S21"
        contenu={[
          "Le catalogue : référence, désignation, catégorie, prix, seuil d’alerte.",
          "Le stock de la boutique, tenu par mouvements plutôt que par correction directe.",
          "La vente au comptoir : panier, moyen de paiement, reçu.",
          "Les alertes de rupture.",
        ]}
      />
    </GardeEspace>
  );
}
