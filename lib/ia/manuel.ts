import type { Role } from "@/lib/domain/roles";

/**
 * Le mode d'emploi de SDI, que l'assistant consulte au lieu de l'improviser.
 *
 * **Pourquoi il ne vit pas dans le prompt.** Décrire l'application dans les
 * instructions aurait deux effets, tous les deux mauvais : le prompt part à
 * chaque message et serait payé à chaque fois, et surtout un modèle qui
 * paraphrase une description finit par inventer un bouton qui n'existe pas.
 * Quelqu'un le cherche alors pendant dix minutes avant de conclure que
 * l'application est cassée. Ici l'assistant lit une fiche écrite, ou il dit
 * qu'il ne sait pas.
 *
 * **Ce que chaque fiche promet, et ce qu'elle ne promet pas.** Elle dit l'écran
 * où le geste commence, ce qu'il faut avoir sous la main, l'ordre des étapes et
 * le piège classique. Elle ne nomme **aucun bouton** : les libellés changent
 * d'un lot à l'autre, et une fiche qui cite « Enregistrer la vente » vieillit
 * sans que personne ne s'en aperçoive. L'écran, lui, est vérifié sur le disque
 * par un test — c'est la seule partie qu'on puisse garantir.
 *
 * **Le mur de D2 passe aussi par ici.** Expliquer à un gérant comment poser un
 * prix d'achat lui apprendrait l'existence d'un écran que sa garde lui refuse.
 * Les fiches qui touchent aux coûts sont donc marquées, et `trouverFiche` les
 * retire — pas le modèle, qui pourrait l'oublier.
 */

/** Les rubriques, dans l'ordre d'une journée de travail. */
export const THEMES = ["motos", "argent", "papiers", "pieces", "application"] as const;
export type Theme = (typeof THEMES)[number];

export const LIBELLE_THEME: Record<Theme, string> = {
  motos: "Les motos",
  argent: "L’argent",
  papiers: "Les papiers",
  pieces: "Les pièces détachées",
  application: "L’application",
};

export type Fiche = {
  /** Le mot que le modèle emploie pour la demander. */
  cle: string;
  theme: Theme;
  titre: string;
  /** À quoi ça sert, en une phrase : c'est ce qui fait choisir la fiche. */
  quand: string;
  /** La clé d'une destination, ou `null` quand le geste n'a pas d'écran. */
  ecran: string | null;
  etapes: readonly string[];
  /** Le piège qu'on ne voit qu'après l'avoir payé. */
  attention?: string;
  /** Réservée au responsable : elle parle de ce que le gérant ne voit pas. */
  responsable?: true;
};

