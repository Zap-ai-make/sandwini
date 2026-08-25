import Link from "next/link";

/**
 * L’état d’un espace que le socle dessert déjà mais que sa spec n’a pas encore
 * rempli.
 *
 * Un écran vide est une invitation, pas un trou (DESIGN.md §10). Ici la seule
 * chose honnête à dire est : voilà ce que cet espace fera, voilà la spec qui
 * l’apporte, et voilà où aller en attendant. Le repère de spec n’est pas une
 * décoration — c’est une information vraie sur l’état du produit (§6).
 */
export function EspaceAVenir({
  titre,
  spec,
  contenu,
  retour = { href: "/dashboard", libelle: "Revenir à l’accueil" },
}: {
  titre: string;
  spec: string;
  contenu: string[];
  retour?: { href: string; libelle: string };
}) {
  return (
    <section className="max-w-prose">
      <p className="plaque-code mb-3 inline-block rounded-plaque border border-bord px-2 py-1 text-xs text-encre-doux">
        {spec}
      </p>
      <h1 className="text-2xl font-semibold tracking-tight text-encre">{titre}</h1>
      <p className="mt-3 text-encre-doux">
        Le socle dessert cet espace, sa spec ne l’a pas encore construit. Il contiendra&nbsp;:
      </p>
      <ul className="mt-4 space-y-2">
        {contenu.map((ligne) => (
          <li key={ligne} className="flex gap-3 text-encre">
            <span aria-hidden="true" className="mt-2.5 h-px w-4 shrink-0 bg-bord" />
            {ligne}
          </li>
        ))}
      </ul>
      <Link
        href={retour.href}
        className="mt-6 inline-flex h-11 items-center rounded-plaque border border-bord px-4 text-sm font-medium text-encre hover:bg-fond"
      >
        {retour.libelle}
      </Link>
    </section>
  );
}
