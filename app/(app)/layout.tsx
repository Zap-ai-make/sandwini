import type { ReactNode } from "react";
import { BandeauEtat } from "@/components/BandeauEtat";
import { NavigationPrincipale } from "@/components/NavigationPrincipale";

/**
 * La coquille de l’espace de travail — « le comptoir » (DESIGN.md §2).
 *
 * Le contexte d’écriture ne quitte jamais l’écran : le bandeau en haut, la
 * navigation sous le pouce. Entre les deux, une colonne de contenu mesurée.
 *
 * La protection par authentification arrive en S2 ; c’est bien ce groupe de
 * routes `(app)` qu’elle fermera.
 */
export default function DispositionApplication({ children }: { children: ReactNode }) {
  return (
    /* La navigation vient après le contenu dans le DOM : sur téléphone elle
       s’affiche en bas, et l’ordre de tabulation suit alors l’ordre visuel
       (DESIGN.md §11). Sur grand écran, `sm:order-first` la ramène à gauche.
       Les lecteurs d’écran la trouvent de toute façon par son repère de
       navigation, où qu’elle soit dans le document. */
    <div className="flex min-h-dvh flex-col sm:flex-row">
      <div className="flex min-w-0 flex-1 flex-col sm:order-last">
        <BandeauEtat />
        <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6">{children}</main>
      </div>
      <NavigationPrincipale />
    </div>
  );
}
