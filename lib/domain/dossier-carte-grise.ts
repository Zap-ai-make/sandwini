import { lireJour } from "./dossier";
import { LONGUEUR_NOM_MAX, LONGUEUR_TELEPHONE_MAX } from "./client";
import { jourLocal } from "./format";
import { LONGUEUR_CHASSIS_MAX, normaliserChassis } from "./moto";
import { lireMontant, MONTANT_MAX } from "./vente";

/**
 * Le dossier de carte grise — sorti de la vente (S59).
 *
 * **Pourquoi il déménage.** Un dossier vivait sous `ventesMotos/{id}/documents`,
 * donc il n'en existait pas sans vente. Or le client en confie régulièrement
 * qui viennent du dehors : « on peut leur confier de gérer une carte grise de
 * l'extérieur ». Un dossier accroché à une vente qui n'existe pas n'a nulle
 * part où être écrit — d'où la collection à lui.
 *
 * **Et son parcours gagne une étape.** S53 l'arrêtait au retour du prestataire,
 * en disant que la remise au client n'était plus un statut à promener. Le
 * fichier du client dit l'inverse, et il a raison : ses colonnes `RECEPTION`
 * et `retrait` notent **qui** est venu chercher le papier et **quand**. Une
 * carte revenue n'est pas une carte rendue, et c'est justement la ligne qu'on
 * cherche quand quelqu'un se présente au comptoir.
 *
 * **La plaque ne revient pas comme un second papier à poursuivre** (S48). La
 * colonne `Immatriculation` du fichier est un **résultat** : le numéro qu'on
 * inscrit au retour, sur le dossier qui vient de rentrer.
 */

export const STATUTS_CARTE_GRISE = [
  "a_faire",
  "chez_prestataire",
  "revenu_magasin",
  "remis",
  "non_applicable",
] as const;
export type StatutCarteGrise = (typeof STATUTS_CARTE_GRISE)[number];

export const LIBELLE_STATUT_CARTE_GRISE: Record<StatutCarteGrise, string> = {
  a_faire: "À faire",
  chez_prestataire: "Chez le prestataire",
  /* « Au magasin » et non « Revenu » : ce qui compte pour celui qui lit la
     liste, c'est où se trouve le papier en ce moment. */
  revenu_magasin: "Au magasin",
  remis: "Remis",
  non_applicable: "Sans objet",
};

/**
 * Un statut dont plus rien ne sort : le dossier a fini sa vie.
 *
 * **Il n'y a plus de machine à états, et c'est le classeur du client qui l'a
 * décidé.** S59 faisait avancer un dossier d'un cran à la fois, par des
 * boutons, et refusait les sauts. Son fichier ne marche pas comme ça : il n'a
 * pas de colonne « état », parce que chez lui **l'état est le remplissage** —
 * `Depot` renseigné veut dire « c'est parti », `retrait` renseigné veut dire
 * « c'est rendu ». Et il transcrit des dossiers anciens, donc il remplit toute
 * la ligne d'un coup : exiger le chemin aurait refusé sa saisie la plus
 * courante.
 *
 * Le statut reste écrit sur le document — les paquets le lisent, et le portail
 * prestataire le lira — mais il se **déduit** des cases (`statutDeLaLigne`), et
 * les règles vérifient qu'il s'accorde avec elles au lieu de surveiller un
 * chemin.
 */
const TERMINAUX: readonly StatutCarteGrise[] = ["remis", "non_applicable"];

export function estTerminal(statut: StatutCarteGrise): boolean {
  return TERMINAUX.includes(statut);
}

/** D'où vient le dossier : d'une vente d'ici, ou du dehors. */
export type OrigineDossier = "vente" | "exterieur";