export const FICHES: readonly Fiche[] = [
  /* --- Les motos ---------------------------------------------------------- */
  {
    cle: "vendre_une_moto",
    theme: "motos",
    titre: "Vendre une moto",
    quand: "Un client achète une moto, qu’il paie comptant, à crédit ou par tranches.",
    ecran: "nouvelle_vente",
    etapes: [
      "Vérifiez d’abord quelle boutique est affichée en haut : c’est elle qui portera la vente.",
      "Choisissez la moto dans le stock, puis le client dans le fichier. Si le client est nouveau, créez-le au passage.",
      "Posez le prix convenu — c’est celui qu’on a négocié, pas le prix conseillé.",
      "Choisissez comment il paie : comptant, crédit, ou tranches.",
      "Saisissez ce qu’il dépose aujourd’hui, puis validez. Le reçu suit.",
    ],
    attention:
      "Crédit et tranches ne sont pas la même vente. À crédit, la moto part avec le client et il doit de l’argent. En tranches, la moto reste au magasin jusqu’au dernier franc. Se tromper, c’est laisser partir une moto qui n’est pas payée.",
  },
  {
    cle: "faire_entrer_une_moto",
    theme: "motos",
    titre: "Faire entrer une moto en stock",
    quand: "Une moto arrive au magasin et doit exister dans l’application avant d’être vendue.",
    ecran: "faire_entrer_une_moto",
    etapes: [
      "Choisissez une boutique : une moto entre quelque part, pas dans l’entreprise en général.",
      "Déclarez la marque et le modèle. S’ils n’existent pas encore, il faut les créer avant.",
      "Saisissez le numéro de châssis, la couleur et l’année.",
      "Cochez les papiers qui arrivent avec elle — quittance, CMC — s’ils sont dans le carton.",
    ],
    attention:
      "Le châssis est l’identité de la moto, plus que sa plaque. Recopiez-le caractère par caractère, sans chercher à atteindre une longueur : selon la marque il en fait dix, douze, parfois plus. Une erreur ici ne se découvre qu’à la préfecture, des semaines plus tard, sur un dossier déjà payé.",
  },
  {
    cle: "voir_le_stock",
    theme: "motos",
    titre: "Savoir ce qu’on a en magasin",
    quand: "On veut voir les motos disponibles, en chercher une, ou vérifier ses papiers.",
    ecran: "stock_motos",
    etapes: [
      "Ouvrez le stock : il montre les motos de la boutique affichée en haut.",
      "Cherchez par marque, modèle ou châssis — les trois marchent.",
      "Pour voir toutes les boutiques d’un coup, repassez le périmètre sur l’entreprise entière.",
    ],
  },
  {
    cle: "inventaire",
    theme: "motos",
    titre: "Faire l’inventaire",
    quand: "On veut compter ce qu’on détient et repérer ce qui dort depuis trop longtemps.",
    ecran: "inventaire",
    etapes: [
      "Ouvrez l’inventaire : il compte les motos et dit depuis quand chacune est là.",
      "Sur une boutique, c’est son inventaire ; sur l’entreprise entière, c’est le total.",
      "Ce qui dort depuis plusieurs mois est ce qu’il faut regarder en premier.",
    ],
    attention:
      "L’inventaire se lit à deux niveaux — chaque gérant pour sa boutique, et le total au-dessus. C’est le même écran, c’est le périmètre affiché en haut qui décide.",
  },
  {
    cle: "arrivage",
    theme: "motos",
    titre: "Enregistrer un arrivage",
    quand: "Plusieurs motos arrivent ensemble, d’un même fournisseur.",
    ecran: "arrivages",
    etapes: [
      "Ouvrez les arrivages pour retrouver un lot déjà saisi, ou en déclarer un nouveau.",
      "Les motos du lot s’y cochent au fur et à mesure qu’on vérifie leurs papiers.",
    ],
    attention:
      "La quittance et le CMC se cochent sur le lot à l’arrivée. C’est ce geste-là qui fait avancer les dossiers tout seuls — sans lui, il faudra les reprendre un par un.",
  },

  /* --- L'argent ----------------------------------------------------------- */
  {
    cle: "encaisser_un_versement",
    theme: "argent",
    titre: "Encaisser un versement",
    quand: "Un client vient payer une partie de ce qu’il doit, ou solder sa moto.",
    ecran: "paiements",
    etapes: [
      "Ouvrez les paiements : la liste montre qui doit encore de l’argent.",
      "Retrouvez le client ou le numéro de sa vente.",
      "Saisissez ce qu’il verse aujourd’hui et par quel moyen.",
      "Le reçu s’imprime ensuite depuis la vente.",
    ],
    attention:
      "Un versement se rattache toujours à une vente, jamais à un client en général : quelqu’un peut avoir deux motos en cours.",
  },
  {
    cle: "journal_de_caisse",
    theme: "argent",
    titre: "Lire le journal de caisse",
    quand: "On veut savoir ce qui est entré et sorti du tiroir, et pour quoi.",
    ecran: "caisse",
    etapes: [
      "Ouvrez la caisse : chaque ligne dit le sens, le montant et d’où vient le mouvement.",
      "Les entrées sont les versements des clients, les sorties les dépenses et les avances.",
    ],
  },
  {
    cle: "enregistrer_une_depense",
    theme: "argent",
    titre: "Enregistrer une dépense",
    quand: "De l’argent sort du tiroir : carburant, transport, réparation, avance.",
    ecran: "depenses",
    etapes: [
      "Dites-moi simplement ce que vous avez payé et combien : je prépare la ligne.",
      "Vérifiez ce que je propose, puis validez — c’est vous qui enregistrez, jamais moi.",
      "Sinon, ouvrez les dépenses et saisissez-la à la main.",
    ],
    attention:
      "Rangez-la dans un poste de dépense : c’est ce qui permet, en fin de mois, de dire où l’argent est parti plutôt que de constater qu’il est parti.",
  },

  /* --- Les papiers -------------------------------------------------------- */
  {
    cle: "confier_des_cartes_grises",
    theme: "papiers",
    titre: "Confier des cartes grises à un prestataire",
    quand: "On remet un paquet de dossiers à celui qui fait les cartes grises.",
    ecran: "prestataires",
    etapes: [
      "Choisissez d’abord une boutique : un paquet part d’un magasin, et l’avance sort de sa caisse.",
      "Ouvrez les prestataires et prenez la fiche de la personne à qui vous confiez.",
      "Cochez les dossiers qui partent : ils s’affichent tous, avec le client et depuis quand il attend.",
      "Saisissez la date du jour, l’avance versée, et la date annoncée si elle l’a donnée.",
    ],
    attention:
      "L’avance est celle du paquet entier, pas celle d’une carte : un seul billet change de main, et la caisse n’enregistre qu’une sortie.",
  },
  {
    cle: "suivre_les_dossiers",
    theme: "papiers",
    titre: "Suivre les cartes grises",
    quand: "On veut savoir où en sont les papiers, qui les détient, et ce qui traîne.",
    ecran: "dossiers",
    etapes: [
      "Ouvrez les dossiers : l’onglet « En cours » montre ce qui attend encore.",
      "L’onglet « Historique » montre tout ce qui est parti : chez qui, l’avance versée, la date du dépôt et celle du retour.",
      "Ce qui dépasse la date annoncée est signalé en tête : ce sont les relances à passer.",
    ],
    attention:
      "Un dossier ne se ferme pas tout seul quand la carte revient : il faut aussi que la vente soit soldée et la moto remise.",
  },
  {
    cle: "declarer_un_prestataire",
    theme: "papiers",
    titre: "Déclarer un prestataire",
    quand: "Une nouvelle personne va traiter les cartes grises.",
    ecran: "prestataires",
    responsable: true,
    etapes: [
      "Ouvrez les prestataires et ajoutez la fiche : un nom et un téléphone suffisent.",
      "Le téléphone est obligatoire — c’est par là qu’on relance un dossier.",
      "Une fois déclarée, la personne est proposée partout où l’on confie un dossier.",
    ],
    attention:
      "On ne supprime pas un prestataire : on le retire des choix. Ses dossiers passés doivent rester lisibles.",
  },

  /* --- Les pièces --------------------------------------------------------- */
  {
    cle: "vendre_des_pieces",
    theme: "pieces",
    titre: "Vendre des pièces détachées",
    quand: "Un client achète une ou plusieurs pièces au comptoir.",
    ecran: "vendre_des_pieces",
    etapes: [
      "Choisissez une boutique : c’est son stock qu’on entame.",
      "Cherchez chaque pièce au catalogue et dites la quantité.",
      "Validez : la sortie de stock et l’encaissement partent ensemble.",
    ],
  },
  {
    cle: "stock_des_pieces",
    theme: "pieces",
    titre: "Savoir combien il reste d’une pièce",
    quand: "On veut vérifier un stock, ou repérer ce qui va manquer.",
    ecran: "catalogue_pieces",
    etapes: [
      "Ouvrez le catalogue : chaque référence affiche ce qu’il en reste.",
      "Demandez-le-moi aussi directement : « combien de bougies NGK ».",
    ],
    attention:
      "Le stock d’une pièce est la somme de ses mouvements : il n’y a aucun compteur à part. Une entrée oubliée fausse le total pour toujours, jusqu’à ce qu’on la rattrape.",
  },
  {
    cle: "creer_une_piece",
    theme: "pieces",
    titre: "Ajouter une pièce au catalogue",
    quand: "Une référence qu’on n’a jamais vendue entre au magasin.",
    ecran: "nouvelle_piece",
    etapes: [
      "Choisissez une boutique : le catalogue des pièces appartient au magasin qui les vend.",
      "Donnez la référence, la désignation, et les deux prix — ce qu’elle coûte et ce qu’elle se vend.",
      "Enregistrez ensuite son entrée en stock, sinon elle existera à zéro.",
    ],
  },

  /* --- L'application ------------------------------------------------------ */
  {
    cle: "changer_de_boutique",
    theme: "application",
    titre: "Changer de boutique",
    quand: "On veut travailler sur un autre magasin, ou revoir l’entreprise entière.",
    ecran: null,
    etapes: [
      "Dites-moi simplement le nom de la boutique : je bascule.",
      "Sinon, la boutique affichée en haut de l’écran se change d’un clic.",
    ],
    attention:
      "Tout ce que vous saisissez part dans la boutique affichée en haut. C’est la première chose à vérifier avant d’enregistrer quoi que ce soit.",
  },
  {
    cle: "travailler_sans_reseau",
    theme: "application",
    titre: "Travailler quand le réseau tombe",
    quand: "La connexion est coupée et il faut continuer à servir les clients.",
    ecran: null,
    etapes: [
      "Continuez à saisir : les ventes, les versements et les dépenses s’enregistrent sans réseau.",
      "Un bandeau dit ce qui attend d’être envoyé ; tout repart tout seul au retour de la connexion.",
      "Ce qui a besoin du réseau — envoyer une photo, créer un compte — vous le dira au lieu d’échouer en silence.",
    ],
    attention:
      "Moi, en revanche, j’ai besoin du réseau pour répondre : sans connexion, l’application marche mais je me tais.",
  },
  {
    cle: "installer_l_application",
    theme: "application",
    titre: "Installer l’application sur un téléphone",
    quand: "On veut l’ouvrir depuis l’écran d’accueil, sans passer par le navigateur.",
    ecran: "reglages",
    etapes: [
      "Ouvrez les réglages et cherchez la partie qui concerne cet appareil.",
      "Appuyez sur installer. Sur iPhone, c’est le bouton Partager puis « Sur l’écran d’accueil ».",
      "Une fois posée, elle s’ouvre en plein écran et continue de marcher sans réseau.",
    ],
  },
];

