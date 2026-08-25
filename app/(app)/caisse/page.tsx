import { EspaceAVenir } from "@/components/EspaceAVenir";

export const metadata = { title: "Caisse — SDI" };

export default function EspaceCaisse() {
  return (
    <EspaceAVenir
      titre="Caisse"
      spec="S22"
      contenu={[
        "Le journal du jour : entrées et sorties, par moyen de paiement.",
        "La clôture : total attendu face au comptage physique.",
        "L’historique par jour.",
      ]}
    />
  );
}
