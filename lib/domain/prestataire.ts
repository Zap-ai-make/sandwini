/**
 * Les prestataires — ceux à qui l'on confie une carte grise ou une plaque.
 *
 * Ils ne sont pas de simples noms dans une liste : un dossier leur est remis,
 * une avance leur est versée, et le client demande où en est son document. Le
 * téléphone en fait donc partie, et le type de document aussi — proposer un
 * fabricant de plaques pour une carte grise serait une erreur qui ne se voit
 * qu'une semaine plus tard.
 */

export const TYPES_DOCUMENTS = ["carte_grise", "plaque"] as const;
export type TypeDocument = (typeof TYPES_DOCUMENTS)[number];

export const LIBELLE_TYPE_DOCUMENT: Record<TypeDocument, string> = {
  carte_grise: "Carte grise",
  plaque: "Plaque",
};

export type Prestataire = {
  id: string;
  nom: string;
  telephone: string;
  typesDocuments: TypeDocument[];
  actif: boolean;
};

export type SaisiePrestataire = {
  nom: string;
  telephone: string;
  typesDocuments: TypeDocument[];
};

export const LONGUEUR_NOM_MAX = 60;
export const LONGUEUR_TELEPHONE_MAX = 40;

export function estTypeDocument(valeur: unknown): valeur is TypeDocument {
  return typeof valeur === "string" && (TYPES_DOCUMENTS as readonly string[]).includes(valeur);
}

export function validerPrestataire(saisie: SaisiePrestataire): string | null {
  const nom = saisie.nom.trim();
  if (!nom) return "Donnez un nom au prestataire.";
  if (nom.length > LONGUEUR_NOM_MAX) return `Le nom dépasse ${LONGUEUR_NOM_MAX} caractères.`;

  const telephone = saisie.telephone.trim();
  if (!telephone) return "Le téléphone est obligatoire : c’est par là qu’on relance un dossier.";
  if (telephone.length > LONGUEUR_TELEPHONE_MAX) {
    return `Le téléphone dépasse ${LONGUEUR_TELEPHONE_MAX} caractères.`;
  }

  if (saisie.typesDocuments.length === 0) {
    return "Choisissez au moins un type de document, sinon ce prestataire ne sera jamais proposé.";
  }
  if (!saisie.typesDocuments.every(estTypeDocument)) return "Type de document inconnu.";
  return null;
}

export function normaliserPrestataire(saisie: SaisiePrestataire): SaisiePrestataire {
  return {
    nom: saisie.nom.trim(),
    telephone: saisie.telephone.trim(),
    /* Ordre stable et sans doublon : le document est comparé champ à champ par
       les règles, et une liste qui change d'ordre à chaque enregistrement
       produirait des écritures qui ne changent rien. */
    typesDocuments: TYPES_DOCUMENTS.filter((type) => saisie.typesDocuments.includes(type)),
  };
}

export function libelleTypes(types: TypeDocument[]): string {
  if (types.length === 0) return "Aucun type de document";
  return types.map((type) => LIBELLE_TYPE_DOCUMENT[type]).join(" et ");
}
