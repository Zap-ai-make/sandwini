/**
 * Les référentiels — le vocabulaire de la maison.
 *
 * Marques, modèles, provenances, types de frais : ce sont les mots dans
 * lesquels les écrans de saisie feront choisir, plutôt que de laisser taper du
 * texte libre. « Yamaha » écrit de quatre façons différentes donnerait quatre
 * marques et un stock illisible.
 *
 * Trois d'entre eux ont exactement la même forme — un nom, un état. Le
 * quatrième, le modèle, ajoute sa marque. On ne leur invente pas trois types
 * différents pour faire riche.
 */

export type Referentiel = {
  id: string;
  nom: string;
  actif: boolean;
};

/** Un modèle appartient à une marque : c'est tout ce qui le distingue. */
export type Modele = Referentiel & {
  marqueId: string;
};

export const LONGUEUR_NOM_MAX = 60;

/**
 * Les collections de référentiels que S4 ouvre.
 *
 * Cette liste n'est pas décorative : les règles Firestore la connaissent aussi,
 * et l'interface s'en sert pour ne pas répéter quatre fois le même écran.
 */
export const COLLECTIONS_REFERENTIEL = ["marques", "provenances", "typesFrais"] as const;
export type CollectionReferentiel = (typeof COLLECTIONS_REFERENTIEL)[number];

export const LIBELLE_COLLECTION: Record<CollectionReferentiel, { singulier: string; pluriel: string }> = {
  marques: { singulier: "marque", pluriel: "Marques" },
  provenances: { singulier: "provenance", pluriel: "Provenances" },
  typesFrais: { singulier: "type de frais", pluriel: "Types de frais" },
};

/** Valide un nom de référentiel. Renvoie le message à afficher, ou `null`. */
export function validerNom(nom: string, singulier = "élément"): string | null {
  const propre = nom.trim();
  if (!propre) return `Donnez un nom à ${singulier === "élément" ? "cet élément" : `cette ${singulier}`}.`;
  if (propre.length > LONGUEUR_NOM_MAX) {
    return `Le nom dépasse ${LONGUEUR_NOM_MAX} caractères.`;
  }
  return null;
}

/**
 * Deux entrées qui ne diffèrent que par la casse ou les accents sont la même.
 *
 * « Yamaha » et « yamaha » saisies toutes les deux, ce sont deux marques dans
 * les listes de choix et un stock coupé en deux. On compare donc sur une forme
 * réduite, sans pour autant modifier ce que la personne a tapé.
 */
export function reduire(nom: string): string {
  return nom
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

export function nomDejaPris(nom: string, existants: Referentiel[], sauf?: string): boolean {
  const cible = reduire(nom);
  return existants.some((entree) => entree.id !== sauf && reduire(entree.nom) === cible);
}

/** Tri d'affichage : les entrées actives d'abord, puis par nom. */
export function comparerReferentiels(a: Referentiel, b: Referentiel): number {
  if (a.actif !== b.actif) return a.actif ? -1 : 1;
  return a.nom.localeCompare(b.nom, "fr");
}
