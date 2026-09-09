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

   Les écrans sont groupés, et **chaque espace nomme ses groupes**. C'est ce
   que fait chaque maquette : « Le commerce » et « Les boutiques » chez le
   responsable, « Vendre / Suivre / Le fichier » dans l'espace motos, « Ma
   journée / Ce qui m'attend » sur l'accueil du gérant, « L'entreprise / Le
   catalogue / Cet appareil » dans les réglages.

   Le dépôt imposait trois intentions globales — vendre, suivre, administrer —
   aux quatre espaces à la fois. L'idée était juste : un gérant ne cherche pas
   « la liste des ventes », il cherche quoi faire maintenant. Mais un seul jeu
   de trois mots ne peut pas dire la même chose à quatre endroits, et il
   forçait des rangements faux — « Clients » sous « Administrer » alors que
   c'est un fichier qu'on consulte, les sept écrans de réglages dans un seul
   tas là où la maquette en fait trois. Les groupes descendent donc dans
   l'espace, avec leur titre (S31).
   -------------------------------------------------------------------------- */

export type EcranDEspace = {
  href: string;
  libelle: string;
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
  /**
   * Ce que l'entrée annonce, en chiffre, avant qu'on l'ouvre.
   *
   * « Paiements 31 », « Dossiers 18 » : la colonne dit ce qu'on trouvera
   * derrière, comme le hub des réglages le fait en toutes lettres depuis A9.
   * Le nom désigne le calcul, pas la valeur — celle-ci vient de l'écoute du
   * périmètre courant, et ce fichier reste une fonction pure.
   *
   * Un compte à zéro ne s'affiche pas : c'est la règle de D63, et une pastille
   * « 0 » ment sur l'état du commerce exactement comme une carte à zéro.
   */
  compteur?: Compteur;
  /**
   * L'entrée mène à un écran qui vit dans un **autre** espace.
   *
   * L'accueil du gérant renvoie vers les dossiers et les paiements, qui
   * appartiennent à l'espace motos : la maquette `a3` les liste sous « Ce qui
   * m'attend », et cliquer y emmène — la colonne devient alors celle des
   * motos, ce qui est juste, on a changé d'espace.
   *
   * Sans ce drapeau, `espaceDuChemin` attribuerait `/motos/dossiers` à
   * l'accueil, qui le mentionne le premier, et le gérant lisant sa file
   * verrait la colonne de son accueil au lieu de celle des motos. Un renvoi
   * n'est donc jamais candidat à désigner l'espace ni l'écran courant.
   *
   * Le responsable, lui, n'en a pas : sa maquette `b2` garde la colonne de
   * supervision **en affichant** les ventes. Chez lui, ces écrans
   * appartiennent bien à la supervision.
   */
  renvoi?: true;
};

/** Les calculs que la colonne sait annoncer. */
export type Compteur = "dossiers" | "tranches";

export type GroupeDEcrans = {
  /** Le titre du groupe, tel que la maquette de cet espace le nomme. */
  titre: string;
  ecrans: readonly EcranDEspace[];
};

/**
 * Ce que porte chaque espace, groupe par groupe.
 *
 * Les libellés sont ceux du produit, repris mot pour mot : ce sont eux que la
 * suite bout en bout interroge, et eux que le gérant a appris.
 */
