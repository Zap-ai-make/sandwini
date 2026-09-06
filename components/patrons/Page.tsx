import type { ReactNode } from "react";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";

/**
 * La tête d’écran : où je suis, et le geste principal.
 *
 * Elle répond à deux des quatre questions du §6.2 du cahier — *où je suis* et
 * *ce que je fais maintenant* — et elle y répond au même endroit sur les vingt
 * écrans, ce qui est tout l’intérêt. Le titre était recopié à l’identique dans
 * chacun d’eux, avec sa chaîne de classes ; une virgule de travers suffisait à
 * décaler un écran des autres sans que rien ne le signale.
 *
 * **Le sous-titre dit une chose vraie, jamais une phrase d’ambiance.** Sur un
 * écran de données, c’est le périmètre : la question « les chiffres que je
 * regarde, ils sont de quelle boutique ? » n’a jamais de réponse évidente, le
 * bandeau la donne, et la tête d’écran la répète là où l’œil est déjà. Sur un
 * écran d’administration, c’est la phrase qui dit à quoi il sert — « ce que
 * vend une boutique décide des espaces que son gérant voit ». Les deux
 * répondent à *où je suis* ; rien d’autre n’a le droit d’occuper cette ligne.
 *
 * `retour` n’est pas décoratif non plus. Les écrans de réglages sont des
 * enfants d’un hub ; sans lui, revenir demande la barre latérale, c’est-à-dire
 * de sortir de l’écran pour y rentrer.
 */
export function TetePage({
  retour,
  titre,
  sousTitre,
  actions,
}: {
  retour?: { href: string; libelle: string };
  titre: string;
  sousTitre?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-6">
      {retour && (
        <Link
          href={retour.href}
          className="inline-flex items-center gap-2 text-legende text-encre-doux hover:text-encre"
        >
          <ArrowLeft aria-hidden="true" className="size-4" />
          {retour.libelle}
        </Link>
      )}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1
            className={`text-ecran font-semibold tracking-tight text-encre ${retour ? "mt-2" : ""}`}
          >
            {titre}
          </h1>
          {/* `text-corps` et non `text-legende` : le corps du produit est encore à
              16 px, et un sous-titre à 12,5 px ferait un décrochage de deux
              crans. Les maquettes le descendent d’autant parce qu’elles posent
              un corps à 14 px — c’est la densité bureau, et elle arrive avec
              S29, pas avec les patrons. */}
          {sousTitre && <p className="mt-1 max-w-prose text-corps text-encre-doux">{sousTitre}</p>}
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
 */
export function TitreSection({ children }: { children: ReactNode }) {
  return (
    <h2 className="mb-3 text-micro font-semibold tracking-wide text-encre-doux uppercase">
      {children}
    </h2>
  );
}
