/**
 * Le dossier documents — sa machine à états (`prompt.md` §7).
 *
 * Un dossier est l'ensemble vente + paiements + quatre documents (§13). Ce
 * module ne sait rien de Firestore ni de React : il dit ce qu'un document a le
 * droit de devenir, et quand un dossier est fini. Ces règles sont réutilisées
 * telles quelles par la page client (S13) et la page prestataire (S15), qui les
 * appliqueront côté serveur — d'où le fait qu'elles vivent ici, en fonctions
 * pures, plutôt qu'en conditions dispersées dans des composants.
 *
 * **Les quatre documents ne suivent pas le même chemin** (`DECISIONS.md` D65).
 * Deux d'entre eux arrivent déjà faits, deux passent par un prestataire ; le
 * chemin dépend donc du type, pas seulement du statut de départ.
 */

import {
  lireMontant,
  MONTANT_MAX,
  TYPES_DOCUMENT,
  type MoyenPaiement,
  type StatutDocument,
  type TypeDocument,
} from "./vente";

/**
 * Ce qui arrive déjà fait : la **quittance** accompagne la moto, et le **CMC**
 * s'obtient au ministère avec elle — deux démarches qui se font hors de
 * l'entreprise. Le magasin reçoit le produit fini, puis le remet au client.
 *
 * `chez_prestataire` n'existe pas pour ces documents : aucun intervenant
 * externe n'en est jamais chargé, et le nom d'un prestataire inscrit en face
 * serait faux dans la liste des dossiers en attente (§7.3).
 */
const CHEMIN_ARRIVE_FAIT: Record<StatutDocument, readonly StatutDocument[]> = {
  a_faire: ["revenu_magasin", "non_applicable"],
  chez_prestataire: [],
  revenu_magasin: ["remis_client"],
  remis_client: [],
  non_applicable: [],
};

/**
 * Ce qui passe par un prestataire : la **carte grise** et la **plaque**. Le
 * dépôt exige un prestataire, une date et une avance versée (§7.1), et l'étape
 * ne se saute pas — c'est elle qui dit qui détient le document.
 */
const CHEMIN_PRESTATAIRE: Record<StatutDocument, readonly StatutDocument[]> = {
  a_faire: ["chez_prestataire", "non_applicable"],
  chez_prestataire: ["revenu_magasin"],
  revenu_magasin: ["remis_client"],
  remis_client: [],
  non_applicable: [],
};

const CHEMIN: Record<TypeDocument, Record<StatutDocument, readonly StatutDocument[]>> = {
  quittance: CHEMIN_ARRIVE_FAIT,
  cmc: CHEMIN_ARRIVE_FAIT,
  carte_grise: CHEMIN_PRESTATAIRE,
  plaque: CHEMIN_PRESTATAIRE,
};

/** Ce document est-il confié à un intervenant externe ? */
export function passeParUnPrestataire(type: TypeDocument): boolean {
  return CHEMIN[type] === CHEMIN_PRESTATAIRE;
}

/** Ce passage est-il permis pour ce type de document ? */
export function transitionAutorisee(
  type: TypeDocument,
  de: StatutDocument,
  vers: StatutDocument,
): boolean {
  return CHEMIN[type][de].includes(vers);
}

/** Ce qu'on propose à l'écran. Vide sur un statut terminal. */
export function statutsSuivants(
  type: TypeDocument,
  de: StatutDocument,
): readonly StatutDocument[] {
  return CHEMIN[type][de];
}

/** Un statut dont plus rien ne peut sortir : le document a fini sa vie. */
export function estStatutTerminal(type: TypeDocument, statut: StatutDocument): boolean {
  return CHEMIN[type][statut].length === 0;
}

/** Ce que la clôture regarde. Rien d'autre n'entre en compte (§7.1). */
export type EtatDossier = {
  documents: readonly { type: TypeDocument; statut: StatutDocument }[];
  /** `statutPaiement === 'solde'` : plus rien n'est dû. */
  soldee: boolean;
  /** La moto est chez le client. Fausse tant que des tranches ne sont pas soldées. */
  motoRemise: boolean;
};

/** Un document réglé : remis au client, ou écarté de la vente. */
function estRegle(statut: StatutDocument): boolean {
  return statut === "remis_client" || statut === "non_applicable";
}

