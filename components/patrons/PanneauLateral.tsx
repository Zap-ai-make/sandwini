import { X } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

/**
 * Le panneau latéral : le détail sans perdre la liste.
 *
 * `CAHIER-UI.md` §7 le demande en une phrase — « sur bureau, un panneau latéral
 * qui garde la liste visible à gauche vaut mieux qu’une navigation aller-retour ».
 * Ce qu’on perdait dans l’aller-retour n’était pas du temps mais **le repère** :
 * on ouvrait une vente, on revenait, et la recherche était à refaire, la
 * position dans la liste perdue, la comparaison avec la ligne voisine
 * impossible.
 *
 * **Ce n’est pas une route**, et ça ne peut pas l’être. La fiche s’ouvre par un
 * paramètre d’écran — `?vente=`, `?moto=`, `?recu=` — parce qu’une route
 * dynamique obligerait le navigateur à demander au serveur un document que le
 * service worker n’a jamais vu : hors ligne, la vente enregistrée il y a dix
 * secondes tomberait sur la page de repli (D39). Le panneau hérite de ce choix
 * déjà pris ; il lui donne seulement sa forme.
 *
 * **Le seuil se mesure sur la place, pas sur la fenêtre.** Les maquettes
 * passent à deux colonnes dès 1152 px de *fenêtre*, et le rendu réel a dit
 * pourquoi c’était trop tôt : à 1280 px, la coquille prend 296 px, il en reste
 * 944 pour un panneau de 420 et un tableau de six colonnes — « Paiement »
 * sortait à moitié du cadre. Or la même fenêtre repliée (Ctrl B) laisse 1264 px
 * et le couple respire. La bascule dépend donc de la largeur de la zone de
 * travail, par requête de conteneur : replier la colonne des écrans fait
 * apparaître la fiche à côté de sa liste, ce qui est exactement le geste qu’un
 * repli doit récompenser.
 *
 * **En dessous, le panneau prend toute la place et la liste s’efface.** Les
 * maquettes les empilent — panneau sous liste — et c’est tenable avec les sept
 * lignes d’une maquette ; avec deux cents ventes, ouvrir une fiche demanderait
 * de faire défiler toute la liste pour l’atteindre. `DESIGN.md` §6 : la mise en
 * page tient avec du contenu très long, ou elle ne tient pas.
 *
 * Elle s’efface en CSS et n’est pas démontée, ce qui n’est pas qu’un détail :
 * la recherche et les filtres sont un état de la liste, et les remonter les
 * remettrait à zéro à chaque fiche ouverte. On ferme le panneau et on retrouve
 * exactement l’écran qu’on avait — ce que tout ce patron cherche à obtenir.
 */
export function AvecPanneau({
  panneau,
  children,
}: {
  /** La fiche ouverte, ou `null` quand il n’y en a pas. */
  panneau: ReactNode;
  children: ReactNode;
}) {
  if (!panneau) return <>{children}</>;
  return (
    <div className="@container">
      <div className="grid items-start gap-5 @min-[68rem]:grid-cols-[minmax(0,1fr)_26.25rem]">
        {/* Masquée, pas démontée — cf. l’en-tête : la recherche et les filtres
            sont un état de la liste, et on les retrouve en fermant le panneau. */}
        <div className="min-w-0 @max-[68rem]:hidden">{children}</div>
        {panneau}
      </div>
    </div>
  );
}

/**
 * Le panneau lui-même : une identité, un corps, un pied d’actions.
 *
 * **Un `aside` nommé**, donc un repère `complementary` que la suite bout en
 * bout sait viser et qu’un lecteur d’écran sait atteindre directement. Le nom
 * dit *quoi* est ouvert — « Vente PTG-2609-0042 » —, pas « panneau ».
 *
 * **C’est le corps qui défile, pas la page**, comme le tableau d’à côté (A4).
 * Les maquettes posent un panneau simplement collant, ce qui suffit à leurs
 * huit lignes de faits ; la vraie fiche porte le dossier, les versements, le
 * formulaire d’encaissement et la marge, et dépasse la hauteur de l’écran. Un
 * panneau collant plus haut que la fenêtre ne colle plus : il défile comme le
 * reste, et le pied d’actions part avec lui. Le corps prend donc la hauteur qui
 * reste entre la tête et le pied.
 *
 * Sous le seuil, plus rien de tout cela : le panneau est la page, il se déroule.
 */
export function PanneauLateral({
  nom,
  identite,
  fermerVers,
  actions,
  children,
}: {
  /** Le nom accessible du panneau : ce qui est ouvert, pas le mot « panneau ». */
  nom: string;
  /** L’identité, en tête : la souche, le nom du client. */
  identite: ReactNode;
  /** Où mène la fermeture — l’écran sans son paramètre. */
  fermerVers: string;
  /** Les gestes qui n’appartiennent pas au corps : imprimer, ouvrir ailleurs. */
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <aside
      aria-label={nom}
      className="cadre flex flex-col rounded-carte @min-[68rem]:sticky @min-[68rem]:top-0 @min-[68rem]:max-h-[calc(100dvh-11rem)] @min-[68rem]:shadow-panneau"
    >
      <div className="flex items-start gap-3 border-b border-bord p-4">
        <div className="min-w-0 flex-1">{identite}</div>
        {/* Un lien, pas un bouton : fermer, c’est revenir à l’écran sans son
            paramètre. Le clic droit, le milieu et le retour arrière du
            navigateur marchent donc comme on s’y attend. */}
        <Link
          href={fermerVers}
          aria-label="Fermer la fiche"
          className="bouton bouton-discret shrink-0 px-2"
        >
          <X aria-hidden="true" className="size-4" />
        </Link>
      </div>

      <div className="min-h-0 p-4 @min-[68rem]:overflow-y-auto">{children}</div>

      {actions && (
        <div className="flex flex-wrap gap-2 rounded-b-carte border-t border-bord bg-fond px-4 py-3">
          {actions}
        </div>
      )}
    </aside>
  );
}

/**
 * Le titre d’un bloc à l’intérieur d’un panneau.
 *
 * Un filet au-dessus plutôt qu’un cadre autour : dans 420 px de large, six
 * cadres emboîtés font une pile de boîtes, pas une fiche. Le trait sépare aussi
 * bien et ne coûte pas de marge intérieure.
 */
export function TitrePanneau({ children }: { children: ReactNode }) {
  return (
    <h3 className="mt-5 border-t border-bord pt-3 text-micro font-bold tracking-wide text-encre-doux uppercase">
      {children}
    </h3>
  );
}

/**
 * Une liste de faits : l’identité, puis ce qu’il faut savoir.
 *
 * Deux colonnes, l’intitulé à gauche en gris, la valeur à droite en gras — la
 * forme des maquettes, et celle qui se lit le plus vite quand on cherche un
 * seul chiffre dans huit lignes.
 */
export function Faits({ children }: { children: ReactNode }) {
  return <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2">{children}</dl>;
}

export function Fait({
  titre,
  children,
  code = false,
}: {
  titre: string;
  children: ReactNode;
  /** Ce qui se dicte au téléphone ou se lit sur du métal : châssis, montant. */
  code?: boolean;
}) {
  return (
    <>
      <dt className="text-corps text-encre-doux">{titre}</dt>
      <dd
        className={`min-w-0 text-right font-semibold text-encre ${code ? "font-code break-all" : ""}`}
      >
        {children}
      </dd>
    </>
  );
}