export type DossierCarteGrise = {
  id: string;
  /**
   * La boutique d'origine ; celle des cartes grises pour un dossier extérieur.
   *
   * Porté sur le document parce qu'une requête ne sait filtrer que sur les
   * champs du document lui-même — et c'est lui qui décide ce qu'un gérant
   * motos voit de sa propre boutique.
   */
  boutiqueId: string;
  /** `null` pour un dossier extérieur : il n'y a pas eu de vente. */
  venteId: string | null;
  origine: OrigineDossier;
  /**
   * Le nom du propriétaire, **recopié** et non pointé.
   *
   * La personne des cartes grises ne lit pas le fichier des clients — c'est
   * tout l'objet de son cloisonnement. Sans cette copie, sa liste afficherait
   * des identifiants.
   */
  clientNom: string;
  /**
   * Sa colonne `Tel` — le téléphone du **propriétaire**.
   *
   * **À ne pas confondre avec `remisATelephone`**, sa colonne `RECEPTION`, qui
   * porte le numéro de celui qui est venu chercher le papier. Ce n'est pas la
   * même personne — souvent un frère, un employé — et c'est bien pour ça qu'il
   * tient les deux.
   *
   * **Il se tape, il ne se recopie pas de la vente.** Arbitrage du
   * commanditaire : plusieurs boutiques vendent, plusieurs traitent les
   * papiers, et il ne veut pas qu'un numéro arrive d'ailleurs dans sa ligne.
   */
  clientTelephone: string;
  /** Marque et modèle réunis, recopiés de la moto ou tapés à la main. */
  motoLibelle: string;
  numeroChassis: string;
  /**
   * Sa colonne `Reci` — le reçu, confirmé par le commanditaire.
   *
   * Son classeur y porte `√` ou `OK` : deux façons d'écrire oui, donc une case
   * à cocher. S59 l'avait mise hors périmètre en disant que la vente portait
   * déjà le reçu — ce qui est vrai, et sans effet : la moitié de ses dossiers
   * viennent du dehors et n'ont pas de vente.
   */
  recu: boolean;
  /** Sa colonne `Credit`, vide sur toutes les lignes relevées. En francs. */
  credit: number | null;
  statut: StatutCarteGrise;
  prestataireId: string | null;
  prestataireNom: string;
  deposeLe: Date | null;
  avance: number | null;
  /** La date annoncée par le prestataire. C'est elle qui alimente « en retard ». */
  disponibleLe: Date | null;
  /** Le numéro de plaque, inscrit au retour. Vide tant qu'on ne l'a pas. */
  immatriculation: string;
  revenuLe: Date | null;
  remisLe: Date | null;
  /** Qui est venu chercher. Du texte libre : ce n'est pas toujours l'acheteur. */
  remisANom: string;
  remisATelephone: string;
};

/** Ce dossier attend-il encore quelque chose ? */
export function dossierEnCours(dossier: Pick<DossierCarteGrise, "statut">): boolean {
  return !estTerminal(dossier.statut);
}

/**
 * Les deux listes de l'écran, triées comme on les lit.
 *
 * **Ce qui n'est pas encore parti vient en tête.** C'est la seule colonne
 * d'action de l'écran : un dossier sans dépôt attend un geste. Le ranger avec
 * les autres l'enterrerait sous une année d'attente — le fichier du client
 * montre presque un an entre le dépôt et le retrait.
 *
 * **Puis du plus ancien dépôt au plus récent**, parce que c'est une file qu'on
 * vide et que ce qui traîne depuis le plus longtemps est ce qu'il faut
 * relancer. L'historique, lui, se lit à l'envers : on y cherche ce qui vient de
 * se passer.
 */
export function rangerDossiers(dossiers: readonly DossierCarteGrise[]): {
  cours: DossierCarteGrise[];
  termines: DossierCarteGrise[];
} {
  const cours = dossiers.filter(dossierEnCours).sort(parAnciennete);
  const termines = dossiers
    .filter((dossier) => !dossierEnCours(dossier))
    .sort((a, b) => (b.remisLe?.getTime() ?? 0) - (a.remisLe?.getTime() ?? 0));
  return { cours, termines };
}

function parAnciennete(a: DossierCarteGrise, b: DossierCarteGrise): number {
  /* Pas de dépôt veut dire « rien n'est encore parti », pas « très ancien » :
     ces dossiers passent devant, et se départagent par le nom pour que l'ordre
     ne bouge pas d'un affichage à l'autre. */
  if (a.deposeLe === null && b.deposeLe === null) return a.clientNom.localeCompare(b.clientNom);
  if (a.deposeLe === null) return -1;
  if (b.deposeLe === null) return 1;
  return a.deposeLe.getTime() - b.deposeLe.getTime();
}

