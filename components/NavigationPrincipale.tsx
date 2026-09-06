"use client";

import { Activity, Bike, Building2, Coins, LayoutGrid, PanelLeft, Settings, Wrench } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useSyncExternalStore, type ComponentType } from "react";
import { ICONE_ECRAN } from "@/components/icones-ecrans";
import { Monogramme } from "@/components/Monogramme";
import { useSession } from "@/lib/auth/session";
import {
  ESPACES,
  INTENTIONS,
  LIBELLE_INTENTION,
  ecranCourant,
  ecransVisibles,
  espaceDuChemin,
  espacesVisibles,
  type Espace,
} from "@/lib/domain/espaces";
import { usePerimetre } from "@/lib/perimetre/perimetre";

type Icone = ComponentType<{ className?: string }>;

/* L'icône de chaque espace. Le reste — route et intitulé — vit dans
   `lib/domain/espaces.ts`, avec la règle qui décide qui voit quoi ; ici on ne
   garde que ce qui relève du rendu. */
const ICONE_ESPACE: Record<Espace, Icone> = {
  /* L'entreprise, pas un radar : la supervision est le niveau au-dessus des
     boutiques, pas un poste de surveillance. Le même pictogramme désigne déjà
     l'entreprise dans les réglages. */
  supervision: Building2,
  accueil: LayoutGrid,
  motos: Bike,
  pieces: Wrench,
  caisse: Coins,
  reglages: Settings,
};

/* L'icône de chaque écran, par sa route. Elle ne porte aucun sens à elle
   seule — le libellé est toujours là — sauf colonne repliée, où elle devient le
   seul repère : d'où le fait que chaque entrée en ait une, et une seule fois. */

/**
 * La navigation principale — un rail d'espaces, et la colonne des écrans de
 * l'espace courant.
 *
 * **C'est ici que disparaît le défaut n°1 du diagnostic.** La barre portait
 * cinq liens et 90 % de vide vertical, pendant que sept écrans de l'espace
 * motos n'apparaissaient dans aucune navigation. Le rail garde les espaces ; la
 * colonne porte le second niveau, groupé par intention du métier.
 *
 * Sur téléphone, la colonne s'efface et le rail passe en bas, dans la zone du
 * pouce : c'est l'acquis du produit et il ne régresse pas. Les écrans du second
 * niveau restent atteignables depuis les pages, comme aujourd'hui.
 *
 * Les entrées ne sont pas une liste figée : elles se déduisent du rôle et des
 * métiers de la boutique en cours (D62). Un gérant de boutique motos n'a pas
 * d'onglet « Pièces », parce que le lui montrer serait promettre un écran que
 * la garde refuserait ensuite.
 */
export function NavigationPrincipale() {
  const chemin = usePathname();
  const session = useSession();
  const { perimetre } = usePerimetre();

  if (session.statut !== "connecte") return null;
  const role = session.utilisateur.role;
  const espaces = espacesVisibles(role, perimetre.metiers);
  const courant = espaceDuChemin(chemin, espaces) ?? espaces[0] ?? null;

  return (
    <>
      <span aria-hidden="true" className="coquille-filet print:hidden" />

      <nav
        aria-label="Navigation principale"
        className="rail flex flex-col items-center gap-1 px-0 pt-4 pb-3 max-md:flex-row max-md:justify-around max-md:pt-1 print:hidden"
      >
        <Marque />
        {espaces.map((espace) => {
          const { href, libelle } = ESPACES[espace];
          const Icone = ICONE_ESPACE[espace];
          const active = espace === courant;
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={[
                /* « Se déconnecter » et « Supervision » débordaient du rail : le
                   mot le plus long commande la largeur, pas l'inverse. */
                "grid w-[62px] justify-items-center gap-[3px] rounded-champ px-0.5 pt-2 pb-1 text-center text-[10px] leading-tight",
                "[overflow-wrap:anywhere] max-md:h-14 max-md:w-auto max-md:flex-1 max-md:content-center",
                active
                  ? "bg-nuit-3 font-semibold text-coquille-encre"
                  : "text-coquille-doux hover:bg-nuit-3 hover:text-coquille-encre",
              ].join(" ")}
            >
              <Icone className="size-5" />
              {libelle}
            </Link>
          );
        })}
      </nav>

      {courant && <Colonne espace={courant} chemin={chemin} role={role} />}
    </>
  );
}

/**
 * Le monogramme en tête du rail.
 *
 * Il ne renvoie nulle part : un logo cliquable promet un « accueil » qui
 * n'existe pas ici — chaque rôle a le sien, et il est déjà dans le rail.
 */
function Marque() {
  return (
    <span
      aria-hidden="true"
      className="mb-3 block w-10 text-coquille-encre max-md:hidden"
      title="Sandwidi et Frères"
    >
      <Monogramme className="block w-full" />
    </span>
  );
}

