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

import { type Metier } from "./boutique";
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
export function espacesVisibles(
  role: Role,
  metiers: readonly Metier[],
  perimetre: PortéeDuPerimetre = "toutes",
): Espace[] {
  const ordre: Espace[] = surveille(role, perimetre)
    ? ["supervision", "motos", "pieces", "caisse", "reglages"]
    : ["accueil", "motos", "pieces", "caisse", "reglages"];

  return ordre.filter((espace) => accedeEspace(role, metiers, espace, perimetre));
}

/**
 * L'étendue de ce que l'on regarde : l'entreprise, ou une boutique.
 *
 * C'est `Perimetre.type` de `lib/perimetre`, repris ici en type minimal pour
 * que ce fichier reste une fonction pure sans rien importer de React.
 * `aucune` — pas encore de boutique déclarée — se comporte comme `toutes` :
 * il n'y a pas de boutique dans laquelle descendre.
 */
export type PortéeDuPerimetre = "toutes" | "boutique" | "aucune";

/**
 * Ce compte surveille-t-il, ou travaille-t-il dans une boutique ?
 *
 * **Le responsable qui choisit une boutique travaille dedans.** Tant que la
 * plaque annonce « Toutes les boutiques », il est au-dessus et la supervision
 * est son point de vue ; dès qu'il nomme une boutique, il veut l'interface de
 * cette boutique — celle que son gérant voit — et non un poste d'observation
 * qui en parlerait à la troisième personne. La plaque redevient le chemin du
 * retour, et c'est le seul.
 *
 * Le gérant, lui, ne surveille jamais : la condition ne le concerne pas.
 */
function surveille(role: Role, perimetre: PortéeDuPerimetre): boolean {
  return peut(role, "acceder_supervision") && perimetre !== "boutique";
}

/**
 * Où emmener quelqu'un dont la plaque vient de changer, ou `null` pour le
 * laisser où il est.
 *
 * **Le cas qui oblige à cette fonction.** Choisir une boutique depuis la vue
 * d'ensemble retirait « Supervision » du rail sans fermer l'écran de
 * supervision : on se retrouvait sur une page dont l'entrée n'existait plus,
 * et donc sans moyen d'y revenir après l'avoir quittée. Un écran qu'aucune
 * navigation ne mentionne est un écran qu'on croit disparu.
 *
 * **L'écran réservé est l'exception, et elle n'est pas cosmétique.**
 * `/supervision/chiffres` — l'Inventaire — a gardé son URL en déménageant dans
 * l'espace motos. Le traiter comme « de la supervision » d'après son chemin le
 * fermerait au moment précis où l'on choisit la boutique dont on veut lire les
 * chiffres. C'est le rangement qui compte, pas l'orthographe de l'adresse.
 * (`/supervision/couts` était le second ; S54 l'a retiré, la saisie du prix
 * d'achat ayant rejoint la fiche de la moto.)
 */
export function destinationApresPerimetre(
  chemin: string,
  role: Role,
  perimetre: PortéeDuPerimetre,
): string | null {
  /* Un gérant ne change pas de périmètre : le déplacer serait le chasser d'un
     écran légitime pour une transition qui ne le concerne pas. */
  if (!peut(role, "acceder_supervision")) return null;

  const reserve = ECRANS_DE.motos.some((ecran) => ecran.href === chemin);
  if (perimetre === "boutique") {
    return sousChemin(chemin, ESPACES.supervision.href) && !reserve
      ? ESPACES.accueil.href
      : null;
  }
  return chemin === ESPACES.accueil.href ? ESPACES.supervision.href : null;
}

