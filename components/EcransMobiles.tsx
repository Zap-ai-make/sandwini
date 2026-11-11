"use client";

import { Activity, ChevronDown, LogOut, UserRound } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { BasculeTheme } from "@/components/BasculeTheme";
import { Chiffre } from "@/components/patrons/Chiffre";
import { Modale } from "@/components/patrons/Modale";
import { ICONE_ECRAN } from "@/components/icones-ecrans";
import { seDeconnecter, useSession } from "@/lib/auth/session";
import {
  ESPACES,
  ecranCourant,
  entreeCourante,
  espaceDuChemin,
  espacesVisibles,
  groupesVisibles,
  type GroupeDEcrans,
} from "@/lib/domain/espaces";
import { situationDuCompte } from "@/lib/domain/roles";
import { usePerimetre } from "@/lib/perimetre/perimetre";
import { useComptes } from "@/lib/repositories/comptes";

/**
 * Les écrans de l'espace, sous 1024 px (11 novembre 2026).
 *
 * **Le défaut qu'elle répare.** La colonne des écrans s'efface sous 1024 px, et
 * le code promettait que ses écrans « restent atteignables depuis les pages ».
 * C'était vrai tant que des pages-sommaires y menaient ; elles sont parties
 * une à une, la dernière le 26 octobre (`/parametres`, qui ouvre désormais
 * l'identité). Sur téléphone, on ne pouvait plus créer ni boutique ni
 * utilisateur, ni ouvrir les arrivages, les ventes ou les dépenses — vu par le
 * commanditaire, sur son téléphone.
 *
 * **Une barre qui dit où l'on est, et un panneau qui mène partout.** Choix du
 * commanditaire entre deux maquettes : la barre nomme l'espace et l'écran, et
 * un appui ouvre les mêmes groupes que la colonne du bureau, avec leurs
 * comptes. Un bandeau d'onglets aurait caché la plupart des douze écrans de
 * l'espace motos hors de l'écran.
 *
 * **Le pied du panneau porte le compte, le thème et la déconnexion.** Sous
 * 768 px, le rail les masque — il devient la barre d'espaces — et ils n'étaient
 * nulle part ailleurs.
 */
export function EcransMobiles() {
  const chemin = usePathname();
  const session = useSession();
  const { perimetre } = usePerimetre();
  const [ouvert, setOuvert] = useState(false);

  if (session.statut !== "connecte") return null;
  const role = session.utilisateur.role;
  const espaces = espacesVisibles(role, perimetre.metiers, perimetre.type);
  const espace = espaceDuChemin(chemin, espaces) ?? espaces[0] ?? null;
  if (!espace) return null;

  const libelleEspace = ESPACES[espace].libelle;
  const entree = entreeCourante(espace, role, chemin);
  const fermer = () => setOuvert(false);

  return (
    <div className="shrink-0 border-b border-bord bg-papier px-4 lg:hidden print:hidden">
      <button
        type="button"
        onClick={() => setOuvert(true)}
        aria-haspopup="dialog"
        aria-expanded={ouvert}
        aria-label={`Écrans de l’espace ${libelleEspace}${entree ? ` — ${entree.libelle}` : ""}`}
        className="flex h-11 w-full items-center gap-2 text-left"
      >
        <span className="min-w-0 flex-1 truncate text-sm">
          <span className="text-encre-doux">{libelleEspace}</span>
          {entree && (
            <>
              <span aria-hidden="true" className="px-1.5 text-encre-doux">
                ›
              </span>
              <span className="font-semibold text-encre">{entree.libelle}</span>
            </>
          )}
        </span>
        <ChevronDown aria-hidden="true" className="size-4 shrink-0 text-encre-doux" />
      </button>

      <Modale
        ouvert={ouvert}
        onFermer={fermer}
        titre={libelleEspace}
        taille="etroite"
        pied={<PiedPanneau auChoix={fermer} />}
      >
        <ListeEcrans
          groupes={groupesVisibles(espace, role, perimetre.type)}
          courant={ecranCourant(espace, role, chemin)}
          auChoix={fermer}
        />
      </Modale>
    </div>
  );
}

/**
 * Les groupes de l'espace, comme dans la colonne.
 *
 * Monté seulement panneau ouvert : `useComptes` ouvre quatre écoutes de la base,
 * que la colonne tient déjà sur bureau. Les doubler en permanence sur un
 * téléphone se paierait en données mobiles (D66) pour des pastilles qu'on ne
 * regarde qu'en ouvrant le panneau.
 */
function ListeEcrans({
  groupes,
  courant,
  auChoix,
}: {
  groupes: readonly GroupeDEcrans[];
  courant: string | null;
  auChoix: () => void;
}) {
  const comptes = useComptes();

  return (
    <nav aria-label="Écrans de l’espace" className="grid gap-4">
      {groupes.map((groupe) => (
        <section key={groupe.titre}>
          <h3 className="px-2 pb-1.5 text-micro font-bold tracking-[0.09em] text-encre-doux uppercase">
            {groupe.titre}
          </h3>
          <ul>
            {groupe.ecrans.map(({ href, libelle, compteur }) => {
              const Icone = ICONE_ECRAN[href] ?? Activity;
              const actif = href === courant;
              const compte = compteur ? comptes[compteur] : null;
              return (
                <li key={href}>
                  <Link
                    href={href}
                    onClick={auChoix}
                    aria-current={actif ? "page" : undefined}
                    className={[
                      "flex min-h-11 items-center gap-3 rounded-champ border-l-2 px-2 py-2",
                      /* Jamais la couleur seule : le fond, le filet, la graisse
                         et `aria-current`, comme dans la colonne. */
                      actif
                        ? "border-l-encre bg-survol font-semibold text-encre"
                        : "border-l-transparent text-encre hover:bg-survol",
                    ].join(" ")}
                  >
                    <Icone aria-hidden="true" className="size-4 shrink-0 text-encre-doux" />
                    <span className="min-w-0 flex-1">{libelle}</span>
                    {compte !== null && (
                      <span className="shrink-0 rounded-full bg-fond px-1.5 font-code text-micro text-encre-doux">
                        <Chiffre valeur={String(compte)} />
                        <span className="sr-only"> à traiter</span>
                      </span>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </nav>
  );
}

/** Qui est connecté, le thème, la déconnexion : le pied du rail et de la colonne. */
function PiedPanneau({ auChoix }: { auChoix: () => void }) {
  const session = useSession();
  const { perimetre, boutiques } = usePerimetre();
  if (session.statut !== "connecte") return null;

  const { nom, email, role } = session.utilisateur;
  const ouvertes = boutiques.filter((boutique) => boutique.actif).length;

  return (
    <>
      <Link
        href="/parametres"
        onClick={auChoix}
        className="flex min-w-0 basis-full items-center gap-2 text-encre-doux hover:text-encre"
      >
        <UserRound aria-hidden="true" className="size-4 shrink-0" />
        <span className="min-w-0 flex-1">
          <span className="block truncate font-semibold text-encre">{nom || email}</span>
          <span className="block truncate text-legende">
            {situationDuCompte(role, perimetre, ouvertes)}
          </span>
        </span>
      </Link>
      <BasculeTheme className="bouton bouton-discret px-2" />
      <button
        type="button"
        onClick={() => void seDeconnecter()}
        className="bouton bouton-discret ml-auto px-2"
      >
        <LogOut aria-hidden="true" className="size-5" />
        Se déconnecter
      </button>
    </>
  );
}
