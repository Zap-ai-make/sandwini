/**
 * Les espaces de travail — ce que chacun voit de l'application.
 *
 * L'entreprise a trois espaces (`prompt.md` §1) : les boutiques de motos, la
 * boutique de pièces détachées, et la supervision. Aucun compte ne les voit
 * tous les trois de la même façon : le gérant vit dans l'espace du métier de sa
 * boutique, le responsable passe au-dessus.
 *
 * Sur le modèle de `peut()` dans `roles.ts` : une seule réponse à « cet espace
 * lui est-il ouvert ? », partagée par la navigation, les gardes de route et
 * l'accueil. Sans ce point unique, la barre affiche une entrée que l'écran
 * refuse ensuite — un lien mort, et l'impression que l'application est cassée.
 *
 * Ces fonctions décident de ce qu'on **affiche**, pas de ce qui est **permis** :
 * la permission se joue dans les règles Firestore (`DECISIONS.md` D27).
 */

import type { Metier } from "./boutique";
import { peut, type Capacite, type Role } from "./roles";

export type Espace = "supervision" | "accueil" | "motos" | "pieces" | "caisse" | "reglages";

export const ESPACES: Record<Espace, { href: string; libelle: string }> = {
  supervision: { href: "/supervision", libelle: "Supervision" },
  accueil: { href: "/dashboard", libelle: "Accueil" },
  motos: { href: "/motos", libelle: "Motos" },
  pieces: { href: "/pieces", libelle: "Pièces" },
  caisse: { href: "/caisse", libelle: "Caisse" },
  reglages: { href: "/parametres", libelle: "Réglages" },
};

/** L'espace qui porte un métier, et le métier qu'il demande. */
const METIER_DE: Partial<Record<Espace, Metier>> = {
  motos: "motos",
  pieces: "pieces",
};

/** Le métier qu'un espace exige, s'il en exige un. */
export function metierDeLEspace(espace: Espace): Metier | null {
  return METIER_DE[espace] ?? null;
}

/**
 * Là où chacun atterrit après la connexion.
 *
 * Le responsable ouvre sur la supervision, parce que c'est de là qu'il choisit
 * la boutique qu'il regarde. Le gérant n'a pas ce choix : son accueil est celui
 * de sa boutique.
 */
export function accueilDuRole(role: Role): string {
  return peut(role, "acceder_supervision") ? ESPACES.supervision.href : ESPACES.accueil.href;
}

/**
 * Les espaces ouverts à ce rôle sur ce périmètre, dans l'ordre de la journée :
 * on regarde d'où l'on part, on vend, on compte la caisse, et les réglages
 * ferment la marche.
 *
 * `metiers` vide — un périmètre encore en cours de chargement, ou une entreprise
 * sans boutique — ne rend que les espaces dont la réponse est certaine. Mieux
 * vaut une barre courte qui s'allonge qu'une entrée qui disparaît sous le doigt.
 */
export function espacesVisibles(role: Role, metiers: readonly Metier[]): Espace[] {
  const ordre: Espace[] = peut(role, "acceder_supervision")
    ? ["supervision", "motos", "pieces", "caisse", "reglages"]
    : ["accueil", "motos", "pieces", "caisse", "reglages"];

  return ordre.filter((espace) => accedeEspace(role, metiers, espace));
}

/** Cet espace est-il ouvert à ce rôle sur ce périmètre ? */
export function accedeEspace(role: Role, metiers: readonly Metier[], espace: Espace): boolean {
  if (espace === "supervision") return peut(role, "acceder_supervision");
  if (espace === "accueil") return !peut(role, "acceder_supervision");

  const metier = METIER_DE[espace];
  return metier ? metiers.includes(metier) : true;
}

