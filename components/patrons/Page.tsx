"use client";

import type { ReactNode } from "react";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { usePerimetre } from "@/lib/perimetre/perimetre";

/**
 * La tête d’écran : où je suis, et le geste principal.
 *
 * Elle répond à deux des quatre questions du §6.2 du cahier — *où je suis* et
 * *ce que je fais maintenant* — et elle y répond au même endroit sur les vingt
 * écrans, ce qui est tout l’intérêt. Le titre était recopié à l’identique dans
 * chacun d’eux, avec sa chaîne de classes ; une virgule de travers suffisait à
 * décaler un écran des autres sans que rien ne le signale.
 *
 * **Le sur-titre et le titre, rien d'autre.** Le sur-titre, au-dessus du titre,
 * dit *où je suis* — l’espace et la boutique, « Motos · Pouytenga » —, en onze
 * pixels capitales interlettrées (`socle.css:476`) : c’est ce qui répond *où
 * suis-je* **avant** qu’on lise le titre.
 *
 * **Il y avait un sous-titre, il n'y en a plus** (28 octobre 2026). Le
 * commanditaire a demandé d'« enlever tous les titres secondaires » : la phrase
 * grise sous le titre ne se lisait pas, et elle chargeait chaque écran.
 *
 * `retour` n’est pas décoratif non plus. Les écrans de réglages sont des
 * enfants d’un hub ; sans lui, revenir demande la barre latérale, c’est-à-dire
 * de sortir de l’écran pour y rentrer.
 */
export function TetePage({
  retour,
  surTitre,
  titre,
  actions,
}: {
  retour?: { href: string; libelle: string };
  /** Où je suis : l’espace et la boutique. Voir `useSurTitre`. */
  surTitre?: ReactNode;
  titre: string;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-6">
      {retour && (
        <Link
          href={retour.href}
          className="mb-2 inline-flex items-center gap-2 text-legende text-encre-doux hover:text-encre"
        >
          <ArrowLeft aria-hidden="true" className="size-4" />
          {retour.libelle}
        </Link>
      )}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          {surTitre && (
            <p className="text-micro font-bold tracking-[0.09em] text-encre-doux uppercase">
              {surTitre}
            </p>
          )}
          <h1 className="text-ecran font-bold tracking-tight text-encre">{titre}</h1>
        </div>
        {/* `shrink-0` a été retiré : à 390 px il poussait la rangée d’actions
            hors du cadre et le lien passait sous le bandeau collant — le défaut
            relevé en S28 et noté dans S29. Les actions se replient désormais
            avec le reste. */}
        {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
      </div>
    </div>
  );
}

/**
 * Le titre d’un bloc à l’intérieur d’un écran.
 *
 * En capitales et en petit : c’est une étiquette de rangement, pas un second
 * titre d’écran. Un `h2` qui ressemblerait au `h1` ferait croire à deux écrans
 * empilés — et un lecteur d’écran, lui, entendrait bien deux niveaux.
 *
 * **Exactement le sur-titre d’écran**, gras et à 0,09 em (`socle.css:476`) : la
 * maquette n’a qu’une seule étiquette de rangement, servie par la même classe
 * au-dessus du `h1` et en tête de bloc. Le patron portait un gras plus léger et
 * un interlettrage approximatif — deux graisses pour une même fonction, ce que
 * D73 appelle deux listes qui finissent par répondre deux choses.
 */
export function TitreSection({ children, id }: { children: ReactNode; id?: string }) {
  return (
    <h2 id={id} className="mb-3 text-micro font-bold tracking-[0.09em] text-encre-doux uppercase">
      {children}
    </h2>
  );
}

/**
 * Le sur-titre d’un écran de métier : « Motos · Pouytenga ».
 *
 * L’espace est passé par l’appelant — il le connaît, et il ne change pas —, la
 * boutique vient du périmètre. Écrit une fois plutôt que cinq : cinq copies
 * auraient fini par dire « Toutes les boutiques » ici et « Toutes boutiques »
 * là, et c’est la ligne qu’on lit sans y penser.
 */
export function useSurTitre(espace: string): string {
  const { perimetre } = usePerimetre();
  const ou =
    perimetre.type === "toutes"
      ? "Toutes les boutiques"
      : /* « Toutes les boutiques » serait faux : un gérant sans attribution
           n'en voit aucune, il n'en voit pas toutes (acquis d'A3). */
        perimetre.type === "aucune"
        ? "Aucune boutique attribuée"
        : perimetre.nom;
  return `${espace} · ${ou}`;
}
