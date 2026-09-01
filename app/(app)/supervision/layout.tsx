import type { ReactNode } from "react";
import { GardeCapacite } from "@/components/GardeSession";

export const metadata = { title: "Supervision — SDI" };

/**
 * La supervision est une section, pas un onglet de plus (`DECISIONS.md` D63).
 *
 * La garde est posée sur la disposition plutôt que sur chaque page : les écrans
 * de pilotage que S24 ajoutera ici seront couverts sans qu’on ait à y penser.
 */
export default function DispositionSupervision({ children }: { children: ReactNode }) {
  return <GardeCapacite capacite="acceder_supervision">{children}</GardeCapacite>;
}
