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
            {/* `relative` n'est pas un réglage de mise en page : c'est ce qui
                garde les éléments absolus **dans** la zone qui défile.

                Sans lui, aucun ancêtre jusqu'à `<html>` n'est positionné, et un
                descendant en `position: absolute` prend le document pour bloc
                conteneur. Son débordement est alors compté par la fenêtre, qui
                se met à défiler par-dessus `main` : deux ascenseurs à l'écran,
                celui de la zone de travail et celui de la page.

                Le coupable mesuré est le `<caption class="sr-only">` que pose
                chaque `Tableau` — `sr-only` veut dire `position: absolute`, et
                le dépôt a déjà payé ce piège une fois (D102). Il figeait
                `html.scrollHeight` à 944 px quelle que soit la hauteur de la
                fenêtre. Posé ici plutôt que sur le `caption`, parce que la
                règle juste est générale : une zone de défilement doit être le
                bloc conteneur de ce qu'elle contient. */}
            <main className="relative flex-1 overflow-y-auto px-5 pt-6 pb-16">
              {/* `h-full` pour que les écrans de liste puissent se dire « je
                  remplis la fenêtre » (`.ecran-plein`). Sans hauteur à
                  traverser, leur `height: 100%` ne résoudrait sur rien. Pour un
                  écran plus court que la fenêtre, cela ne change rien : la
                  boîte est pleine hauteur, son contenu reste en haut. */}
              <div className="max-w-travail h-full">{children}</div>
            </main>
          </div>
        </div>
      </FournisseurPerimetre>
    </GardeSession>
  );
}