/**
 * Ce qu'un dossier porte à sa naissance, sans sa trace d'audit.
 *
 * **Pur, et dans le domaine, pour une raison d'architecture.** Deux endroits
 * font naître un dossier : la vente, dans son propre lot, et l'écran des
 * cartes grises. Si le premier appelait le dépôt du second, `ventes.ts` et
 * `dossiers-carte-grise.ts` s'importeraient mutuellement — un cycle qui tient
 * tant qu'on ne l'observe pas, et qui casse le jour où l'un des deux évalue
 * quelque chose au chargement.
 *
 * **Et les règles exigent `hasOnly`.** Un champ en trop fait refuser
 * l'écriture ; un champ manquant fait refuser toutes les *modifications*
 * suivantes, ce qui est pire — le dossier existe et se fige. Deux listes de
 * champs auraient divergé (D73), donc il n'y en a qu'une, et un test la garde.
 */
export type DossierNeuf = {
  boutiqueId: string;
  /** `null` pour un dossier extérieur : il n'y a pas eu de vente. */
  venteId: string | null;
  origine: OrigineDossier;
  clientNom: string;
  motoLibelle: string;
  numeroChassis: string;
  /**
   * `non_applicable` quand le client repart sans vouloir de carte grise.
   *
   * C'est la case du comptoir qui pilote le dossier (S53, arbitrage 5) :
   * décocher « Carte grise » laissait jusque-là un document « à faire » que
   * personne n'allait jamais faire, et qui bloquait la clôture.
   */
  statut: Extract<StatutCarteGrise, "a_faire" | "non_applicable">;
};

export function champsDossierNeuf(naissance: DossierNeuf) {
  return {
    boutiqueId: naissance.boutiqueId,
    venteId: naissance.venteId,
    origine: naissance.origine,
    clientNom: naissance.clientNom,
    /* Vide à la naissance, même née d'une vente : le commanditaire ne veut pas
       qu'un numéro arrive d'ailleurs dans sa ligne. */
    clientTelephone: "",
    motoLibelle: naissance.motoLibelle,
    numeroChassis: naissance.numeroChassis,
    recu: false,
    credit: null as number | null,
    statut: naissance.statut as StatutCarteGrise,
    prestataireId: null as string | null,
    prestataireNom: "",
    deposeLe: null as Date | null,
    avance: null as number | null,
    disponibleLe: null as Date | null,
    immatriculation: "",
    revenuLe: null as Date | null,
    remisLe: null as Date | null,
    remisANom: "",
    remisATelephone: "",
  };
}

/* --- La ligne de son classeur --------------------------------------------- */

/**
 * Les dix colonnes de son classeur Excel, dans son ordre et sous ses noms.
 *
 * **Ses noms, fautes comprises** — `CHASIS`, `Reci`, `TRANSITE`. Le reste du
 * produit est écrit en français soigné ; ces dix mots sont une île, et c'est la
 * demande : il s'est familiarisé avec son fichier et ne veut pas en changer. Un
 * entête qu'il ne reconnaît pas lui ferait relire la colonne à chaque ligne.
 *
 * **Une seule liste pour l'entête et pour la modale.** La demande est que la
 * saisie et le tableau montrent les mêmes cases dans le même ordre ; deux
 * listes auraient divergé au premier ajout (D73).
 */
export const ENTETES_LIGNE = {
  /* Ajoutée le 24 octobre 2026, en tête et à sa demande : le téléphone du
     propriétaire. La seule colonne qui ne vienne pas de son classeur. */
  tel: "Tel",
  client: "client",
  moto: "MOTO",
  chassis: "CHASIS",
  /* « Reci » dans le classeur : une faute de frappe que le commanditaire a
     demandé de corriger le 26 octobre 2026, et non un mot à lui. */
  recu: "Reçu",
  credit: "Credit",
  depot: "Depot",
  reception: "RECEPTION",
  retrait: "retrait",
  immatriculation: "Immatriculation",
  transite: "TRANSITE",
} as const;

export const ORDRE_LIGNE = [
  "tel",
  "client",
  "moto",
  "chassis",
  "recu",
  "credit",
  /* **Dépôt, réception, retrait** — l'ordre du trajet, et non celui du
     classeur, à la demande du commanditaire (26 octobre 2026) : « mets
     réception entre dépôt et retrait ». On dépose chez le prestataire, la
     carte revient, le client l'emporte. Lues dans cet ordre, les trois dates
     d'une ligne se vérifient d'un coup d'œil. */
  "depot",
  "reception",
  "retrait",
  "immatriculation",
  "transite",
] as const;

export type CleColonneLigne = (typeof ORDRE_LIGNE)[number];