/**
 * Le dossier peut-il se clore ? (§7.1)
 *
 * Les quatre documents réglés, la vente soldée, la moto partie. Les trois à la
 * fois : une vente en tranches entièrement payée dont la moto dort encore au
 * magasin n'est pas un dossier fini, et c'est précisément la confusion que le
 * cahier interdit entre crédit et tranches (§13).
 *
 * On exige les **quatre** types, pas « au moins zéro » : un dossier dont les
 * documents ne sont pas encore chargés passerait sinon pour un dossier complet.
 */
export function dossierCloturable(etat: EtatDossier): boolean {
  if (!etat.soldee || !etat.motoRemise) return false;

  return TYPES_DOCUMENT.every((type) => {
    const document = etat.documents.find((candidat) => candidat.type === type);
    return document !== undefined && estRegle(document.statut);
  });
}

/**
 * La date annoncée au client est-elle dépassée ?
 *
 * Comparé de jour à jour, pas d'instant à instant : une carte grise attendue le
 * 2 n'est pas en retard à 8 h le 2 parce qu'elle a été saisie à 14 h la veille.
 *
 * Le calcul prend l'horloge de l'appareil, ce qui le rend juste même sans
 * réseau, où aucune horloge serveur n'est joignable.
 */
export function estEnRetard(estimee: Date | null, aujourdhui: Date): boolean {
  if (!estimee) return false;
  return debutDeJournee(estimee) < debutDeJournee(aujourdhui);
}

function debutDeJournee(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

/* --- Le dépôt chez un prestataire ---------------------------------------- */

/**
 * Ce que le gérant saisit en confiant un document à un prestataire (§7.2).
 *
 * `disponibleLe` est la seule ligne facultative : c'est une estimation, et le
 * prestataire ne la donne pas toujours. Son absence ne bloque rien — elle prive
 * seulement le dossier du filtre « en retard », ce que la liste dit elle-même.
 */
export type SaisieDepot = {
  prestataireId: string;
  /** Le nom du prestataire choisi, recopié sur le document : la liste des
      dossiers doit dire qui détient quoi sans relire une fiche par ligne. */
  prestataireNom: string;
  /** Format de `<input type="date">` : `aaaa-mm-jj`. */
  deposeLe: string;
  avance: string;
  /** L'avance sort de la caisse : par quel moyen, il faut le dire. */
  moyenPaiement: MoyenPaiement;
  /** Facultatif. Même format. */
  disponibleLe: string;
};

/** Un jour saisi dans un `<input type="date">`, à midi pour échapper aux fuseaux. */
export function lireJour(brut: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(brut)) return null;
  const [annee, mois, jour] = brut.split("-").map(Number);
  const date = new Date(annee, mois - 1, jour, 12);
  /* `new Date(2026, 1, 31)` donne le 3 mars sans se plaindre. On refuse plutôt
     que d'enregistrer une date que personne n'a voulue. */
  if (date.getFullYear() !== annee || date.getMonth() !== mois - 1 || date.getDate() !== jour) {
    return null;
  }
  return date;
}

export function validerDepot(saisie: SaisieDepot): string | null {
  if (!saisie.prestataireId) {
    return "Choisissez le prestataire à qui vous confiez le document.";
  }

  const depose = lireJour(saisie.deposeLe);
  if (!depose) return "Indiquez la date du dépôt.";

  const montant = lireMontant(saisie.avance);
  if (montant === null) {
    return "L’avance doit être un montant en francs, sans virgule ni centimes.";
  }
  /* Zéro n'est pas une avance : c'est un travail confié à crédit, et le crédit
     se modélise ailleurs (§13). Les confondre ferait apparaître des documents
     déposés sans contrepartie en caisse, que rien ne viendrait solder. */
  if (montant <= 0) {
    return "Une avance est un premier versement : sans montant, le travail est confié à crédit.";
  }
  if (montant > MONTANT_MAX) return "L’avance dépasse le maximum admis.";

  if (saisie.disponibleLe) {
    const disponible = lireJour(saisie.disponibleLe);
    if (!disponible) return "La date de disponibilité annoncée n’est pas une date.";
    if (disponible < depose) {
      return "La date annoncée est antérieure au dépôt.";
    }
  }

  return null;
}