/* --------------------------------------------------------------------------
   Le second niveau — les écrans de l'espace courant.

   C'est la réponse au défaut n°1 du diagnostic : quinze écrans réels, une barre
   à cinq entrées, et sept écrans de l'espace motos qui n'apparaissaient dans
   aucune navigation. On y arrivait par des liens dispersés dans les pages, et
   rien ne disait où l'on était.

   Les écrans sont groupés par **intention du métier** — vendre, suivre,
   administrer — et non par type d'objet, qui aurait été le réflexe. Un gérant
   ne cherche pas « la liste des ventes » : il cherche quoi faire maintenant, ou
   ce qu'il doit surveiller. Le groupe répond avant le libellé.
   -------------------------------------------------------------------------- */

export type Intention = "vendre" | "suivre" | "administrer";

export const LIBELLE_INTENTION: Record<Intention, string> = {
  vendre: "Vendre",
  suivre: "Suivre",
  administrer: "Administrer",
};

/** L'ordre des groupes dans la colonne : celui de la journée. */
export const INTENTIONS: readonly Intention[] = ["vendre", "suivre", "administrer"];

export type EcranDEspace = {
  href: string;
  libelle: string;
  intention: Intention;
  /** Sans elle, l'entrée est ouverte à tous les rôles qui voient l'espace. */
  capacite?: Capacite;
  /**
   * Ce qu'on y fait, en une ligne — pour les écrans où le libellé seul ne
   * suffit pas à choisir.
   *
   * La colonne de gauche ne l'affiche pas : 224 px n'expliquent rien. C'est le
   * hub des réglages qui la lit (`components/patrons/Hub.tsx`), là où
   * « Référentiels » et « Catalogue » sont deux mots que seul leur auteur
   * distingue. Elle vit ici pour que la navigation et le hub ne puissent pas
   * diverger : ce sont les mêmes écrans, avec les mêmes droits.
   */
  quoi?: string;
};

/**
 * Ce que porte chaque espace.
 *
 * Les libellés sont ceux du produit, repris mot pour mot : ce sont eux que la
 * suite bout en bout interroge, et eux que le gérant a appris.
 */
export const ECRANS_DE: Record<Espace, readonly EcranDEspace[]> = {
  supervision: [
    { href: "/supervision", libelle: "Vue d’ensemble", intention: "suivre" },
    { href: "/clients", libelle: "Clients", intention: "administrer" },
  ],
  accueil: [
    { href: "/dashboard", libelle: "Ma journée", intention: "suivre" },
    { href: "/clients", libelle: "Clients", intention: "administrer" },
  ],
  motos: [
    { href: "/motos/ventes/nouvelle", libelle: "Nouvelle vente", intention: "vendre" },
    { href: "/motos", libelle: "Stock motos", intention: "vendre" },
    { href: "/motos/nouvelle", libelle: "Faire entrer une moto", intention: "vendre" },
    { href: "/motos/ventes", libelle: "Ventes", intention: "suivre" },
    { href: "/motos/paiements", libelle: "Paiements", intention: "suivre" },
    { href: "/motos/dossiers", libelle: "Dossiers en attente", intention: "suivre" },
    { href: "/motos/recus", libelle: "Reçus", intention: "suivre" },
    { href: "/clients", libelle: "Clients", intention: "administrer" },
  ],
  pieces: [{ href: "/pieces", libelle: "Pièces détachées", intention: "vendre" }],
  caisse: [{ href: "/caisse", libelle: "Journal de caisse", intention: "suivre" }],
  reglages: [
    {
      href: "/parametres/entreprise",
      libelle: "Identité de l’entreprise",
      intention: "administrer",
      capacite: "gerer_referentiels",
      quoi: "L’en-tête imprimé sur les reçus, et le délai des tranches inactives",
    },
    {
      href: "/parametres/boutiques",
      libelle: "Boutiques",
      intention: "administrer",
      capacite: "gerer_boutiques",
      quoi: "Déclarer un point de vente, son code et ses coordonnées",
    },
    {
      href: "/parametres/utilisateurs",
      libelle: "Utilisateurs",
      intention: "administrer",
      capacite: "gerer_utilisateurs",
      quoi: "Créer un gérant, désactiver un compte",
    },
    {
      href: "/parametres/catalogue",
      libelle: "Marques et modèles",
      intention: "administrer",
      capacite: "gerer_referentiels",
      quoi: "Ce que vous vendez",
    },
    {
      href: "/parametres/referentiels",
      libelle: "Provenances et frais",
      intention: "administrer",
      capacite: "gerer_referentiels",
      quoi: "D’où viennent les motos, ce qui s’ajoute à leur prix d’achat",
    },
    {
      href: "/parametres/prestataires",
      libelle: "Prestataires",
      intention: "administrer",
      capacite: "gerer_referentiels",
      quoi: "Qui traite les cartes grises et les plaques",
    },
    {
      href: "/diagnostic",
      libelle: "Synchronisation",
      intention: "suivre",
      /* Sans cette phrase, le hub des réglages l'écartait : il ne montre que
         les destinations qui savent dire ce qu'on y fait. Un écran présent
         dans la colonne et absent du hub est un écran qu'on croit disparu. */
      quoi: "Ce qui reste à envoyer depuis cet appareil, et depuis quand",
    },
  ],
};