export const LONGUEUR_IMMATRICULATION_MAX = 24;

/**
 * Ce qu'on tape dans une ligne.
 *
 * Tout en texte, comme dans une cellule : c'est le domaine qui lit les dates et
 * les montants, pas le navigateur. `RECEPTION` porte un téléphone — c'est ce
 * que son fichier y met, des numéros à huit chiffres — et non un nom.
 */
export type SaisieLigne = {
  tel: string;
  client: string;
  moto: string;
  chassis: string;
  recu: boolean;
  credit: string;
  reception: string;
  /** Format de `<input type="date">` : `aaaa-mm-jj`. Vide tant que c'est en cours. */
  retrait: string;
  depot: string;
  immatriculation: string;
  transite: string;
};

export const LIGNE_VIDE: SaisieLigne = {
  tel: "",
  client: "",
  moto: "",
  chassis: "",
  recu: false,
  credit: "",
  reception: "",
  retrait: "",
  depot: "",
  immatriculation: "",
  transite: "",
};

/** La ligne telle qu'elle se rouvre pour correction. */
export function ligneDuDossier(dossier: DossierCarteGrise): SaisieLigne {
  return {
    tel: dossier.clientTelephone,
    client: dossier.clientNom,
    moto: dossier.motoLibelle,
    chassis: dossier.numeroChassis,
    recu: dossier.recu,
    credit: dossier.credit === null ? "" : `${dossier.credit}`,
    reception: dossier.remisATelephone,
    retrait: dossier.remisLe ? jourLocal(dossier.remisLe) : "",
    depot: dossier.deposeLe ? jourLocal(dossier.deposeLe) : "",
    immatriculation: dossier.immatriculation,
    transite: dossier.prestataireNom,
  };
}

export function validerLigne(saisie: SaisieLigne): string | null {
  const client = saisie.client.trim();
  if (!client) return "Donnez le nom du propriétaire : c’est lui qui viendra chercher le papier.";
  if (client.length > LONGUEUR_NOM_MAX) return `Le nom dépasse ${LONGUEUR_NOM_MAX} caractères.`;

  const chassis = normaliserChassis(saisie.chassis);
  if (!chassis) return "Le numéro de châssis est obligatoire : c’est l’identité de la moto.";
  if (chassis.length > LONGUEUR_CHASSIS_MAX) {
    return `Le numéro de châssis dépasse ${LONGUEUR_CHASSIS_MAX} caractères.`;
  }
  /* **Aucune longueur imposée**, et c'est un relevé, pas une tolérance : les
     châssis de son fichier font dix à douze caractères — 10RY243294 — là où une
     voiture en porte dix-sept. Exiger un compte aurait refusé tous ses
     dossiers. */
  if (!/^[A-Z0-9]+$/.test(chassis)) {
    return "Le numéro de châssis ne contient que des lettres et des chiffres.";
  }

  if (saisie.moto.trim().length > LONGUEUR_NOM_MAX) {
    return `Le modèle dépasse ${LONGUEUR_NOM_MAX} caractères.`;
  }
  if (saisie.transite.trim().length > LONGUEUR_NOM_MAX) {
    return `Le nom du prestataire dépasse ${LONGUEUR_NOM_MAX} caractères.`;
  }
  if (saisie.tel.trim().length > LONGUEUR_TELEPHONE_MAX) {
    return `Le téléphone du propriétaire dépasse ${LONGUEUR_TELEPHONE_MAX} caractères.`;
  }
  if (saisie.reception.trim().length > LONGUEUR_TELEPHONE_MAX) {
    return `Le téléphone dépasse ${LONGUEUR_TELEPHONE_MAX} caractères.`;
  }
  if (saisie.immatriculation.trim().length > LONGUEUR_IMMATRICULATION_MAX) {
    return `Le numéro d’immatriculation dépasse ${LONGUEUR_IMMATRICULATION_MAX} caractères.`;
  }

  if (saisie.credit.trim() !== "") {
    const credit = lireMontant(saisie.credit);
    if (credit === null) return "Le crédit est un montant en francs, sans virgule.";
    if (credit > MONTANT_MAX) return "Le crédit dépasse le maximum admis.";
  }

  const depot = jourOuRien(saisie.depot);
  if (depot === false) return "La date de dépôt n’est pas une date.";
  const retrait = jourOuRien(saisie.retrait);
  if (retrait === false) return "La date de retrait n’est pas une date.";

  /* **Le seul contrôle de cohérence entre deux cases, et il attrape une faute
     de frappe qui coûte cher.** Une carte rendue avant d'être partie n'existe
     pas ; la ligne resterait lisible, fausse, et personne ne la relirait. */
  if (depot !== null && retrait !== null && retrait.getTime() < depot.getTime()) {
    return "Le retrait est antérieur au dépôt : vérifiez les deux dates.";
  }
  return null;
}

