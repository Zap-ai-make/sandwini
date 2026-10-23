import { lireJour } from "./dossier";
import { LONGUEUR_NOM_MAX, LONGUEUR_TELEPHONE_MAX } from "./client";
import { LONGUEUR_CHASSIS_MAX, normaliserChassis } from "./moto";

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
 * Ce qu'un statut a le droit de devenir.
 *
 * L'étape du prestataire ne se saute pas : c'est elle qui dit qui détient le
 * papier, et un dossier qui passerait directement à « au magasin » viderait la
 * liste de la seule chose qu'elle sert à dire (D65).
 *
 * `non_applicable` ne s'atteint qu'au début. Une carte déjà partie ne devient
 * pas « sans objet » : elle est physiquement dehors, et quelqu'un l'attend.
 */
const CHEMIN: Record<StatutCarteGrise, readonly StatutCarteGrise[]> = {
  a_faire: ["chez_prestataire", "non_applicable"],
  chez_prestataire: ["revenu_magasin"],
  revenu_magasin: ["remis"],
  remis: [],
  non_applicable: [],
};

export function transitionAutorisee(de: StatutCarteGrise, vers: StatutCarteGrise): boolean {
  return CHEMIN[de].includes(vers);
}

/** Ce qu'on propose à l'écran. Vide sur un statut terminal. */
export function statutsSuivants(de: StatutCarteGrise): readonly StatutCarteGrise[] {
  return CHEMIN[de];
}

/** Un statut dont plus rien ne sort : le dossier a fini sa vie. */
export function estTerminal(statut: StatutCarteGrise): boolean {
  return CHEMIN[statut].length === 0;
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
  /** Marque et modèle réunis, recopiés de la moto ou tapés à la main. */
  motoLibelle: string;
  numeroChassis: string;
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
    motoLibelle: naissance.motoLibelle,
    numeroChassis: naissance.numeroChassis,
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

/* --- Ouvrir un dossier venu du dehors ------------------------------------- */

export type SaisieDossierExterieur = {
  clientNom: string;
  /** Facultatif : le fichier du client a des lignes sans modèle. */
  motoLibelle: string;
  numeroChassis: string;
};

export function validerDossierExterieur(saisie: SaisieDossierExterieur): string | null {
  const nom = saisie.clientNom.trim();
  if (!nom) return "Donnez le nom du propriétaire : c’est lui qui viendra chercher le papier.";
  if (nom.length > LONGUEUR_NOM_MAX) return `Le nom dépasse ${LONGUEUR_NOM_MAX} caractères.`;

  const chassis = normaliserChassis(saisie.numeroChassis);
  if (!chassis) return "Le numéro de châssis est obligatoire : c’est l’identité de la moto.";
  if (chassis.length > LONGUEUR_CHASSIS_MAX) {
    return `Le numéro de châssis dépasse ${LONGUEUR_CHASSIS_MAX} caractères.`;
  }
  /* **Aucune longueur imposée**, et c'est un relevé, pas une tolérance : les
     châssis du client font dix à douze caractères — 10RY243294, 4140RY029597 —
     là où une voiture en porte dix-sept. Exiger un compte aurait refusé la
     totalité de ses dossiers. */
  if (!/^[A-Z0-9]+$/.test(chassis)) {
    return "Le numéro de châssis ne contient que des lettres et des chiffres.";
  }

  if (saisie.motoLibelle.trim().length > LONGUEUR_NOM_MAX) {
    return `Le modèle dépasse ${LONGUEUR_NOM_MAX} caractères.`;
  }
  return null;
}

export function normaliserDossierExterieur(
  saisie: SaisieDossierExterieur,
): SaisieDossierExterieur {
  return {
    clientNom: saisie.clientNom.trim(),
    motoLibelle: saisie.motoLibelle.trim(),
    numeroChassis: normaliserChassis(saisie.numeroChassis),
  };
}

/* --- Le retour du prestataire --------------------------------------------- */

export const LONGUEUR_IMMATRICULATION_MAX = 24;

export type SaisieRetour = {
  /** Le numéro de plaque. Facultatif : on le complète si on ne l'a pas encore. */
  immatriculation: string;
  /** Format de `<input type="date">` : `aaaa-mm-jj`. */
  revenuLe: string;
};

export function validerRetour(saisie: SaisieRetour): string | null {
  if (!lireJour(saisie.revenuLe)) return "Indiquez la date du retour.";
  /* **Le numéro n'est pas exigé.** La carte est physiquement revenue ; refuser
     de l'enregistrer parce que le numéro n'est pas sous la main ferait mentir
     l'écran sur un fait accompli. */
  if (saisie.immatriculation.trim().length > LONGUEUR_IMMATRICULATION_MAX) {
    return `Le numéro d’immatriculation dépasse ${LONGUEUR_IMMATRICULATION_MAX} caractères.`;
  }
  return null;
}

/* --- La remise au comptoir ------------------------------------------------ */

export type SaisieRemise = {
  nom: string;
  /** Facultatif : tous les retraits du fichier du client n'en portent pas. */
  telephone: string;
  /** Format de `<input type="date">` : `aaaa-mm-jj`. */
  remisLe: string;
};

export function validerRemise(saisie: SaisieRemise): string | null {
  const nom = saisie.nom.trim();
  /* **Ce n'est pas toujours l'acheteur** — souvent un frère, un employé. C'est
     précisément pour ça qu'on l'écrit : sans nom, la ligne ne dit pas à qui le
     papier a été remis, et c'est la seule question qu'on lui posera. */
  if (!nom) return "Donnez le nom de la personne qui est venue chercher le papier.";
  if (nom.length > LONGUEUR_NOM_MAX) return `Le nom dépasse ${LONGUEUR_NOM_MAX} caractères.`;

  if (saisie.telephone.trim().length > LONGUEUR_TELEPHONE_MAX) {
    return `Le téléphone dépasse ${LONGUEUR_TELEPHONE_MAX} caractères.`;
  }

  if (!lireJour(saisie.remisLe)) return "Indiquez la date de la remise.";
  return null;
}
