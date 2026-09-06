import type { ReactNode } from "react";
import { BandeauEtat } from "@/components/BandeauEtat";
import { GardeSession } from "@/components/GardeSession";
import { NavigationPrincipale } from "@/components/NavigationPrincipale";
import { FournisseurPerimetre } from "@/lib/perimetre/perimetre";

/**
 * La coquille de l’espace de travail — « le comptoir » (DESIGN.md §2).
 *
 * Trois colonnes qui tiennent la gauche en permanence : le rail des espaces, la
 * colonne des écrans de l’espace courant, et la zone de travail qui prend tout
 * le reste. Le contexte d’écriture ne quitte jamais l’écran — le bandeau en
 * tête de la zone de travail, la navigation à côté.
 *
 * **Le `max-w-3xl` a disparu.** Il bornait tout le contenu à 768 px quel que
 * soit l’écran : sur un 1920, deux tiers de la surface ne servaient à rien
 * pendant que les listes se comprimaient. La zone de travail occupe désormais
 * la largeur disponible, bornée à 1600 px pour ne pas étirer les lignes de
 * texte — et les blocs de prose gardent leur `max-w-prose`, qui est une limite
 * de lisibilité et non de mise en page.
 *
 * La navigation vient en premier dans le DOM, où les lecteurs d’écran la
 * cherchent. Sur téléphone elle s’affiche pourtant en bas, dans la zone du
 * pouce : c’est la grille qui place, pas l’ordre du document (cf. `.appli` dans
 * `app/globals.css`).
 */
export default function DispositionApplication({ children }: { children: ReactNode }) {
  return (
    <GardeSession>
      <FournisseurPerimetre>
        <div className="appli">
          <NavigationPrincipale />
          <div className="travail">
            <BandeauEtat />
            <main className="flex-1 overflow-y-auto px-5 pt-6 pb-16">
              <div className="max-w-travail">{children}</div>
            </main>
          </div>
        </div>
      </FournisseurPerimetre>
    </GardeSession>
  );
}
