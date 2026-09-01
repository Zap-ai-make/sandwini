"use client";

import Link from "next/link";
import { useSession } from "@/lib/auth/session";
import { accueilDuRole } from "@/lib/domain/espaces";

/**
 * L’état d’un espace que le socle dessert déjà mais que sa spec n’a pas encore
 * rempli.
 *
 * Un écran vide est une invitation, pas un trou (DESIGN.md §10). Ici la seule
 * chose honnête à dire est : voilà ce que cet espace fera, voilà la spec qui
 * l’apporte, et voilà où aller en attendant. Le repère de spec n’est pas une
 * décoration — c’est une information vraie sur l’état du produit (§6).
 *
 * Le retour suit le rôle : le responsable rentre dans sa supervision, le gérant
 * à son accueil (D63). Un bouton « Revenir à l’accueil » qui mène ailleurs que
 * là d’où l’on vient use la confiance qu’on a dans les autres.
 */
export function EspaceAVenir({
  titre,
  spec,
  contenu,
}: {
  titre: string;
  spec: string;
  contenu: string[];
}) {
  const session = useSession();
  if (session.statut !== "connecte") return null;

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
        href={accueilDuRole(session.utilisateur.role)}
        className="mt-6 inline-flex h-11 items-center rounded-plaque border border-bord px-4 text-sm font-medium text-encre hover:bg-fond"
      >
        Revenir à l’accueil
      </Link>
    </section>
  );
}