/** Ce que l'on montre quand on demande « qu'est-ce que je peux faire ici ». */
export type GroupeDeFiches = {
  theme: Theme;
  libelle: string;
  fiches: readonly Fiche[];
};

function autorisee(fiche: Fiche, role: Role): boolean {
  return !fiche.responsable || role === "responsable";
}

/** Les fiches ouvertes à ce rôle. */
export function fichesPour(role: Role): Fiche[] {
  return FICHES.filter((fiche) => autorisee(fiche, role));
}

/**
 * Une fiche par sa clé, ou `null`.
 *
 * `null` plutôt qu'une fiche approchante : un mode d'emploi qui répond à côté
 * fait faire le mauvais geste, ce qui est pire que de ne pas répondre.
 */
export function trouverFiche(cle: string, role: Role): Fiche | null {
  const cherchee = cle.trim().toLowerCase();
  const fiche = FICHES.find((candidate) => candidate.cle === cherchee);
  return fiche && autorisee(fiche, role) ? fiche : null;
}

/**
 * Le sommaire, par rubrique.
 *
 * Les rubriques vides sont retirées : un titre suivi de rien est un rangement
 * qui ment — la même règle que les groupes de la navigation.
 */
export function sommaire(role: Role): GroupeDeFiches[] {
  return THEMES.map((theme) => ({
    theme,
    libelle: LIBELLE_THEME[theme],
    fiches: fichesPour(role).filter((fiche) => fiche.theme === theme),
  })).filter((groupe) => groupe.fiches.length > 0);
}

/** La liste que le modèle lit dans la description de l'outil. */
export function clesDuManuel(role: Role): string {
  return fichesPour(role)
    .map((fiche) => fiche.cle)
    .join(", ");
}
