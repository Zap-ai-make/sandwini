"use client";

import { Activity, Bike, ChevronRight, Coins, Settings, Users, Wrench } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, type ComponentType } from "react";
import { InvitationBoutique } from "@/components/InvitationBoutique";
import { useSession } from "@/lib/auth/session";
import { accedeEspace, accueilDuRole, type Espace } from "@/lib/domain/espaces";
import { usePerimetre } from "@/lib/perimetre/perimetre";

const ESPACES_DU_GERANT: {
  espace: Espace;
  href: string;
  libelle: string;
  role: string;
  Icone: ComponentType<{ className?: string }>;
}[] = [
  {
    espace: "motos",
    href: "/motos",
    libelle: "Motos",
    role: "Stock, ventes, paiements et dossiers",
    Icone: Bike,
  },
  {
    espace: "pieces",
    href: "/pieces",
    libelle: "Pièces détachées",
    role: "Catalogue, stock et comptoir",
    Icone: Wrench,
  },
  {
    espace: "motos",
    href: "/clients",
    libelle: "Clients",
    role: "Retrouver ou créer une fiche",
    Icone: Users,
  },
  {
    espace: "caisse",
    href: "/caisse",
    libelle: "Caisse",
    role: "Journal du jour et clôture",
    Icone: Coins,
  },
  {
    espace: "reglages",
    href: "/parametres",
    libelle: "Réglages",
    role: "Boutiques, utilisateurs, référentiels",
    Icone: Settings,
  },
];

/**
 * L’accueil du gérant : il mène aux espaces de sa boutique, rien de plus.
 *
 * La liste suit les métiers de la boutique (D62) — proposer « Pièces détachées »
 * à un gérant de boutique motos serait un lien mort, et donc une application
 * qui a l’air cassée.
 *
 * Le responsable, lui, n’a rien à faire ici : son accueil est la supervision
 * (D63). On l’y renvoie plutôt que d’entretenir deux pages d’accueil qui
 * diraient presque la même chose.
 *
 * Les chiffres du jour sont le sujet de S24. Les afficher avant que les données
 * existent produirait des cartes à zéro, c’est-à-dire un tableau de bord qui
 * ment.
 */
export default function Accueil() {
  const session = useSession();
  const { perimetre } = usePerimetre();
  const router = useRouter();

  const role = session.statut === "connecte" ? session.utilisateur.role : null;
  const versSupervision = role !== null && accueilDuRole(role) !== "/dashboard";

  useEffect(() => {
    if (versSupervision) router.replace("/supervision");
  }, [versSupervision, router]);

  if (role === null) return null;
  if (versSupervision) {
    // Le temps que la redirection parte. Pas d’écran vide entre les deux.
    return <p className="text-encre-doux">Ouverture de la supervision…</p>;
  }

  /* Un périmètre sans métier connu — chargement, ou aucune boutique attribuée —
     laisse passer les espaces : `InvitationBoutique` explique alors le blocage,
     et chaque écran garde son propre état vide. */
  const espaces =
    perimetre.metiers.length === 0
      ? ESPACES_DU_GERANT
      : ESPACES_DU_GERANT.filter((entree) => accedeEspace(role, perimetre.metiers, entree.espace));

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight text-encre">Accueil</h1>
      <p className="mt-2 max-w-prose text-encre-doux">
        Vous pouvez travailler sans réseau : vos saisies sont gardées sur l’appareil et partent
        seules dès que la connexion revient. Le bandeau en haut dit toujours où en est l’envoi.
      </p>

      <InvitationBoutique />

      <nav aria-label="Espaces de travail" className="mt-6">
        <ul className="divide-y divide-bord overflow-hidden rounded-plaque border border-bord bg-papier">
          {espaces.map(({ href, libelle, role: sousTitre, Icone }) => (
            <li key={href}>
              <Link
                href={href}
                className="flex items-center gap-4 px-4 py-4 hover:bg-fond focus-visible:bg-fond"
              >
                <Icone aria-hidden="true" className="size-5 shrink-0 text-encre-doux" />
                <span className="min-w-0 flex-1">
                  <span className="block font-medium text-encre">{libelle}</span>
                  <span className="block text-sm text-encre-doux">{sousTitre}</span>
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
