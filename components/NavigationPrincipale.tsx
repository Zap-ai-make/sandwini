"use client";

import { Bike, Building2, Coins, LayoutGrid, Settings, Wrench } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ComponentType } from "react";
import { useSession } from "@/lib/auth/session";
import { ESPACES, espacesVisibles, type Espace } from "@/lib/domain/espaces";
import { usePerimetre } from "@/lib/perimetre/perimetre";

/* L’icône de chaque espace. Le reste — route et intitulé — vit dans
   `lib/domain/espaces.ts`, avec la règle qui décide qui voit quoi ; ici on ne
   garde que ce qui relève du rendu. */
const ICONE: Record<Espace, ComponentType<{ className?: string }>> = {
  /* L'entreprise, pas un radar : la supervision est le niveau au-dessus des
     boutiques, pas un poste de surveillance. Le même pictogramme désigne déjà
     l'entreprise dans les réglages. */
  supervision: Building2,
  accueil: LayoutGrid,
  motos: Bike,
  pieces: Wrench,
  caisse: Coins,
  reglages: Settings,
};

function estActive(chemin: string, href: string): boolean {
  return chemin === href || chemin.startsWith(`${href}/`);
}

/**
 * Navigation principale.
 *
 * En bas sur téléphone : c’est la zone du pouce, et l’application s’utilise
 * debout, une main occupée par le client ou la moto. Sur grand écran elle passe
 * en rail vertical à gauche, où le regard la cherche.
 *
 * Ses entrées ne sont pas une liste figée : elles se déduisent du rôle et des
 * métiers de la boutique en cours (D62). Un gérant de boutique motos n’a pas
 * d’onglet « Pièces », parce que le lui montrer serait promettre un écran que
 * la garde refuserait ensuite.
 */
export function NavigationPrincipale() {
  const chemin = usePathname();
  const session = useSession();
  const { perimetre } = usePerimetre();

  if (session.statut !== "connecte") return null;
  const entrees = espacesVisibles(session.utilisateur.role, perimetre.metiers);

  return (
    <nav
      aria-label="Navigation principale"
      className={[
        // `print:hidden` : la navigation ne sort pas sur le papier (S10).
        "sticky bottom-0 z-30 border-t border-bord bg-papier print:hidden",
        // Placée après le contenu dans le DOM (cf. (app)/layout.tsx) : elle est
        // donc en bas sur téléphone, et repasse à gauche sur grand écran.
        "sm:sticky sm:top-0 sm:order-first sm:h-dvh sm:w-56 sm:shrink-0 sm:border-t-0 sm:border-r",
      ].join(" ")}
    >
      <ul
        className={[
          "flex items-stretch justify-between",
          "sm:h-full sm:flex-col sm:justify-start sm:gap-1 sm:p-2",
        ].join(" ")}
      >
        {entrees.map((espace) => {
          const { href, libelle } = ESPACES[espace];
          const Icone = ICONE[espace];
          const active = estActive(chemin, href);
          return (
            <li key={href} className="flex-1 sm:flex-none">
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={[
                  // 56 px de haut : une cible tactile confortable, pas le
                  // minimum syndical de 44 (DESIGN.md §11).
                  "flex h-14 flex-col items-center justify-center gap-1 text-xs font-medium",
                  "sm:h-11 sm:flex-row sm:justify-start sm:gap-3 sm:rounded-plaque sm:px-3 sm:text-sm",
                  active ? "text-encre" : "text-encre-doux hover:text-encre",
                  active ? "sm:bg-fond" : "",
                ].join(" ")}
              >
                {/* L’onglet actif se signale par un trait de plaque, pas par la
                    seule couleur : lisible en plein soleil et sans distinguer
                    les nuances (DESIGN.md §5). */}
                <span className="relative flex items-center justify-center">
                  <Icone className="size-5" />
                  {active && (
                    <span
                      aria-hidden="true"
                      className="absolute -bottom-1.5 h-0.5 w-5 rounded-full bg-accent-actif sm:hidden"
                    />
                  )}
                </span>
                {libelle}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