/** Cet espace est-il ouvert à ce rôle sur ce périmètre ? */
export function accedeEspace(
  role: Role,
  metiers: readonly Metier[],
  espace: Espace,
  perimetre: PortéeDuPerimetre = "toutes",
): boolean {
  if (espace === "supervision") return surveille(role, perimetre);
  if (espace === "accueil") return !surveille(role, perimetre);

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
   * Cette entrée exige-t-elle qu'une boutique soit choisie ?
   *
   * Troisième axe, après le droit (`capacite`) et le métier de l'espace.
   * Certains gestes n'ont **aucun sens** sur « Toutes les boutiques » : faire
   * entrer une moto, enregistrer une vente. Ils réclament un `boutiqueId`, et
   * la vue d'ensemble n'en a pas à donner.
   *
   * Les proposer quand même, c'est le défaut que S54 corrige : le produit
   * ouvrait une porte pour s'excuser derrière, avec un écran « choisissez une
   * boutique ». Une entrée qu'on ne peut pas suivre vaut moins qu'une entrée
   * absente — le rail dit alors la vérité sur ce qu'on peut faire d'ici.
   *
   * C'est un filtre d'**affichage**. Ce qui protège réellement reste la règle
   * Firestore, qui exige un `boutiqueId` valide (D27).
   */
  exigeBoutique?: true;
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
      /**
       * La supervision ne porte plus qu'un écran, et c'est le sujet de S54.
       *
       * **Ventes, Paiements et Dossiers en sont partis**, à la demande du
       * commanditaire : ils appartiennent au métier, donc aux espaces Motos et
       * Pièces. Les voir ici aussi faisait croire à deux listes là où il n'y en
       * a qu'une — « trop d'écrans pour ça ».
       *
       * **Et ce doublon était un défaut, pas seulement un encombrement.**
       * `espaceDuChemin` départage deux espaces candidats par la longueur du
       * chemin ; pour `/motos/ventes`, déclaré ici *et* dans l'espace motos,
       * les deux longueurs étaient égales et c'est le premier de la liste qui
       * gagnait — la supervision. Ouvrir les ventes depuis l'espace motos
       * ramenait donc la colonne de la supervision. Le doublon retiré, la
       * question ne se pose plus : un écran, un espace.
       */
      titre: "Le commerce",
      ecrans: [{ href: "/supervision", libelle: "Vue d’ensemble" }],
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
        /* Un renvoi depuis S44 : la vente est une modale posée sur le registre,
           et non plus un écran à elle. L'entrée ouvre donc `/motos/ventes` avec
           son paramètre — elle mentionne cet écran, elle ne le possède pas, et
           c'est « Ventes » que la colonne allume pendant la saisie. */
        { href: "/motos/ventes?nouvelle=1", libelle: "Nouvelle vente", renvoi: true, exigeBoutique: true },
        { href: "/motos/nouvelle", libelle: "Faire entrer une moto", exigeBoutique: true },
      ],
    },
    {
      titre: "Suivre",
      ecrans: [
        { href: "/motos", libelle: "Stock motos" },
        { href: "/motos/arrivages", libelle: "Arrivages" },
        { href: "/motos/ventes", libelle: "Ventes" },
        { href: "/motos/paiements", libelle: "Paiements", compteur: "tranches" },
        { href: "/motos/dossiers", libelle: "Dossiers", compteur: "dossiers" },
      ],
    },
    {
      /* « Le fichier », et non « Administrer » : on ne gère pas un client, on
         le retrouve. C'est le mot de la maquette `b1`. */
      titre: "Le fichier",
      ecrans: [{ href: "/clients", libelle: "Clients" }],
    },
    {
      /**
       * Les deux écrans que seul le responsable ouvre, rangés là où ils
       * servent plutôt que dans un espace à part.
       *
       * Ils vivaient sous la supervision, qui disparaît du rail dès qu'une
       * boutique est choisie — c'est-à-dire exactement quand on en a besoin :
       * le prix d'achat se pose sur une moto, dans une boutique. Ils descendent
       * donc dans l'espace motos, gardés par `capacite` comme tout le reste.
       *
       * **Leurs URL ne bougent pas.** Aucune redirection à écrire, aucun lien
       * existant cassé, aucun signet mort : seul leur rangement change. Et
       * `/supervision/chiffres` y gagne au passage une entrée de navigation —
       * il n'en avait aucune, et n'était atteignable que par un bouton de la
       * vue d'ensemble.
       *
       * La garde d'affichage ne protège rien : le cloisonnement réel est en
       * sous-collection `prive/` et dans les règles Firestore (D2, D27).
       */
      titre: "Réservé au responsable",
      ecrans: [
        /* « Inventaire » et non « Chiffres du mois » (S54) : l'écran ne parle
           plus que du mois — son bilan de période couvre l'intervalle qu'on
           veut, et c'est le mot qu'emploie le commanditaire. */
        { href: "/supervision/chiffres", libelle: "Inventaire", capacite: "voir_marges" },
      ],
    },
  ],
  pieces: [
    {
      titre: "Suivre",
      ecrans: [
        { href: "/pieces", libelle: "Catalogue" },
        /* Créer une référence appartient au responsable : une référence porte
           un prix (S20, réponse 4). Le gérant voit le catalogue et fait bouger
           le stock depuis la ligne qu'il touche. */
        {
          href: "/pieces/nouvelle",
          libelle: "Nouvelle référence",
          capacite: "gerer_referentiels",
          quoi: "Ajouter une pièce au catalogue commun à l’entreprise",
        },
      ],
    },
  ],
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
export function groupesVisibles(
  espace: Espace,
  role: Role,
  portee: PortéeDuPerimetre = "boutique",
): GroupeDEcrans[] {
  return GROUPES_DE[espace]
    .map((groupe) => ({
      titre: groupe.titre,
      ecrans: groupe.ecrans.filter((ecran) => ouverte(ecran, role, portee)),
    }))
    .filter((groupe) => groupe.ecrans.length > 0);
}

export function ecransVisibles(
  espace: Espace,
  role: Role,
  portee: PortéeDuPerimetre = "boutique",
): EcranDEspace[] {
  return ECRANS_DE[espace].filter((ecran) => ouverte(ecran, role, portee));
}

/**
 * Cette entrée paraît-elle ? Deux axes, et il faut les deux.
 *
 * Le droit (`capacite`) et la portée du périmètre (`exigeBoutique`). Les deux
 * filtres vivent ici plutôt que recopiés dans les deux fonctions au-dessus :
 * c'est l'endroit unique où l'on décide qu'une entrée se montre, et c'est ce
 * qui empêche la colonne et la palette de commandes de diverger.
 *
 * **Le métier a disparu de ce filtre, et ce n'est pas un oubli.** Il n'y
 * servait qu'aux trois entrées motos de la supervision, parties en S54 ; le
 * métier se joue un cran plus haut, dans `accedeEspace`, qui décide si
 * l'espace s'ouvre. Garder ici un axe sans usager aurait fait un mécanisme
 * documenté que plus rien n'emprunte — exactement la demi-amputation que S48 a
 * laissée derrière elle sur la plaque, et qu'on ne refait pas.
 */
function ouverte(ecran: EcranDEspace, role: Role, portee: PortéeDuPerimetre): boolean {
  if (ecran.capacite && !peut(role, ecran.capacite)) return false;
  return !ecran.exigeBoutique || portee === "boutique";
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
