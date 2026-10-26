/**
 * Un montant écrit en toutes lettres (26 octobre 2026).
 *
 * **Pourquoi ce module existe.** La facture du commanditaire porte la mention
 * « Arrêtée à la somme de : … », et ce n'est pas un ornement : sur une pièce
 * commerciale, la somme en lettres fait foi contre les chiffres, précisément
 * parce qu'on ne lui ajoute pas un zéro d'un trait de stylo. Elle s'écrivait à
 * la main sur le carnet à souches que ce logiciel remplace (D70).
 *
 * **L'orthographe des nombres est une règle, pas une approximation**, et le
 * client relira la ligne. Ce qui est tenu ici : « quatre-vingts » prend son s
 * seul et le perd suivi d'un autre nombre ; « cent » fait de même ; « mille »
 * est invariable là où « million » et « milliard » s'accordent ; « et » lie
 * vingt et un comme soixante et onze, mais jamais quatre-vingt-un.
 *
 * Les entiers seuls, parce que le FCFA ne se divise pas (D16) : un montant à
 * virgule est une erreur de saisie, pas une valeur à arrondir.
 */

const UNITES = [
  "zéro",
  "un",
  "deux",
  "trois",
  "quatre",
  "cinq",
  "six",
  "sept",
  "huit",
  "neuf",
  "dix",
  "onze",
  "douze",
  "treize",
  "quatorze",
  "quinze",
  "seize",
] as const;

const DIZAINES: Record<number, string> = {
  2: "vingt",
  3: "trente",
  4: "quarante",
  5: "cinquante",
  6: "soixante",
  8: "quatre-vingt",
};

/**
 * De 0 à 99.
 *
 * `accorde` dit si le s de « quatre-vingts » a le droit de rester : il tombe
 * devant « mille », qui n'est pas un nom, et reste devant « millions », qui en
 * est un. Voir `ECHELLES`.
 */
function sousCent(nombre: number, accorde: boolean): string {
  if (nombre < 17) return UNITES[nombre];
  if (nombre < 20) return `dix-${UNITES[nombre - 10]}`;

  const dizaine = Math.floor(nombre / 10);
  const unite = nombre % 10;

  /* Soixante-dix et quatre-vingt-dix n'ont pas de nom à eux : ils comptent par
     seize au-dessus de soixante et de quatre-vingt. */
  if (dizaine === 7 || dizaine === 9) {
    const base = DIZAINES[dizaine - 1];
    const reste = nombre - (dizaine - 1) * 10;
    /* « soixante et onze », mais « quatre-vingt-onze » : le « et » ne se dit
       pas après quatre-vingt. */
    if (reste === 11 && dizaine === 7) return `${base} et onze`;
    return `${base}-${sousCent(reste, accorde)}`;
  }

  const base = DIZAINES[dizaine];
  if (unite === 0) {
    /* Quatre-vingts prend son s quand rien ne le suit, et le perd sinon. */
    return dizaine === 8 && accorde ? `${base}s` : base;
  }
  /* « vingt et un », mais « quatre-vingt-un ». */
  if (unite === 1 && dizaine !== 8) return `${base} et un`;
  return `${base}-${UNITES[unite]}`;
}

/** De 0 à 999. `accorde` : voir `sousCent`. */
function sousMille(nombre: number, accorde = true): string {
  const centaines = Math.floor(nombre / 100);
  const reste = nombre % 100;
  if (centaines === 0) return sousCent(reste, accorde);

  /* « cent » et non « un cent ». Le s de « deux cents » tombe dès qu'un nombre
     le suit — « deux cent un » — et aussi devant « mille ». */
  const pluriel = reste === 0 && accorde;
  const tete = centaines === 1 ? "cent" : `${UNITES[centaines]} cent${pluriel ? "s" : ""}`;
  return reste === 0 ? tete : `${tete} ${sousMille(reste, accorde)}`;
}

/**
 * Les tranches de mille, de la plus grande à la plus petite.
 *
 * `accorde` ne dit pas seulement si l'échelle prend un s : il commande aussi
 * celui du nombre qui la précède. « Mille » est un adverbe de nombre, donc
 * « quatre-vingt mille » et « deux cent mille » ; « million » est un nom, donc
 * « quatre-vingts millions » et « deux cents millions ».
 */
const ECHELLES: { valeur: number; singulier: string; accorde: boolean }[] = [
  { valeur: 1_000_000_000, singulier: "milliard", accorde: true },
  { valeur: 1_000_000, singulier: "million", accorde: true },
  /* « Mille » est invariable, et ne se fait jamais précéder d'un « un ». */
  { valeur: 1_000, singulier: "mille", accorde: false },
];

/**
 * Le nombre en toutes lettres, sans unité monétaire.
 *
 * Un nombre négatif ou à virgule n'a pas de place sur une facture : on rend
 * alors la chaîne vide plutôt qu'une phrase fausse, et le reçu n'imprime pas
 * la ligne. Taire une mention vaut mieux que la mentir.
 */
export function nombreEnLettres(nombre: number): string {
  if (!Number.isSafeInteger(nombre) || nombre < 0) return "";
  if (nombre < 1000) return sousMille(nombre);

  const morceaux: string[] = [];
  let reste = nombre;

  for (const echelle of ECHELLES) {
    const combien = Math.floor(reste / echelle.valeur);
    if (combien === 0) continue;
    reste -= combien * echelle.valeur;

    if (!echelle.accorde) {
      /* « mille » seul, « deux mille », jamais « un mille ». */
      morceaux.push(combien === 1 ? "mille" : `${sousMille(combien, false)} mille`);
      continue;
    }
    const nom = combien === 1 ? echelle.singulier : `${echelle.singulier}s`;
    morceaux.push(`${sousMille(combien)} ${nom}`);
  }

  if (reste > 0) morceaux.push(sousMille(reste));
  return morceaux.join(" ");
}

/**
 * La mention telle qu'elle s'imprime : « Un million … francs CFA ».
 *
 * La majuscule initiale est celle d'une phrase, pas d'un nom propre : la
 * mention tient sa ligne à elle sur la facture.
 */
export function montantEnLettres(montant: number): string {
  const lettres = nombreEnLettres(montant);
  if (!lettres) return "";
  return `${lettres.charAt(0).toUpperCase()}${lettres.slice(1)} francs CFA`;
}
