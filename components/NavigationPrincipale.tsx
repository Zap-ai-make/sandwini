"use client";

import { Bike, Coins, LayoutGrid, Settings, Wrench } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ComponentType } from "react";

type Entree = { href: string; libelle: string; Icone: ComponentType<{ className?: string }> };

/* Les cinq espaces du cahier des charges §14. L’ordre suit la journée d’un
   gérant : on regarde l’accueil, on vend une moto, on vend une pièce, on
   compte la caisse. Les paramètres ferment la marche, on y va rarement. */
const ENTREES: Entree[] = [
  { href: "/dashboard", libelle: "Accueil", Icone: LayoutGrid },
  { href: "/motos", libelle: "Motos", Icone: Bike },
  { href: "/pieces", libelle: "Pièces", Icone: Wrench },
  { href: "/caisse", libelle: "Caisse", Icone: Coins },
  { href: "/parametres", libelle: "Réglages", Icone: Settings },
];

function estActive(chemin: string, href: string): boolean {
  return chemin === href || chemin.startsWith(`${href}/`);
}

/**
 * Navigation principale.
 *
 * En bas sur téléphone : c’est la zone du pouce, et l’application s’utilise
 * debout, une main occupée par le client ou la moto. Sur grand écran elle passe
 * en rail vertical à gauche, où le regard la cherche.
 */
export function NavigationPrincipale() {
  const chemin = usePathname();

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
        {ENTREES.map(({ href, libelle, Icone }) => {
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