/** `false` dit « il y a quelque chose, et ce n'est pas une date ». Vide est licite. */
function jourOuRien(brut: string): Date | null | false {
  if (brut.trim() === "") return null;
  return lireJour(brut) ?? false;
}

/**
 * Le statut que les cases racontent.
 *
 * **L'ordre des questions est celui de la vie du papier, lu à l'envers** : si on
 * l'a rendu, le reste n'importe plus. Son classeur n'a pas de colonne pour le
 * retour au magasin — `Immatriculation` en est la preuve, puisque la plaque
 * s'obtient avec la carte grise — donc un dossier déjà revenu dont on n'a pas
 * encore le numéro se reconnaît à `revenuLe`, enregistré la première fois.
 */
export function statutDeLaLigne(
  saisie: SaisieLigne,
  avant: Pick<DossierCarteGrise, "statut" | "revenuLe">,
): StatutCarteGrise {
  if (saisie.retrait.trim() !== "") return "remis";
  if (saisie.immatriculation.trim() !== "" || avant.revenuLe !== null) return "revenu_magasin";
  if (saisie.depot.trim() !== "" || saisie.transite.trim() !== "") return "chez_prestataire";
  /* Vider les cases d'un dossier parti par erreur le ramène au départ — c'est
     la correction qu'on vient chercher. Mais « sans objet » ne s'invente pas
     ici : il vient du comptoir, quand le client ne veut pas de carte grise. */
  return avant.statut === "non_applicable" ? "non_applicable" : "a_faire";
}

/**
 * Les champs du dossier que la ligne décide, statut compris.
 *
 * `aujourdhui` est passé et non lu : le domaine ne consulte pas d'horloge, et
 * c'est ce qui rend la déduction testable.
 */
export function champsDeLaLigne(
  saisie: SaisieLigne,
  avant: Pick<DossierCarteGrise, "statut" | "revenuLe">,
  aujourdhui: Date,
) {
  const statut = statutDeLaLigne(saisie, avant);
  const retrait = lireJour(saisie.retrait);
  return {
    clientNom: saisie.client.trim(),
    clientTelephone: saisie.tel.trim(),
    motoLibelle: saisie.moto.trim(),
    numeroChassis: normaliserChassis(saisie.chassis),
    recu: saisie.recu,
    credit: saisie.credit.trim() === "" ? null : lireMontant(saisie.credit),
    remisATelephone: saisie.reception.trim(),
    remisLe: retrait,
    deposeLe: lireJour(saisie.depot),
    immatriculation: saisie.immatriculation.trim(),
    prestataireNom: saisie.transite.trim(),
    statut,
    revenuLe: dateDuRetour(statut, avant.revenuLe, retrait, aujourdhui),
  };
}

/**
 * Le jour où le papier est revenu au magasin — la date que son classeur n'a pas.
 *
 * Elle existe dans le produit, et elle sert : c'est elle qui dit depuis combien
 * de temps un papier dort au magasin sans que personne vienne le chercher. Donc
 * on la tient, sans rien inventer :
 *
 * - déjà connue, elle ne bouge plus ;
 * - le papier vient de rentrer, c'est maintenant qu'on l'enregistre ;
 * - la ligne est transcrite d'un coup jusqu'au retrait : le papier était
 *   forcément revenu **au plus tard** ce jour-là, et c'est la seule date qu'on
 *   ait.
 */
function dateDuRetour(
  statut: StatutCarteGrise,
  connu: Date | null,
  retrait: Date | null,
  aujourdhui: Date,
): Date | null {
  if (connu !== null) return connu;
  if (statut === "remis") return retrait;
  if (statut === "revenu_magasin") return aujourdhui;
  return null;
}

/* --- Saisir plusieurs lignes d'affilée ------------------------------------ */

