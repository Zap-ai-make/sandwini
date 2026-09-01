/**
 * Une boutique — le point de vente physique (`prompt.md` §3.2).
 *
 * Son **code** de trois lettres n'est pas un ornement : il entre dans le numéro
 * de chaque reçu (`PTG-2608-0042`, cf. `DECISIONS.md` D5) et il sert
 * d'identifiant de document. Un code qui change casserait la numérotation déjà
 * imprimée, donc il ne change pas.
 *
 * Ses **métiers** disent ce qu'elle vend. L'entreprise tient des boutiques de
 * motos et une boutique de pièces détachées ; c'est le magasin physique qui
 * porte le métier, pas un rayon à l'intérieur (`DECISIONS.md` D62). De là
 * découle ce qu'un gérant voit : sa boutique ne vend pas de pièces, l'espace
 * pièces n'existe pas pour lui.
 */

/**
 * Un tableau plutôt qu'une valeur unique : rien n'interdit qu'une boutique
 * finisse par tenir les deux, et ce jour-là le modèle n'a pas à être repeint.
 */
export const METIERS = ["motos", "pieces"] as const;
export type Metier = (typeof METIERS)[number];

export const LIBELLE_METIER: Record<Metier, string> = {
  motos: "Motos",
  pieces: "Pièces détachées",
};

export function estMetier(valeur: unknown): valeur is Metier {
  return typeof valeur === "string" && (METIERS as readonly string[]).includes(valeur);
}

export type Boutique = {
  /** Identique au code : `boutiques/{code}` (cf. D30). */
  id: string;
  nom: string;
  code: string;
  /** Ce que cette boutique vend. Au moins un métier, jamais vide. */
  metiers: Metier[];
  adresse: string;
  telephone: string;
  actif: boolean;
};

export type SaisieBoutique = {
  nom: string;
  code: string;
  metiers: Metier[];
  adresse: string;
  telephone: string;
};

export const LONGUEUR_CODE = 3;
export const LONGUEUR_NOM_MAX = 80;
export const LONGUEUR_ADRESSE_MAX = 200;
export const LONGUEUR_TELEPHONE_MAX = 40;

/**
 * Met un code saisi à la main sous sa forme canonique.
 *
 * On corrige ce qui n'est qu'une question de frappe — minuscules, espaces,
 * accents — et rien d'autre. Tronquer silencieusement un code trop long, ce
 * serait enregistrer autre chose que ce que la personne a tapé.
 */
export function normaliserCode(brut: string): string {
  return brut
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, "")
    .toUpperCase();
}

export function estCodeValide(code: string): boolean {
  return new RegExp(`^[A-Z]{${LONGUEUR_CODE}}$`).test(code);
}

/**
 * Range les métiers dans l'ordre de `METIERS` et retire les doublons.
 *
 * L'ordre vient de la déclaration, pas de l'ordre de clic : deux boutiques aux
 * mêmes métiers ont ainsi le même tableau en base, et les comparer ne demande
 * pas de les trier d'abord.
 */
export function normaliserMetiers(bruts: readonly unknown[]): Metier[] {
  return METIERS.filter((metier) => bruts.includes(metier));
}

/**
 * Valide une saisie de boutique et renvoie le message à afficher, ou `null` si
 * tout va bien.
 *
 * Ces mêmes contraintes sont réécrites dans `firestore.rules` : ici c'est du
 * confort de saisie, là-bas c'est la seule vérification qui compte
 * (`SECURITY.md` §1). Les deux doivent rester d'accord.
 */
export function validerBoutique(saisie: SaisieBoutique): string | null {
  const nom = saisie.nom.trim();
  if (!nom) return "Donnez un nom à la boutique.";
  if (nom.length > LONGUEUR_NOM_MAX) return `Le nom dépasse ${LONGUEUR_NOM_MAX} caractères.`;

  const code = normaliserCode(saisie.code);
  if (!code) return "Le code est obligatoire : il apparaît sur chaque reçu.";
  if (!estCodeValide(code)) {
    return `Le code doit faire exactement ${LONGUEUR_CODE} lettres, sans chiffre ni accent.`;
  }

  /* Une boutique sans métier n'ouvre aucun espace : son gérant se connecterait
     sur une application vide, sans rien à corriger de son côté. */
  if (normaliserMetiers(saisie.metiers).length === 0) {
    return "Choisissez ce que cette boutique vend.";
  }

  if (saisie.adresse.trim().length > LONGUEUR_ADRESSE_MAX) {
    return `L’adresse dépasse ${LONGUEUR_ADRESSE_MAX} caractères.`;
  }
  if (saisie.telephone.trim().length > LONGUEUR_TELEPHONE_MAX) {
    return `Le téléphone dépasse ${LONGUEUR_TELEPHONE_MAX} caractères.`;
  }
  return null;
}

/** Met la saisie sous la forme exacte qui part en base. */
export function normaliserBoutique(saisie: SaisieBoutique): SaisieBoutique {
  return {
    nom: saisie.nom.trim(),
    code: normaliserCode(saisie.code),
    metiers: normaliserMetiers(saisie.metiers),
    adresse: saisie.adresse.trim(),
    telephone: saisie.telephone.trim(),
  };
}

/** Les métiers réunis de plusieurs boutiques — le périmètre « toutes ». */
export function reunirMetiers(boutiques: readonly Boutique[]): Metier[] {
  return METIERS.filter((metier) =>
    boutiques.some((boutique) => boutique.metiers.includes(metier)),
  );
}

/** Tri d'affichage : les boutiques actives d'abord, puis par nom. */
export function comparerBoutiques(a: Boutique, b: Boutique): number {
  if (a.actif !== b.actif) return a.actif ? -1 : 1;
  return a.nom.localeCompare(b.nom, "fr");
}
