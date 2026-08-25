import { Activity, Bike, ChevronRight, Coins, Settings, Wrench } from "lucide-react";
import Link from "next/link";
import type { ComponentType } from "react";

export const metadata = { title: "Accueil — SDI" };

const ESPACES: {
  href: string;
  libelle: string;
  role: string;
  Icone: ComponentType<{ className?: string }>;
}[] = [
  { href: "/motos", libelle: "Motos", role: "Stock, ventes, paiements et dossiers", Icone: Bike },
  { href: "/pieces", libelle: "Pièces détachées", role: "Catalogue, stock et comptoir", Icone: Wrench },
  { href: "/caisse", libelle: "Caisse", role: "Journal du jour et clôture", Icone: Coins },
  { href: "/parametres", libelle: "Réglages", role: "Boutiques, utilisateurs, référentiels", Icone: Settings },
];

/**
 * L’accueil du socle : il mène aux espaces, rien de plus.
 *
 * Les chiffres du jour — ventes, encaissements, dettes, alertes — sont le sujet
 * de S24. Les afficher ici avant que les données existent produirait des cartes
 * à zéro, c’est-à-dire un tableau de bord qui ment.
 */
export default function Accueil() {
  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight text-encre">Accueil</h1>
      <p className="mt-2 max-w-prose text-encre-doux">
        Vous pouvez travailler sans réseau : vos saisies sont gardées sur l’appareil et partent
        seules dès que la connexion revient. Le bandeau en haut dit toujours où en est l’envoi.
      </p>

      <nav aria-label="Espaces de travail" className="mt-6">
        <ul className="divide-y divide-bord overflow-hidden rounded-plaque border border-bord bg-papier">
          {ESPACES.map(({ href, libelle, role, Icone }) => (
            <li key={href}>
              <Link
                href={href}
                className="flex items-center gap-4 px-4 py-4 hover:bg-fond focus-visible:bg-fond"
              >
                <Icone aria-hidden="true" className="size-5 shrink-0 text-encre-doux" />
                <span className="min-w-0 flex-1">
                  <span className="block font-medium text-encre">{libelle}</span>
                  <span className="block text-sm text-encre-doux">{role}</span>
                </span>
                <ChevronRight aria-hidden="true" className="size-4 shrink-0 text-encre-doux" />
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      <Link
        href="/diagnostic"
        className="mt-6 inline-flex h-11 items-center gap-2 rounded-plaque border border-bord px-4 text-sm font-medium text-encre hover:bg-papier"
      >
        <Activity aria-hidden="true" className="size-4" />
        Vérifier la synchronisation
      </Link>
    </div>
  );
}
