"use client";

import { ChevronRight, LoaderCircle, Settings } from "lucide-react";
import Link from "next/link";
import { InvitationBoutique } from "@/components/InvitationBoutique";
import { LIBELLE_METIER, type Boutique } from "@/lib/domain/boutique";
import { ESPACES } from "@/lib/domain/espaces";
import { usePerimetre } from "@/lib/perimetre/perimetre";

/**
 * L’entrée de la supervision — le troisième espace (`prompt.md` §1).
 *
 * Le responsable pilote plusieurs boutiques qu’il ne peut pas toutes avoir sous
 * les yeux : sa première question n’est pas « combien ai-je vendu », c’est
 * « laquelle je regarde ». L’écran répond à celle-là, et ouvre la boutique
 * choisie sur son propre espace.
 *
 * Les chiffres — ventes du jour, encaissements, dettes, tranches, alertes —
 * sont le sujet de S24. Les afficher maintenant produirait des cartes à zéro,
 * c’est-à-dire un tableau de bord qui ment.
 */
export default function Supervision() {
  const { boutiques, chargement, erreur, choisir } = usePerimetre();
  const actives = boutiques.filter((boutique) => boutique.actif);
  const fermees = boutiques.length - actives.length;

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight text-encre">Supervision</h1>
      <p className="mt-2 max-w-prose text-encre-doux">
        Vos boutiques, et ce que chacune vend. En ouvrir une la met dans le bandeau, en haut&nbsp;:
        tout ce que vous saisirez ensuite ira dans celle-là.
      </p>

      <InvitationBoutique />

      {erreur && (
        <p role="alert" className="mt-6 text-sm text-alerte">
          {erreur}
        </p>
      )}

      {chargement ? (
        <p className="mt-6 flex items-center gap-3 text-encre-doux">
          <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
          Chargement des boutiques…
        </p>
      ) : actives.length > 0 ? (
        <nav aria-label="Boutiques" className="mt-6">
          <ul className="divide-y divide-bord overflow-hidden rounded-plaque border border-bord bg-papier">
            {actives.map((boutique) => (
              <li key={boutique.id}>
                <Link
                  href={destination(boutique)}
                  onClick={() => choisir(boutique.id)}
                  className="flex items-center gap-4 px-4 py-4 hover:bg-fond focus-visible:bg-fond"
                >
                  <span className="plaque-code flex h-8 shrink-0 items-center rounded-plaque border border-plaque-bord bg-plaque px-2 text-sm leading-none text-encre-fixe">
                    {boutique.code}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium text-encre">{boutique.nom}</span>
                    {/* Le métier est écrit, jamais porté par la seule couleur
                        de la plaque (DESIGN.md §5). */}
                    <span className="block text-sm text-encre-doux">
                      {boutique.metiers.map((metier) => LIBELLE_METIER[metier]).join(" et ")}
                    </span>
                  </span>
                  <ChevronRight aria-hidden="true" className="size-4 shrink-0 text-encre-doux" />
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      ) : null}

      {fermees > 0 && (
        <p className="mt-3 text-sm text-encre-doux">
          {fermees === 1
            ? "Une boutique fermée n’apparaît pas ici ; elle reste lisible dans les réglages."
            : `${fermees} boutiques fermées n’apparaissent pas ici ; elles restent lisibles dans les réglages.`}
        </p>
      )}

      <Link
        href="/parametres/boutiques"
        className="mt-6 inline-flex h-11 items-center gap-2 rounded-plaque border border-bord px-4 text-sm font-medium text-encre hover:bg-papier"
      >
        <Settings aria-hidden="true" className="size-4" />
        Gérer les boutiques
      </Link>

      <p className="mt-8 max-w-prose text-sm text-encre-doux">
        Les chiffres du jour — ventes, encaissements, dettes, tranches en cours et alertes, toutes
        boutiques réunies — s’installeront ici quand les données à agréger existeront.
      </p>
    </div>
  );
}

/** L’espace sur lequel s’ouvre une boutique : celui de son métier. */
function destination(boutique: Boutique): string {
  return boutique.metiers[0] === "pieces" ? ESPACES.pieces.href : ESPACES.motos.href;
}
