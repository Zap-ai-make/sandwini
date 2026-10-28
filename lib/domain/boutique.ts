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
/* **Trois métiers depuis S59.** Les cartes grises sont traitées par quelqu'un
   qui ne fait que ça : le client veut qu'elle se choisisse sur la plaque jaune,
   au même titre que les motos et les pièces. On se branche sur l'axe qui décide
   déjà de ce qu'un compte voit (D62) plutôt que d'inventer un troisième rôle —
   le produit en a deux, et c'est délibéré. */
export const METIERS = ["motos", "pieces", "cartes_grises"] as const;
export type Metier = (typeof METIERS)[number];

export const LIBELLE_METIER: Record<Metier, string> = {
  motos: "Motos",
  pieces: "Pièces détachées",
  /* Le nom que le client emploie, repris mot pour mot. « Prestataires »
     désignait qui fait le travail ; lui parle de ce qui est produit. */
  cartes_grises: "Carte grise et plaque",
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
 * Le code, déduit du nom plutôt que tapé (23 octobre 2026).
 *
 * **Demande du commanditaire, et elle est juste.** On lui demandait trois
 * lettres dont il n'a que faire : elles n'existent que pour la numérotation des
 * reçus et pour servir d'identifiant de document. Un champ qu'on ne comprend
 * pas se remplit au hasard — et ce hasard-là se retrouve ensuite sur chaque
 * reçu imprimé, pour toujours, puisqu'un code ne se change pas.
 *
 * **Rien ne s'assouplit pour autant** : trois lettres, unique, définitif. Seule
 * la saisie disparaît.
 *
 * L'unicité se cherche dans un ordre qui garde le code lisible : d'abord les
 * trois premières lettres, puis les deux premières suivies de chaque lettre
 * suivante du nom — « Pouytenga » donne POU, puis POY, puis POT — et enfin
 * l'alphabet, quand le nom est épuisé. Un code reste ainsi reconnaissable par
 * qui lit un numéro de reçu.
 *
 * Rend `null` si le nom ne porte aucune lettre : il n'y a alors rien à
 * dériver, et inventer un code ferait apparaître des reçus que personne ne
 * rattacherait à son magasin.
 */
export function engendrerCode(nom: string, pris: ReadonlySet<string>): string | null {
  const lettres = normaliserCode(nom).replace(/[^A-Z]/g, "");
  if (!lettres) return null;

  const candidats: string[] = [];
  const base = (lettres + lettres[0].repeat(LONGUEUR_CODE)).slice(0, LONGUEUR_CODE - 1);

  candidats.push((lettres + lettres[0].repeat(LONGUEUR_CODE)).slice(0, LONGUEUR_CODE));
  for (const lettre of lettres.slice(LONGUEUR_CODE - 1)) candidats.push(base + lettre);
  for (const lettre of "ABCDEFGHIJKLMNOPQRSTUVWXYZ") candidats.push(base + lettre);

  return candidats.find((candidat) => estCodeValide(candidat) && !pris.has(candidat)) ?? null;
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

  /* **Le code n'est plus validé ici** : il n'est plus saisi. `engendrerCode`
     le dérive du nom et ne rend qu'une forme que la base accepte. Le seul cas
     qui reste est un nom sans aucune lettre — un numéro, par exemple — et
     c'est l'écran de création qui le dit, là où il peut nommer le nom fautif. */

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

/**
 * Le nom d'une boutique, pour une ligne qui ne porte que son identifiant.
 * Une boutique inconnue rend son identifiant : un vide ferait croire que la
 * ligne n'appartient à aucune boutique.
 */
export function nomDeBoutique(boutiques: readonly Boutique[], id: string): string {
  return boutiques.find((boutique) => boutique.id === id)?.nom ?? id;
}

/** Tri d'affichage : les boutiques actives d'abord, puis par nom. */
export function comparerBoutiques(a: Boutique, b: Boutique): number {
  if (a.actif !== b.actif) return a.actif ? -1 : 1;
  return a.nom.localeCompare(b.nom, "fr");
}
