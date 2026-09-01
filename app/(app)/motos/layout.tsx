import type { ReactNode } from "react";
import { GardeEspace } from "@/components/GardeSession";

export const metadata = { title: "Motos — SDI" };

/**
 * La garde du métier est posée ici plutôt que sur chacun des six écrans motos :
 * un seul endroit à tenir, et les écrans de S11 en héritent sans qu’on y pense.
 */
export default function DispositionMotos({ children }: { children: ReactNode }) {
  return <GardeEspace espace="motos">{children}</GardeEspace>;
}