/**
 * Les écrans de cet espace ouverts à ce rôle.
 *
 * Même principe que `espacesVisibles` : on n'affiche pas une entrée qu'une
 * garde refusera ensuite. Un gérant qui voit « Utilisateurs » et tombe sur
 * « Réservé au responsable » apprend que l'application est cassée.
 */
export function ecransVisibles(espace: Espace, role: Role): EcranDEspace[] {
  return ECRANS_DE[espace].filter(({ capacite }) => !capacite || peut(role, capacite));
}

/**
 * Dans quel espace se trouve ce chemin.
 *
 * Deux pièges, et il a fallu les deux pour que la colonne dise la vérité.
 *
 * **Le plus précis gagne.** Sans cela `/motos/ventes/nouvelle` serait attribué
 * à `/motos`, et la colonne surlignerait « Stock motos » pendant qu'on saisit
 * une vente. Un repère qui désigne le mauvais écran est pire que pas de repère.
 *
 * **On ne choisit qu'entre les espaces ouverts.** `/clients` appartient à
 * plusieurs espaces à la fois — c'est un fichier commun (D16) — et le premier
 * venu était la supervision. Un gérant qui ouvrait la liste des clients voyait
 * donc la colonne du responsable, avec un lien que sa propre garde lui aurait
 * refusé. D'où `ouverts` : la déduction ne peut pas sortir de ce que cette
 * personne a le droit de voir.
 */
export function espaceDuChemin(chemin: string, ouverts: readonly Espace[]): Espace | null {
  let trouve: Espace | null = null;
  let longueur = -1;
  for (const espace of ouverts) {
    for (const { href } of ECRANS_DE[espace]) {
      if (sousChemin(chemin, href) && href.length > longueur) {
        trouve = espace;
        longueur = href.length;
      }
    }
  }
  if (trouve) return trouve;

  for (const espace of ouverts) {
    if (sousChemin(chemin, ESPACES[espace].href)) return espace;
  }
  return null;
}

/**
 * L'écran de la colonne que ce chemin désigne — un seul, jamais deux.
 *
 * Marquer « actif » toute entrée dont le lien est un préfixe du chemin en
 * allumait deux à la fois : `/motos/dossiers` commence par `/motos`, donc
 * « Stock motos » se croyait courante en même temps que « Dossiers en attente ».
 * Un repère qui désigne deux écrans ne désigne plus rien. On garde donc le lien
 * le plus long qui corresponde — la même règle que pour l'espace, et pour la
 * même raison.
 */
export function ecranCourant(espace: Espace, role: Role, chemin: string): string | null {
  let trouve: string | null = null;
  for (const { href } of ecransVisibles(espace, role)) {
    if (sousChemin(chemin, href) && (trouve === null || href.length > trouve.length)) {
      trouve = href;
    }
  }
  return trouve;
}

function sousChemin(chemin: string, href: string): boolean {
  return chemin === href || chemin.startsWith(`${href}/`);
}