function Colonne({
  espace,
  chemin,
  role,
}: {
  espace: Espace;
  chemin: string;
  role: Parameters<typeof ecransVisibles>[1];
}) {
  const ecrans = ecransVisibles(espace, role);
  const courant = ecranCourant(espace, role, chemin);
  const repliee = useRepli();

  return (
    <nav
      aria-label={`Écrans de l’espace ${ESPACES[espace].libelle}`}
      className="colonne flex flex-col px-3 pt-4 pb-3 max-md:hidden print:hidden"
    >
      <div className="mb-4 flex items-center gap-2">
        <h2 className="colonne-libelle font-display text-bloc font-bold tracking-tight text-coquille-encre">
          {ESPACES[espace].libelle}
        </h2>
        <BoutonRepli repliee={repliee} />
      </div>

      {INTENTIONS.map((intention) => {
        const groupe = ecrans.filter((ecran) => ecran.intention === intention);
        if (groupe.length === 0) return null;
        return (
          <section key={intention} className="pt-4 first-of-type:pt-0">
            {/* Le groupe dit une intention du métier — vendre, suivre,
                administrer — et non un type d'objet. C'est ce qui rend la
                colonne lisible sans la lire. Replié, il ne reste que le filet :
                un sur-titre de onze pixels écrasé à 64 px de large ne dirait
                plus rien. */}
            <h3
              className={[
                "px-2 pb-2 text-micro font-bold tracking-[0.09em] text-coquille-muet uppercase",
                repliee ? "sr-only" : "",
              ].join(" ")}
            >
              {LIBELLE_INTENTION[intention]}
            </h3>
            <ul>
              {groupe.map(({ href, libelle }) => {
                const Icone = ICONE_ECRAN[href] ?? Activity;
                const active = href === courant;
                return (
                  <li key={href}>
                    <Link
                      href={href}
                      aria-current={active ? "page" : undefined}
                      title={repliee ? libelle : undefined}
                      className={[
                        "flex items-center gap-2 rounded-champ border-l-2 px-2 py-[7px]",
                        repliee ? "justify-center px-0" : "",
                        /* Jamais la couleur seule : l'écran courant est marqué
                           par le fond, le filet, la graisse et `aria-current`. */
                        active
                          ? "border-l-coquille-encre bg-nuit-3 font-semibold text-coquille-encre"
                          : "border-l-transparent text-coquille-doux hover:bg-nuit-3 hover:text-coquille-encre",
                      ].join(" ")}
                    >
                      <Icone className="size-4 shrink-0 opacity-85" />
                      <span className="colonne-libelle">{libelle}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </nav>
  );
}

/**
 * Le repli de la colonne.
 *
 * L'état vit sur `<html>` plutôt que dans React : c'est lui que le CSS lit pour
 * animer la grille, et c'est lui qu'un script d'amorçage pose avant le premier
 * rendu pour que la colonne ne s'ouvre pas puis ne se referme sous les yeux de
 * l'utilisateur (cf. `app/layout.tsx`).
 */
const CLE_REPLI = "sdi.nav.repliee";

/* `useSyncExternalStore` et non un `useState` synchronisé par effet : l'état
   vit hors de React — c'est un attribut du DOM, posé avant le premier rendu par
   le script d'amorçage et lu par le CSS. Le synchroniser dans un effet
   provoquerait un second rendu à chaque montage, pour une valeur qu'on peut
   simplement lire. Côté serveur, on rend la colonne dépliée : c'est l'état par
   défaut, et le script corrige avant la peinture. */
function useRepli(): boolean {
  return useSyncExternalStore(souscrireAuRepli, lireLeRepli, () => false);
}

function souscrireAuRepli(auChangement: () => void): () => void {
  const observateur = new MutationObserver(auChangement);
  observateur.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-nav"],
  });
  return () => observateur.disconnect();
}

function lireLeRepli(): boolean {
  return document.documentElement.dataset.nav === "repliee";
}

function basculerRepli() {
  const racine = document.documentElement;
  const repliee = racine.dataset.nav === "repliee";
  if (repliee) delete racine.dataset.nav;
  else racine.dataset.nav = "repliee";
  try {
    localStorage.setItem(CLE_REPLI, repliee ? "0" : "1");
  } catch {
    /* Navigation privée, stockage plein : le repli marche quand même, il ne
       survit simplement pas au rechargement. Ce n'est pas une panne. */
  }
}

function BoutonRepli({ repliee }: { repliee: boolean }) {
  const basculer = useCallback(() => basculerRepli(), []);

  /* `Ctrl B` : le raccourci que les éditeurs ont appris à tout le monde pour ce
     geste exact. Sur un poste utilisé huit heures par jour, replier au clavier
     évite d'aller chercher un bouton de seize pixels. */
  useEffect(() => {
    function auClavier(evenement: KeyboardEvent) {
      if (!(evenement.ctrlKey || evenement.metaKey) || evenement.altKey) return;
      if (evenement.key.toLowerCase() !== "b") return;
      evenement.preventDefault();
      basculerRepli();
    }
    window.addEventListener("keydown", auClavier);
    return () => window.removeEventListener("keydown", auClavier);
  }, []);

  return (
    <button
      type="button"
      onClick={basculer}
      aria-expanded={!repliee}
      title={`${repliee ? "Déplier" : "Replier"} la navigation (Ctrl B)`}
      className="ml-auto grid size-7 shrink-0 place-items-center rounded-champ text-coquille-muet hover:bg-nuit-3 hover:text-coquille-encre"
    >
      <PanelLeft aria-hidden="true" className="size-4" />
      <span className="sr-only">
        {repliee ? "Déplier la navigation" : "Replier la navigation"}
      </span>
    </button>
  );
}
