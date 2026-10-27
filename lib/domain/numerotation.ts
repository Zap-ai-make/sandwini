import { LONGUEUR_CODE } from "./boutique";

/**
 * La numérotation des pièces comptables (`prompt.md` §3.3, `DECISIONS.md` D5).
 *
 * Format `{CODE_BOUTIQUE}-{AAMM}-{NNNN}`, par exemple `PTG-2608-0042`. Un
 * gérant doit pouvoir dicter ce numéro au téléphone et le retrouver dans un
 * classeur : c’est pour cela qu’il est lisible plutôt qu’aléatoire, et c’est ce
 * qui interdit un identifiant technique à la place.
 *
 * **La contrainte qui commande tout : le numéro s’attribue hors ligne.** Aucun
 * compteur central n’est joignable au comptoir, donc chaque appareil tient le
 * sien. Deux appareils de la même boutique, tous deux sans réseau, peuvent donc
 * sortir le même numéro le même jour — le mécanisme ne l’empêche pas, il le
 * répare : à la synchronisation, le serveur tranche et suffixe la pièce arrivée
 * en second (`-B`, `-C`…).
 *
 * Ce module ne contient que du calcul : ni Firestore, ni stockage, ni React.
 * Ce que ce module ne contient **pas** : la résolution des collisions. Elle
 * n’a lieu que sur le serveur, et vit donc dans `functions/src/numerotation.ts`.
 * Ici on sait *lire* un suffixe, jamais en fabriquer un. Le compteur de
 * l’appareil, lui, vit dans `lib/numerotation/compteur.ts`.
 */

/** Quatre chiffres suffisent à un mois de comptoir ; au-delà, le numéro s’allonge plutôt que de reboucler. */
export const LONGUEUR_COMPTEUR = 4;

export type Numero = {
  /** Le code de la boutique, ex. `PTG`. */
  code: string;
  /** Année sur deux chiffres et mois, ex. `2608` pour août 2026. */
  periode: string;
  /** Le rang de la pièce dans son mois, ex. `42`. */
  compteur: number;
  /** `0` pour le numéro d’origine, `1` pour `-B`, `2` pour `-C`… (cf. `suffixeDeRang`). */
  rang: number;
};

const MOTIF = new RegExp(`^([A-Z]{${LONGUEUR_CODE}})-([0-9]{4})-([0-9]{${LONGUEUR_COMPTEUR},})(?:-([A-Z]+))?$`);

/**
 * La période d’un numéro, lue sur **l’heure de l’appareil**.
 *
 * C’est assumé : sans réseau il n’y a pas d’autre horloge, et un téléphone mal
 * réglé produirait de toute façon une date de vente fausse. Le mois change donc
 * à minuit local, ce qui est aussi ce que la personne au comptoir attend.
 */
export function periodeDe(date: Date): string {
  const annee = String(date.getFullYear() % 100).padStart(2, "0");
  const mois = String(date.getMonth() + 1).padStart(2, "0");
  return `${annee}${mois}`;
}

/**
 * Compose un numéro. Jamais de suffixe ici : un appareil n’émet que des
 * numéros d’origine, et le suffixe est la réponse du serveur à une collision
 * que l’appareil ne pouvait pas voir.
 */
export function formaterNumero(code: string, periode: string, compteur: number): string {
  return `${code}-${periode}-${String(compteur).padStart(LONGUEUR_COMPTEUR, "0")}`;
}

/** Le contraire de `formaterNumero`. Rend `null` sur tout ce qui n’est pas un numéro. */
export function analyserNumero(brut: string): Numero | null {
  const trouve = MOTIF.exec(brut.trim());
  if (!trouve) return null;
  const [, code, periode, compteur, suffixe] = trouve;
  const rang = suffixe ? rangDeSuffixe(suffixe) : 0;
  if (rang === null) return null;
  return { code, periode, compteur: Number(compteur), rang };
}

export function estNumeroValide(brut: string): boolean {
  return analyserNumero(brut) !== null;
}

/**
 * Le numéro tel qu'il se lit sur le papier : le rang du mois, et rien d'autre.
 *
 * **« Trouve un bon format de reçu, pas chargé, compréhensible »** (27 octobre
 * 2026). `SDO-2610-0003` porte trois informations dont le client n'a que faire :
 * le code de la boutique — il sait chez qui il a acheté, c'est écrit en tête —
 * et le mois — il est écrit juste à côté, en toutes lettres. Reste le rang,
 * qui est ce qu'on dicte au téléphone et ce qu'on cherche dans un classeur.
 * C'est exactement ce que porte son carnet à souches : `N° 01579`.
 *
 * **Le suffixe de collision, lui, reste.** Quand le serveur a renuméroté une
 * pièce arrivée en second, deux reçus du même mois portent le même rang : les
 * confondre à l'écran annulerait le travail de la réconciliation. `0003-B`
 * s'affiche donc avec son suffixe.
 *
 * **Le numéro complet ne bouge pas en base.** C'est lui qui relie une vente à
 * ses versements, à son dossier et à sa trace serveur (D44) ; ce qui change
 * ici est ce qu'on en montre. Un numéro illisible — recopié de travers,
 * importé d'ailleurs — est rendu tel quel : mieux vaut un numéro étrange que
 * pas de numéro.
 */
export function numeroLisible(brut: string): string {
  const numero = analyserNumero(brut);
  if (!numero) return brut.trim();
  const rang = String(numero.compteur).padStart(LONGUEUR_COMPTEUR, "0");
  return numero.rang === 0 ? rang : `${rang}-${suffixeLu(brut)}`;
}

/** Les lettres de collision telles qu'elles sont écrites dans le numéro. */
function suffixeLu(brut: string): string {
  const trouve = MOTIF.exec(brut.trim());
  return trouve?.[4] ?? "";
}

/** L’inverse de `suffixeDeRang`, sur les lettres seules (`B` → 1). `null` si `A`, réservé à l’original. */
function rangDeSuffixe(lettres: string): number | null {
  let valeur = 0;
  for (const lettre of lettres) valeur = valeur * 26 + (lettre.charCodeAt(0) - 64);
  const rang = valeur - 1;
  return rang > 0 ? rang : null;
}

/**
 * Le compteur à attribuer à la prochaine pièce, d’après les numéros déjà connus.
 *
 * « Connus » veut dire : présents dans le cache Firestore de cet appareil. Hors
 * ligne, c’est tout ce dont on dispose, et c’est précisément pourquoi les
 * doublons existent. Les suffixes sont ignorés : `PTG-2608-0042-B` occupe le
 * rang 42, pas un rang de plus.
 */
export function prochainCompteur(numerosConnus: readonly string[], code: string, periode: string): number {
  let plusHaut = 0;
  for (const brut of numerosConnus) {
    const numero = analyserNumero(brut);
    if (!numero || numero.code !== code || numero.periode !== periode) continue;
    if (numero.compteur > plusHaut) plusHaut = numero.compteur;
  }
  return plusHaut + 1;
}