/**
 * La ligne suivante, quand on en enchaîne plusieurs.
 *
 * **Elle hérite du dépôt et du prestataire, et c'est un relevé.** Son classeur
 * porte la même date de `Depot` sur tout un bloc : c'est un paquet confié le
 * même jour, au même transitaire. Lui faire retaper les deux à chaque ligne
 * serait du temps perdu à chaque ligne. Tout le reste part vide — un châssis
 * ou un nom hérité serait un doublon qu'on ne remarque pas.
 */
export function ligneSuivante(precedente: SaisieLigne): SaisieLigne {
  return { ...LIGNE_VIDE, depot: precedente.depot, transite: precedente.transite };
}

/**
 * Une ligne où personne n'a rien tapé.
 *
 * On clique « + » une fois de trop, et cela n'a pas à devenir une erreur : à
 * l'enregistrement, ces lignes-là sont ignorées sans un mot. L'héritage ne
 * compte pas comme une saisie — sinon la ligne de trop, qui porte la date du
 * dépôt sans rien d'autre, serait écrite comme un dossier fantôme.
 */
export function ligneEstVide(saisie: SaisieLigne): boolean {
  return (
    saisie.tel.trim() === "" &&
    saisie.client.trim() === "" &&
    saisie.moto.trim() === "" &&
    saisie.chassis.trim() === "" &&
    !saisie.recu &&
    saisie.credit.trim() === "" &&
    saisie.reception.trim() === "" &&
    saisie.retrait.trim() === "" &&
    saisie.immatriculation.trim() === ""
  );
}

/* --- Marquer le retour d'un paquet d'un seul geste ------------------------- */

/**
 * Ce dossier est-il parti chez un prestataire, et attend-il son retour ?
 *
 * C'est le seul état qu'un retour en bloc concerne : ni « à faire » (pas encore
 * parti), ni « au magasin » (déjà revenu), ni « remis » (fini). La liste des
 * cases à cocher du retour groupé se dresse là-dessus.
 *
 * **Il se lit sur les cases, et non sur le champ `statut`** — même déduction
 * que `statutDeLaLigne`, pour la même raison (voir le commentaire de ce fichier
 * sur « l'état EST le remplissage »). Un dossier repris du classeur porte un
 * prestataire dans `TRANSITE` mais un `statut` resté « a_faire », faute d'avoir
 * jamais été redéduit ; se fier au champ écrit l'écartait à tort du retour
 * groupé (défaut relevé le 28 octobre 2026). On le déduit donc de ce qu'on voit
 * sur la ligne, comme partout ailleurs.
 */
export function attendUnRetour(
  dossier: Pick<
    DossierCarteGrise,
    "deposeLe" | "prestataireNom" | "immatriculation" | "revenuLe" | "remisLe"
  >,
): boolean {
  /* Déjà remis, ou déjà revenu au magasin : il n'attend plus rien. L'ordre
     suit celui de `statutDeLaLigne`, lu à l'envers. */
  if (dossier.remisLe !== null) return false;
  if (dossier.immatriculation.trim() !== "" || dossier.revenuLe !== null) return false;
  /* Dehors dès qu'une case le dit : une date de dépôt, ou un nom de prestataire. */
  return dossier.deposeLe !== null || dossier.prestataireNom.trim() !== "";
}

/**
 * Ce dossier a-t-il sa place dans la barre « Marquer reçus » ?
 *
 * **Ceux qui sont dehors, et ceux qui sont rentrés sans que la case Reçu le
 * dise.** Les seconds existent : treize lignes ont été marquées revenues le 27
 * octobre 2026, avant que le geste ne coche « Reçu ». Elles restaient dans le
 * Dépôt sans rien qui les distingue d'une ligne jamais partie — le défaut même
 * qui a fait croire le geste disparu. Les reproposer les rattrape d'un clic, au
 * lieu de les rouvrir une à une.
 *
 * Un dossier remis n'y figure jamais : il est fini, et il vit dans Retrait.
 */
export function aMarquerRecu(
  dossier: Pick<
    DossierCarteGrise,
    "deposeLe" | "prestataireNom" | "immatriculation" | "recu" | "revenuLe" | "remisLe"
  >,
): boolean {
  if (attendUnRetour(dossier)) return true;
  if (dossier.remisLe !== null || dossier.recu) return false;
  return dossier.revenuLe !== null || dossier.immatriculation.trim() !== "";
}

