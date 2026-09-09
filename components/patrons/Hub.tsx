import { ChevronRight } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

/**
 * Le hub : une liste de destinations, chacune avec ce qu’on y fait.
 *
 * C’est le patron des écrans qui ne portent aucune donnée et n’existent que
 * pour envoyer ailleurs — les réglages, et l’accueil d’un espace. La phrase
 * sous le nom n’est pas de la décoration : sans elle, « Référentiels » et
 * « Catalogue » sont deux mots que seul l’auteur distingue, et on ouvre les
 * deux pour trouver le bon.
 *
 * **Le hub n’est pas la navigation.** Depuis la refonte, la colonne de gauche
 * mène partout ; ce hub reste parce qu’un écran d’administration doit pouvoir
 * *expliquer* ses destinations, ce qu’une liste de liens de 16 px ne peut pas
 * faire. Le jour où la colonne suffirait, il disparaît.
 */
export function Hub({ destinations }: { destinations: readonly Destination[] }) {
  return (
    <ul className="cadre cadre-liste">
      {destinations.map((destination) => (
        <li key={destination.href}>
          <Link
            href={destination.href}
            className="flex items-center gap-4 px-4 py-4 hover:bg-survol"
          >
            <destination.icone aria-hidden="true" className="size-5 shrink-0 text-encre-doux" />
            <span className="min-w-0 flex-1">
              <span className="block font-medium text-encre">{destination.libelle}</span>
              <span className="block text-corps text-encre-doux">{destination.quoi}</span>
            </span>
            {/* Ce qu’on y trouverait, dit avant d’y aller. « 3 prestataires » et
                « aucun prestataire » ne demandent pas la même visite — et sur une
                installation neuve, c’est ce compte qui dit ce qui reste à poser. */}
            {destination.etat && (
              <span className="shrink-0 text-legende text-encre-doux">{destination.etat}</span>
            )}
            <ChevronRight aria-hidden="true" className="size-4 shrink-0 text-encre-doux" />
          </Link>
        </li>
      ))}
    </ul>
  );
}

export type Destination = {
  href: string;
  libelle: string;
  /** Ce qu’on y fait, en une ligne. Pas une définition : un geste. */
  quoi: string;
  /** Ce qu’on y trouve déjà : un compte, un état. Facultatif. */
  etat?: ReactNode;
  icone: LucideIcon;
};
