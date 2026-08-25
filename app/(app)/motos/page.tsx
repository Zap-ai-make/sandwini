import { EspaceAVenir } from "@/components/EspaceAVenir";

export const metadata = { title: "Motos — SDI" };

export default function EspaceMotos() {
  return (
    <EspaceAVenir
      titre="Espace motos"
      spec="S5 · S8 · S9 · S10 · S11"
      contenu={[
        "Le stock : entrée d’une moto, recherche par châssis, filtres par marque et état.",
        "La vente : un écran, moins d’une minute, comptant, crédit ou tranches.",
        "Les paiements : versements, dettes en cours, tranches non livrées.",
        "Les dossiers : quittance, CMC, carte grise, plaque, et qui les détient.",
      ]}
    />
  );
}
