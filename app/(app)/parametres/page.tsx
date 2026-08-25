import { EspaceAVenir } from "@/components/EspaceAVenir";

export const metadata = { title: "Réglages — SDI" };

export default function EspaceParametres() {
  return (
    <EspaceAVenir
      titre="Réglages"
      spec="S2 · S3 · S4"
      contenu={[
        "L’entreprise : nom, logo, adresses, téléphones, mentions légales.",
        "Les boutiques et leur code à trois lettres.",
        "Les utilisateurs : créer un gérant, lui attribuer une boutique.",
        "Les référentiels : marques, modèles, provenances, frais, prestataires.",
      ]}
    />
  );
}
