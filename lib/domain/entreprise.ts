/**
 * L'identité de l'entreprise — ce qui s'imprime en haut de chaque reçu.
 *
 * Aucun nom commercial n'est écrit en dur dans le code (`DECISIONS.md` D15) :
 * tout vient d'ici, et donc de ce que le responsable a saisi.
 */

export type Entreprise = {
  nom: string;
  adresse: string;
  telephone: string;
  telephone2: string;
  /** Numéro d'identification fiscale, imprimé sur les reçus s'il est renseigné. */
  identifiant: string;
  /** Le logo encodé en `data:` — voir plus bas pourquoi il n'est pas dans Storage. */
  logo: string | null;
  /**
   * Au bout de combien de jours sans versement une vente en tranches est
   * signalée comme inactive (`prompt.md` §6.3, §14).
   *
   * Rangé ici et pas dans une collection de réglages : c'est le seul paramètre
   * chiffré de l'entreprise, et un document déjà lu à chaque ouverture le porte
   * sans coûter une lecture de plus. Il est arrivé en S9 et pas en S4 parce
   * qu'un réglage sans liste à alimenter est pire qu'un réglage absent (D37).
   */
  seuilInactiviteTranches: number;
};

/**
 * Trente jours, valeur par défaut du cahier des charges (§6.3).
 *
 * Les bornes ne sont pas décoratives : en dessous d'un jour la liste dirait
 * n'importe quoi, et au-delà d'un an elle ne dirait plus rien.
 */
export const SEUIL_INACTIVITE_DEFAUT = 30;
export const SEUIL_INACTIVITE_MIN = 1;
export const SEUIL_INACTIVITE_MAX = 365;

export const ENTREPRISE_VIDE: Entreprise = {
  nom: "",
  adresse: "",
  telephone: "",
  telephone2: "",
  identifiant: "",
  logo: null,
  seuilInactiviteTranches: SEUIL_INACTIVITE_DEFAUT,
};

export const LONGUEUR_NOM_MAX = 80;
export const LONGUEUR_ADRESSE_MAX = 200;
export const LONGUEUR_TELEPHONE_MAX = 40;
export const LONGUEUR_IDENTIFIANT_MAX = 40;

/**
 * Le logo voyage **dans le document Firestore**, encodé en `data:`.
 *
 * Un reçu doit s'imprimer sans réseau (`prompt.md` §10). Un logo servi depuis
 * Firebase Storage demanderait une requête au moment de l'impression, et
 * Storage n'a pas de file d'attente hors ligne (D14) : le premier reçu imprimé
 * sur un appareil neuf, en coupure, sortirait sans en-tête. Dans le document,
 * il arrive avec le cache Firestore et s'imprime comme le reste.
 *
 * Le prix à payer est une limite de taille, que Firestore impose de toute façon
 * (1 Mio par document). On la fixe bien en dessous : un logo de reçu tient
 * largement là-dedans une fois redimensionné, et le document est relu à chaque
 * ouverture de l'application.
 */
export const LOGO_LARGEUR_MAX = 512;
export const LOGO_OCTETS_MAX = 200_000;

/** Ce que le navigateur accepte de redimensionner sans surprise. */
export const LOGO_TYPES_ACCEPTES = ["image/png", "image/jpeg", "image/webp"] as const;

export function estLogoValide(donnees: string): boolean {
  return /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(donnees);
}

/** Taille réelle du `data:` une fois stocké — c'est la chaîne qui compte, pas l'image. */
export function tailleLogo(donnees: string): number {
  return donnees.length;
}

export function validerEntreprise(entreprise: Entreprise): string | null {
  const nom = entreprise.nom.trim();
  if (!nom) return "Le nom de l’entreprise est obligatoire : il s’imprime sur chaque reçu.";
  if (nom.length > LONGUEUR_NOM_MAX) return `Le nom dépasse ${LONGUEUR_NOM_MAX} caractères.`;

  if (entreprise.adresse.trim().length > LONGUEUR_ADRESSE_MAX) {
    return `L’adresse dépasse ${LONGUEUR_ADRESSE_MAX} caractères.`;
  }
  for (const [valeur, champ] of [
    [entreprise.telephone, "téléphone"],
    [entreprise.telephone2, "second téléphone"],
  ] as const) {
    if (valeur.trim().length > LONGUEUR_TELEPHONE_MAX) {
      return `Le ${champ} dépasse ${LONGUEUR_TELEPHONE_MAX} caractères.`;
    }
  }
  if (entreprise.identifiant.trim().length > LONGUEUR_IDENTIFIANT_MAX) {
    return `Le numéro d’identification dépasse ${LONGUEUR_IDENTIFIANT_MAX} caractères.`;
  }

  const seuil = entreprise.seuilInactiviteTranches;
  if (!Number.isInteger(seuil) || seuil < SEUIL_INACTIVITE_MIN || seuil > SEUIL_INACTIVITE_MAX) {
    return `Le seuil d’inactivité doit être un nombre de jours entre ${SEUIL_INACTIVITE_MIN} et ${SEUIL_INACTIVITE_MAX}.`;
  }

  if (entreprise.logo !== null) {
    if (!estLogoValide(entreprise.logo)) return "Ce fichier n’est pas une image utilisable.";
    if (tailleLogo(entreprise.logo) > LOGO_OCTETS_MAX) {
      return "Le logo est trop lourd même après réduction. Utilisez une image plus simple.";
    }
  }
  return null;
}

export function normaliserEntreprise(entreprise: Entreprise): Entreprise {
  return {
    nom: entreprise.nom.trim(),
    adresse: entreprise.adresse.trim(),
    telephone: entreprise.telephone.trim(),
    telephone2: entreprise.telephone2.trim(),
    identifiant: entreprise.identifiant.trim(),
    logo: entreprise.logo,
    seuilInactiviteTranches: entreprise.seuilInactiviteTranches,
  };
}

/** L'entreprise est-elle assez renseignée pour qu'un reçu soit présentable ? */
export function entrepriseComplete(entreprise: Entreprise): boolean {
  return Boolean(entreprise.nom.trim() && entreprise.telephone.trim());
}