export const GROUPES_DE: Record<Espace, readonly GroupeDEcrans[]> = {
  supervision: [
    {
      titre: "Le commerce",
      ecrans: [
        { href: "/supervision", libelle: "Vue d’ensemble" },
        { href: "/motos/ventes", libelle: "Ventes" },
        { href: "/motos/paiements", libelle: "Paiements", compteur: "tranches" },
        { href: "/motos/dossiers", libelle: "Dossiers", compteur: "dossiers" },
      ],
    },
    /* « Les boutiques » n'est pas ici : c'est une liste de données, pas
       d'écrans, et elle change avec l'entreprise. La colonne la monte depuis
       le périmètre (`components/NavigationPrincipale.tsx`). */
  ],
  accueil: [
    {
      titre: "Ma journée",
      ecrans: [{ href: "/dashboard", libelle: "Aujourd’hui" }],
    },
    {
      titre: "Ce qui m’attend",
      ecrans: [
        { href: "/motos/dossiers", libelle: "À faire", compteur: "dossiers", renvoi: true },
        {
          href: "/motos/paiements",
          libelle: "Versements attendus",
          compteur: "tranches",
          renvoi: true,
        },
      ],
    },
  ],
  motos: [
    {
      titre: "Vendre",
      ecrans: [
        { href: "/motos/ventes/nouvelle", libelle: "Nouvelle vente" },
        { href: "/motos/nouvelle", libelle: "Faire entrer une moto" },
      ],
    },
    {
      titre: "Suivre",
      ecrans: [
        { href: "/motos", libelle: "Stock motos" },
        { href: "/motos/ventes", libelle: "Ventes" },
        { href: "/motos/paiements", libelle: "Paiements", compteur: "tranches" },
        { href: "/motos/dossiers", libelle: "Dossiers", compteur: "dossiers" },
        { href: "/motos/recus", libelle: "Reçus" },
      ],
    },
    {
      /* « Le fichier », et non « Administrer » : on ne gère pas un client, on
         le retrouve. C'est le mot de la maquette `b1`. */
      titre: "Le fichier",
      ecrans: [{ href: "/clients", libelle: "Clients" }],
    },
  ],
  pieces: [{ titre: "Vendre", ecrans: [{ href: "/pieces", libelle: "Pièces détachées" }] }],
  caisse: [{ titre: "Suivre", ecrans: [{ href: "/caisse", libelle: "Journal de caisse" }] }],
  reglages: [
    {
      titre: "L’entreprise",
      ecrans: [
        {
          href: "/parametres/entreprise",
          libelle: "Identité de l’entreprise",
          capacite: "gerer_referentiels",
          quoi: "L’en-tête imprimé sur les reçus, et le délai des tranches inactives",
        },
        {
          href: "/parametres/boutiques",
          libelle: "Boutiques",
          capacite: "gerer_boutiques",
          quoi: "Déclarer un point de vente, son code et ses coordonnées",
        },
        {
          href: "/parametres/utilisateurs",
          libelle: "Utilisateurs",
          capacite: "gerer_utilisateurs",
          quoi: "Créer un gérant, désactiver un compte",
        },
      ],
    },
    {
      titre: "Le catalogue",
      ecrans: [
        {
          href: "/parametres/catalogue",
          libelle: "Marques et modèles",
          capacite: "gerer_referentiels",
          quoi: "Ce que vous vendez",
        },
        {
          href: "/parametres/referentiels",
          libelle: "Provenances et frais",
          capacite: "gerer_referentiels",
          quoi: "D’où viennent les motos, ce qui s’ajoute à leur prix d’achat",
        },
        {
          href: "/parametres/prestataires",
          libelle: "Prestataires",
          capacite: "gerer_referentiels",
          quoi: "Qui traite les cartes grises et les plaques",
        },
      ],
    },
    {
      titre: "Cet appareil",
      ecrans: [
        {
          href: "/diagnostic",
          libelle: "Synchronisation",
          /* Sans cette phrase, le hub des réglages l'écartait : il ne montre
             que les destinations qui savent dire ce qu'on y fait. Un écran
             présent dans la colonne et absent du hub est un écran qu'on croit
             disparu. */
          quoi: "Ce qui reste à envoyer depuis cet appareil, et depuis quand",
        },
      ],
    },
  ],
};

/**
 * Les écrans d'un espace, à plat.
 *
 * Dérivé, jamais saisi deux fois : deux listes finissent toujours par répondre
 * deux choses (D73). Le hub des réglages et la palette de commandes lisent
 * celle-ci ; la colonne lit les groupes.
 */
export const ECRANS_DE: Record<Espace, readonly EcranDEspace[]> = Object.fromEntries(
  (Object.keys(GROUPES_DE) as Espace[]).map(
    (espace) => [espace, GROUPES_DE[espace].flatMap((groupe) => groupe.ecrans)] as const,
  ),
) as unknown as Record<Espace, readonly EcranDEspace[]>;

/**
 * Les groupes de cet espace ouverts à ce rôle, les groupes vidés retirés.
 *
 * Un titre de groupe sans entrée sous lui est un rangement qui ment : le
 * gérant qui n'a droit à aucun écran d'administration ne doit pas lire
 * « L'entreprise » suivi de rien.
 */
export function groupesVisibles(espace: Espace, role: Role): GroupeDEcrans[] {
  return GROUPES_DE[espace]
    .map((groupe) => ({
      titre: groupe.titre,
      ecrans: groupe.ecrans.filter(({ capacite }) => !capacite || peut(role, capacite)),
    }))
    .filter((groupe) => groupe.ecrans.length > 0);
}

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
    for (const { href, renvoi } of ECRANS_DE[espace]) {
      /* Un renvoi mentionne un écran, il ne le possède pas : l'accueil du
         gérant pointe vers les dossiers, qui restent ceux de l'espace motos. */
      if (renvoi) continue;
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
  for (const { href, renvoi } of ecransVisibles(espace, role)) {
    /* Même raison que dans `espaceDuChemin` : on n'allume pas un renvoi, on
       est déjà parti dans l'espace qu'il désigne. */
    if (renvoi) continue;
    if (sousChemin(chemin, href) && (trouve === null || href.length > trouve.length)) {
      trouve = href;
    }
  }
  return trouve;
}

function sousChemin(chemin: string, href: string): boolean {
  return chemin === href || chemin.startsWith(`${href}/`);
}