/**
 * Les champs à écrire pour marquer qu'un dossier est revenu du prestataire.
 *
 * **Le geste que le commanditaire fait cent fois à la main, en un seul.** « Quand
 * un prestataire ramène, il faut valider un par un, et ça prend du temps. »
 * Marquer un retour, c'est inscrire la date du jour dans `revenuLe` : le statut
 * s'en déduit, exactement comme quand on ouvre la ligne et qu'on remplit la
 * case. On ne touche à rien d'autre — ni au dépôt, ni au prestataire, ni à
 * l'avance —, parce qu'un retour ne corrige pas la ligne, il la fait avancer.
 *
 * **Une date déjà connue ne bouge pas.** Si le dossier porte déjà un `revenuLe`,
 * on le garde : rejouer le geste ne doit pas dater d'aujourd'hui un retour
 * d'hier. En pratique `attendUnRetour` l'a déjà écarté, mais la fonction reste
 * juste seule.
 *
 * **Et la case Reçu se coche** (demande du 28 octobre 2026) : « même si on
 * marque comme reçu, la case Reçu ne se coche pas ». Pour lui, marquer le
 * retour et cocher `Reçu` sont un seul et même geste ; c'est aussi cette case
 * qui met la ligne en vert.
 */
export function champsRetourMagasin(
  dossier: Pick<DossierCarteGrise, "revenuLe">,
  aujourdhui: Date,
): { statut: StatutCarteGrise; revenuLe: Date; recu: true } {
  return {
    statut: "revenu_magasin",
    revenuLe: dossier.revenuLe ?? aujourdhui,
    recu: true,
  };
}

/* --- Chercher dans la liste ------------------------------------------------ */

/**
 * Les dossiers qui répondent à ce qu'on tape, toutes colonnes confondues.
 *
 * **Toutes les colonnes, parce que c'est la demande** : « qu'on puisse faire
 * une recherche là-dessus », sur le téléphone comme sur le nom, le châssis, la
 * plaque, le transitaire. Celui qui cherche au comptoir a un bout de papier à
 * la main ; il ne sait pas dans quelle colonne vit ce qu'il lit.
 *
 * **Chaque mot doit se retrouver, pas forcément au même endroit.** « sana
 * 2026 » rend les lignes de Sana datées de 2026. Deux mots qui devraient tous
 * deux tomber dans la même colonne n'auraient presque jamais de réponse.
 *
 * **Les dates se cherchent comme on les lit et comme on les tape** —
 * `29/07/2026`, `2026-07-29`, ou juste `2026`. Et les numéros se retrouvent
 * avec ou sans leurs espaces : une plaque se lit `7078 7DQ 04` et se tape
 * souvent d'un seul tenant.
 */
export function chercherDossiers(
  dossiers: readonly DossierCarteGrise[],
  recherche: string,
  normaliser: (brut: string) => string,
): DossierCarteGrise[] {
  const mots = normaliser(recherche).split(" ").filter(Boolean);
  if (mots.length === 0) return [...dossiers];

  return dossiers.filter((dossier) => {
    const foin = normaliser(texteCherchable(dossier));
    const serre = foin.replace(/[\s-]+/g, "");
    return mots.every((mot) => foin.includes(mot) || serre.includes(mot.replace(/[\s-]+/g, "")));
  });
}

/** Tout ce qu'une ligne montre, mis bout à bout pour être fouillé. */
function texteCherchable(dossier: DossierCarteGrise): string {
  return [
    dossier.clientTelephone,
    dossier.clientNom,
    dossier.motoLibelle,
    dossier.numeroChassis,
    /* La case cochée se cherche par les mots qu'il y mettrait lui-même. */
    dossier.recu ? "reci recu oui ok" : "",
    dossier.credit === null ? "" : `${dossier.credit}`,
    dossier.remisATelephone,
    ...datesCherchables(dossier.remisLe),
    ...datesCherchables(dossier.deposeLe),
    dossier.immatriculation,
    dossier.prestataireNom,
    LIBELLE_STATUT_CARTE_GRISE[dossier.statut],
  ].join(" ");
}

/** Une date sous ses deux écritures : celle qu'on lit, celle qu'on tape. */
function datesCherchables(date: Date | null): string[] {
  if (date === null) return [];
  const iso = jourLocal(date);
  const [annee, mois, jour] = iso.split("-");
  return [iso, `${jour}/${mois}/${annee}`];
}
