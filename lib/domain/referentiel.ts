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

/**
 * Valide un nom de référentiel. Renvoie le message à afficher, ou `null`.
 *
 * **`designation` est la phrase entière, déterminant compris** — « cette
 * marque », « ce modèle ». Elle se fabriquait ici, en collant « cette » devant
 * le singulier reçu, ce qui écrivait « cette modèle » et « cette type de
 * frais » à l'écran d'un produit entièrement rédigé en français. Le genre ne
 * se déduit pas d'une chaîne ; il vient de l'appelant, qui le connaît — c'est
 * déjà ce que fait `ListeReferentiel` avec son `determinant`.
 */
export function validerNom(nom: string, designation = "cet élément"): string | null {
  const propre = nom.trim();
  if (!propre) return `Donnez un nom à ${designation}.`;
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

/**
 * L'entrée qui porte déjà ce nom, s'il y en a une — active ou non.
 *
 * C'est ce qui remplace le référentiel fermé depuis S39 : la marque se tape
 * désormais sur le formulaire d'entrée en stock, donc plus rien n'empêche
 * « apsonic » d'être saisi le jour où « Apsonic » existe. On ne l'empêche pas,
 * on le reconnaît — et on rend l'entrée existante plutôt que d'en créer une
 * seconde. Les désactivées comptent : une marque qu'on retape est une marque
 * qu'on veut, et en créer un double couperait le stock en deux.
 */
export function trouverParNom<T extends Referentiel>(
  nom: string,
  existants: T[],
  sauf?: string,
): T | undefined {
  const cible = reduire(nom);
  if (!cible) return undefined;
  return existants.find((entree) => entree.id !== sauf && reduire(entree.nom) === cible);
}

export function nomDejaPris(nom: string, existants: Referentiel[], sauf?: string): boolean {
  return trouverParNom(nom, existants, sauf) !== undefined;
}

/**
 * Les entrées à proposer dans une liste de choix.
 *
 * Les actives, plus **celle qui est déjà choisie** même si elle ne l'est plus.
 * Sans cette seconde règle, désactiver une marque la faisait disparaître du
 * `<select>` de toutes les motos qui la citent : le champ retombait sur son
 * invite, et enregistrer la fiche effaçait silencieusement la marque. Le défaut
 * existait avant S39 et n'avait jamais mordu parce que rien ne se désactivait.
 */
export function optionsAvecChoix<T extends Referentiel>(entrees: T[], choisi: string): T[] {
  const actives = entrees.filter((entree) => entree.actif);
  if (!choisi || actives.some((entree) => entree.id === choisi)) return actives;
  const retenue = entrees.find((entree) => entree.id === choisi);
  return retenue ? [retenue, ...actives] : actives;
}

/** Tri d'affichage : les entrées actives d'abord, puis par nom. */
export function comparerReferentiels(a: Referentiel, b: Referentiel): number {
  if (a.actif !== b.actif) return a.actif ? -1 : 1;
  return a.nom.localeCompare(b.nom, "fr");
}
