"use client";

import {
  Activity,
  Bike,
  Building2,
  Coins,
  LayoutGrid,
  LogOut,
  PanelLeft,
  Settings,
  Store,
  UserRound,
  Wrench,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  useCallback,
  useEffect,
  useSyncExternalStore,
  type ComponentType,
  type ReactNode,
} from "react";
import { BasculeTheme } from "@/components/BasculeTheme";
import { ICONE_ECRAN } from "@/components/icones-ecrans";
import { Monogramme } from "@/components/Monogramme";
import { seDeconnecter, useSession } from "@/lib/auth/session";
import {
  ESPACES,
  ecranCourant,
  espaceDuChemin,
  espacesVisibles,
  groupesVisibles,
  type Espace,
} from "@/lib/domain/espaces";
import { LIBELLE_ROLE, type Role } from "@/lib/domain/roles";
import { usePerimetre } from "@/lib/perimetre/perimetre";
import { useComptes } from "@/lib/repositories/comptes";

type Icone = ComponentType<{ className?: string }>;

/* Une entrée du rail. Écrite une fois : trois appelants la portent désormais —
   les espaces, la bascule de thème et la déconnexion —, et une divergence de
   quelques pixels entre eux se verrait tout de suite sur 72 px de large. */
const LIEN_RAIL = [
  /* « Se déconnecter » et « Supervision » débordaient du rail : le mot le plus
     long commande la largeur, pas l'inverse. */
  "grid w-[62px] justify-items-center gap-[3px] rounded-champ px-0.5 pt-2 pb-1 text-center text-[10px] leading-tight",
  "[overflow-wrap:anywhere] text-coquille-doux hover:bg-nuit-3 hover:text-coquille-encre",
].join(" ");

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
      {/* Le filet de coquille a quitté ce composant pour `app/layout.tsx` : il
          coiffe la marque, pas la navigation, et l'écran de connexion — qui
          n'a pas de rail — en était privé. */}
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
                LIEN_RAIL,
                "max-md:h-14 max-md:w-auto max-md:flex-1 max-md:content-center",
                active ? "bg-nuit-3 font-semibold text-coquille-encre" : "",
              ].join(" ")}
            >
              <Icone className="size-5" />
              {libelle}
            </Link>
          );
        })}

        {/* Le pied du rail, que le produit n'avait pas : les maquettes y
            posent la bascule de thème et la déconnexion. Sur téléphone le rail
            passe en bas et devient une barre d'espaces — y ajouter deux
            entrées la surchargerait, et les réglages portent déjà les deux. */}
        <div className="mt-auto flex flex-col items-center gap-1 max-md:hidden">
          <BasculeTheme className={LIEN_RAIL} />
          <button type="button" onClick={() => void seDeconnecter()} className={LIEN_RAIL}>
            <LogOut aria-hidden="true" className="size-5" />
            Se déconnecter
          </button>
        </div>
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
      className="mb-3 block w-10 text-coquille-encre max-lg:hidden"
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
  role: Role;
}) {
  const groupes = groupesVisibles(espace, role);
  const courant = ecranCourant(espace, role, chemin);
  const repliee = useRepli();
  const comptes = useComptes();

  return (
    <nav
      aria-label={`Écrans de l’espace ${ESPACES[espace].libelle}`}
      className="colonne flex flex-col px-3 pt-4 pb-3 max-lg:hidden print:hidden"
    >
      <div className="mb-4 flex items-center gap-2">
        <h2 className="colonne-libelle font-display text-bloc font-bold tracking-tight text-coquille-encre">
          {ESPACES[espace].libelle}
        </h2>
        <BoutonRepli repliee={repliee} />
      </div>

      {/* La colonne défile, pas la coquille : à trois groupes plus la liste des
          boutiques, elle dépasse la fenêtre sur un portable — et le pied, qui
          dit qui est connecté, partait avec. */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {groupes.map((groupe) => (
          <section key={groupe.titre} className="pt-4 first-of-type:pt-0">
            {/* Chaque espace nomme ses groupes, et ce sont les mots de sa
                maquette. Replié, il ne reste que le filet : un sur-titre de
                onze pixels écrasé à 64 px de large ne dirait plus rien. */}
            <TitreGroupe repliee={repliee}>{groupe.titre}</TitreGroupe>
            <ul>
              {groupe.ecrans.map(({ href, libelle, compteur }) => (
                <li key={href}>
                  <LienColonne
                    href={href}
                    libelle={libelle}
                    icone={ICONE_ECRAN[href] ?? Activity}
                    actif={href === courant}
                    repliee={repliee}
                    compte={compteur ? comptes[compteur] : null}
                    quoiCompte="à traiter"
                  />
                </li>
              ))}
            </ul>
          </section>
        ))}

        {espace === "supervision" && <LesBoutiques repliee={repliee} chemin={chemin} />}
      </div>

      <PiedColonne repliee={repliee} />
    </nav>
  );
}

function TitreGroupe({ repliee, children }: { repliee: boolean; children: ReactNode }) {
  return (
    <h3
      className={[
        "px-2 pb-2 text-micro font-bold tracking-[0.09em] text-coquille-muet uppercase",
        repliee ? "sr-only" : "",
      ].join(" ")}
    >
      {children}
    </h3>
  );
}

/**
 * Une entrée de la colonne, et son compte s’il y en a un à dire.
 *
 * Le compte est un `span` avant tout, jamais une couleur : « 18 » suivi de
 * « à traiter » pour qui écoute l’écran, et le nombre seul pour qui le voit —
 * le libellé à côté dit déjà de quoi il s’agit.
 */
function LienColonne({
  href,
  libelle,
  icone: Icone,
  actif,
  repliee,
  compte,
  quoiCompte,
}: {
  href: string;
  libelle: string;
  icone: Icone;
  actif: boolean;
  repliee: boolean;
  compte: number | string | null;
  quoiCompte?: string;
}) {
  return (
    <Link
      href={href}
      aria-current={actif ? "page" : undefined}
      title={repliee ? libelle : undefined}
      className={[
        "flex items-center gap-2 rounded-champ border-l-2 px-2 py-[7px]",
        repliee ? "justify-center px-0" : "",
        /* Jamais la couleur seule : l'écran courant est marqué par le fond, le
           filet, la graisse et `aria-current`. */
        actif
          ? "border-l-coquille-encre bg-nuit-3 font-semibold text-coquille-encre"
          : "border-l-transparent text-coquille-doux hover:bg-nuit-3 hover:text-coquille-encre",
      ].join(" ")}
    >
      <Icone className="mt-0.5 size-4 shrink-0 self-start opacity-85" />
      {/* Le libellé se replie plutôt que de se couper : « Versements
          attendus » sortait en « Versements attend… », et une navigation qui
          tronque le mot qu'on cherche ne sert plus à chercher. 224 px ne
          tiennent pas tous les intitulés du métier sur une ligne. */}
      <span className="colonne-libelle min-w-0 flex-1">{libelle}</span>
      {compte !== null && (
        <span className="colonne-libelle colonne-compte mt-0.5 self-start">
          {compte}
          {quoiCompte && <span className="sr-only"> {quoiCompte}</span>}
        </span>
      )}
    </Link>
  );
}

/**
 * Les boutiques, dans la colonne du responsable.
 *
 * Ce n’est pas un ajout, c’est un déplacement de responsabilité : dans la
 * maquette `b2`, **naviguer vers une boutique se fait par la colonne**, ce qui
 * libère les cartes de l’écran de supervision pour porter des chiffres. Le
 * produit faisait l’inverse — ses cartes servaient à naviguer, et la colonne
 * était vide.
 *
 * Choisir une boutique ici change le périmètre **et** ouvre son espace : c’est
 * un seul geste dans la maquette, et le couper en deux ferait cliquer deux
 * fois pour une seule intention. Le bandeau confirme ensuite où l’on écrit.
 *
 * Les boutiques fermées n’y sont pas : elles restent lisibles dans les
 * réglages, et une navigation vers une boutique fermée ne mène nulle part.
 */
function LesBoutiques({ repliee, chemin }: { repliee: boolean; chemin: string }) {
  const { boutiques, perimetre, choisir } = usePerimetre();
  const actives = boutiques.filter((boutique) => boutique.actif);
  if (actives.length === 0) return null;

  return (
    <section className="pt-4">
      <TitreGroupe repliee={repliee}>Les boutiques</TitreGroupe>
      <ul>
        {actives.map((boutique) => {
          /* « Courante » veut dire : c'est cette boutique que je regarde, et je
             suis sur un écran qui en dépend. Sur la vue d'ensemble, aucune ne
             l'est — on y regarde justement le choix lui-même. */
          const actif =
            perimetre.boutiqueId === boutique.id && !sousChemin(chemin, ESPACES.supervision.href);
          return (
            <li key={boutique.id}>
              <button
                type="button"
                onClick={() => choisir(boutique.id)}
                title={repliee ? boutique.nom : undefined}
                aria-current={actif ? "true" : undefined}
                className={[
                  "flex w-full items-center gap-2 rounded-champ border-l-2 px-2 py-[7px] text-left",
                  repliee ? "justify-center px-0" : "",
                  actif
                    ? "border-l-coquille-encre bg-nuit-3 font-semibold text-coquille-encre"
                    : "border-l-transparent text-coquille-doux hover:bg-nuit-3 hover:text-coquille-encre",
                ].join(" ")}
              >
                <Store aria-hidden="true" className="mt-0.5 size-4 shrink-0 self-start opacity-85" />
                <span className="colonne-libelle min-w-0 flex-1">{boutique.nom}</span>
                {/* Le même creux que les comptes voisins, et non la plaque
                    jaune. D70 autorise le jaune sur un code boutique, mais la
                    maquette `b2:47` ne le prend pas ici — et elle a raison :
                    huit pavés jaunes empilés dans une colonne de navigation
                    referaient d'un signal une couleur de décor, ce que ce lot
                    corrige partout ailleurs. Le jaune reste où il tranche : le
                    bandeau, qui dit où l'on écrit. */}
                <span className="colonne-libelle colonne-compte">{boutique.code}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/**
 * Le pied de la colonne : qui est connecté, en permanence.
 *
 * Les maquettes le posent sous les groupes, et trois boutiques plus deux rôles
 * le rendent utile — sur un poste partagé au comptoir, savoir sous quel compte
 * on écrit vaut mieux que de s’en souvenir. Les réglages gardent la fiche
 * complète : l’un répond à *qui suis-je en ce moment*, l’autre à *que sait
 * l’application de moi* (arbitrage du commanditaire, 9 septembre 2026).
 *
 * Il mène aux réglages plutôt qu’à un dialogue de renommage : le produit ne
 * sait pas renommer un compte, et l’écrire ici serait ajouter une fonction
 * sous couvert de conformité (D72).
 */
function PiedColonne({ repliee }: { repliee: boolean }) {
  const session = useSession();
  const { perimetre, boutiques } = usePerimetre();
  if (session.statut !== "connecte") return null;

  const { nom, email, role } = session.utilisateur;
  const affiche = nom || email;
  const dessous =
    role === "responsable"
      ? `${LIBELLE_ROLE[role]} · ${compter(boutiques.filter((b) => b.actif).length, "boutique")}`
      : perimetre.type === "boutique"
        ? `${LIBELLE_ROLE[role]} · ${perimetre.nom}`
        : `${LIBELLE_ROLE[role]} · aucune boutique`;

  return (
    <Link
      href="/parametres"
      title={repliee ? `${affiche} — ${dessous}` : undefined}
      className={[
        "mt-3 flex shrink-0 items-center gap-2 rounded-champ border-t border-t-nuit-filet px-2 pt-3 pb-1 text-coquille-muet hover:text-coquille-encre",
        repliee ? "justify-center px-0" : "",
      ].join(" ")}
    >
      <UserRound aria-hidden="true" className="size-4 shrink-0" />
      <span className="colonne-libelle min-w-0 flex-1">
        <span className="block truncate font-semibold text-coquille-doux">{affiche}</span>
        <span className="block truncate text-micro">{dessous}</span>
      </span>
    </Link>
  );
}

function compter(nombre: number, mot: string): string {
  return `${nombre} ${mot}${nombre > 1 ? "s" : ""}`;
}

function sousChemin(chemin: string, href: string): boolean {
  return chemin === href || chemin.startsWith(`${href}/`);
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
