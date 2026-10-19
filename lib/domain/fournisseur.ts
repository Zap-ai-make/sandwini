/**
 * Les fournisseurs — ceux de qui les motos arrivent, par lots.
 *
 * KYSG n'en garde qu'un nom, tapé à la main sur chaque arrivage. On en fait un
 * fichier : on l'ajoute une fois, avec ce qui sert à le relancer (téléphone,
 * localité), puis on le choisit. Le nom seul suffit à exister — un numéro
 * manquant ne doit pas bloquer la saisie d'un lot qui arrive au comptoir.
 */

export type Fournisseur = {
  id: string;
  nom: string;
  telephone: string;
  localite: string;
  actif: boolean;
};

export type SaisieFournisseur = {
  nom: string;
  telephone: string;
  localite: string;
};

export const FOURNISSEUR_VIDE: SaisieFournisseur = { nom: "", telephone: "", localite: "" };

export const LONGUEUR_NOM_MAX = 80;
export const LONGUEUR_TELEPHONE_MAX = 40;
export const LONGUEUR_LOCALITE_MAX = 80;

export function validerFournisseur(saisie: SaisieFournisseur): string | null {
  const nom = saisie.nom.trim();
  if (!nom) return "Donnez un nom au fournisseur.";
  if (nom.length > LONGUEUR_NOM_MAX) return `Le nom dépasse ${LONGUEUR_NOM_MAX} caractères.`;

  if (saisie.telephone.trim().length > LONGUEUR_TELEPHONE_MAX) {
    return `Le téléphone dépasse ${LONGUEUR_TELEPHONE_MAX} caractères.`;
  }
  if (saisie.localite.trim().length > LONGUEUR_LOCALITE_MAX) {
    return `La localité dépasse ${LONGUEUR_LOCALITE_MAX} caractères.`;
  }
  return null;
}

export function normaliserFournisseur(saisie: SaisieFournisseur): SaisieFournisseur {
  return {
    nom: saisie.nom.trim(),
    telephone: saisie.telephone.trim(),
    localite: saisie.localite.trim(),
  };
}
