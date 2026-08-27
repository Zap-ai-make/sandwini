import { formaterNumero, periodeDe, prochainCompteur } from "../domain/numerotation";

/**
 * Le compteur de numéros de cet appareil.
 *
 * Il répond à une seule question : quel numéro donner à la prochaine pièce,
 * maintenant, sans réseau. Deux sources, et on prend la plus haute des deux.
 *
 * - **Ce que l’appareil a déjà distribué**, gardé en `localStorage`. Sans lui,
 *   deux ventes faites d’affilée hors ligne porteraient le même numéro, puisque
 *   la première n’est pas encore visible côté serveur.
 * - **Ce que l’appareil connaît de la boutique**, c’est-à-dire les numéros
 *   présents dans le cache Firestore. Sans eux, un appareil neuf repartirait de
 *   1 et entrerait en collision avec tout le mois écoulé.
 *
 * Ce que ce compteur ne peut pas faire : savoir ce qu’un **autre** appareil
 * hors ligne est en train de distribuer. C’est admis par construction, et c’est
 * la Cloud Function qui répare (`DECISIONS.md` D5).
 *
 * **Ce compteur survit à la déconnexion**, contrairement au périmètre mémorisé
 * et au cache Firestore. C’est délibéré : la déconnexion vide justement le
 * cache, donc elle supprime l’autre source. Effacer le compteur en même temps
 * ferait repartir l’appareil de 1 et fabriquerait en série les doublons qu’il
 * existe pour éviter.
 */

const PREFIXE = "sdi.numerotation.";

/* Recours quand `localStorage` est indisponible — navigation privée, quota
   plein. Un compteur qui ne survit pas à la fermeture de l’onglet vaut mieux
   qu’un écran de vente qui refuse de s’ouvrir. */
const enMemoire = new Map<string, number>();

/* `globalThis` plutôt que `window` : le module est ainsi vérifiable hors
   navigateur, où l’on pose un stockage factice à la place. */
function stockage(): Storage | null {
  try {
    return typeof globalThis.localStorage === "undefined" ? null : globalThis.localStorage;
  } catch {
    return null;
  }
}

function cle(boutiqueId: string, periode: string): string {
  return `${PREFIXE}${boutiqueId}.${periode}`;
}

function lireDernier(boutiqueId: string, periode: string): number {
  const identifiant = cle(boutiqueId, periode);
  try {
    const brut = stockage()?.getItem(identifiant);
    if (brut !== null && brut !== undefined) {
      const valeur = Number(brut);
      if (Number.isInteger(valeur) && valeur >= 0) return valeur;
    }
  } catch {
    // On retombe sur la mémoire vive.
  }
  return enMemoire.get(identifiant) ?? 0;
}

function ecrireDernier(boutiqueId: string, periode: string, compteur: number): void {
  const identifiant = cle(boutiqueId, periode);
  enMemoire.set(identifiant, compteur);
  try {
    stockage()?.setItem(identifiant, String(compteur));
  } catch {
    // Le compteur vaudra pour cette session seulement.
  }
}

export type Numeroteur = {
  /** L’identifiant de la boutique, qui isole les compteurs les uns des autres. */
  boutiqueId: string;
  /** Son code à trois lettres, qui entre dans le numéro. */
  code: string;
};

/**
 * Le numéro que porterait la prochaine pièce, **sans le consommer**.
 *
 * Sert à montrer, pas à attribuer : un numéro affiché puis abandonné laisserait
 * un trou dans la série.
 */
export function prochainNumero(
  boutique: Numeroteur,
  numerosConnus: readonly string[],
  maintenant: Date = new Date(),
): string {
  const periode = periodeDe(maintenant);
  const compteur = Math.max(
    lireDernier(boutique.boutiqueId, periode) + 1,
    prochainCompteur(numerosConnus, boutique.code, periode),
  );
  return formaterNumero(boutique.code, periode, compteur);
}

/**
 * Attribue un numéro et le retire de la circulation sur cet appareil.
 *
 * À n’appeler qu’au moment d’enregistrer réellement une pièce. Deux onglets de
 * la même application peuvent théoriquement réserver en même temps et obtenir
 * le même numéro — `localStorage` n’offre pas d’écriture atomique entre
 * onglets. Le cas est laissé à la réconciliation serveur, qui traite déjà
 * exactement cette collision entre deux appareils.
 */
export function reserverNumero(
  boutique: Numeroteur,
  numerosConnus: readonly string[],
  maintenant: Date = new Date(),
): string {
  const periode = periodeDe(maintenant);
  const numero = prochainNumero(boutique, numerosConnus, maintenant);
  const compteur = Number(numero.slice(numero.lastIndexOf("-") + 1));
  ecrireDernier(boutique.boutiqueId, periode, compteur);
  return numero;
}

/** Remet l’appareil à zéro. Réservé aux tests : en usage réel, oublier revient à fabriquer des doublons. */
export function oublierCompteurs(): void {
  enMemoire.clear();
  try {
    const memoire = stockage();
    if (!memoire) return;
    const aSupprimer: string[] = [];
    for (let i = 0; i < memoire.length; i += 1) {
      const identifiant = memoire.key(i);
      if (identifiant?.startsWith(PREFIXE)) aSupprimer.push(identifiant);
    }
    for (const identifiant of aSupprimer) memoire.removeItem(identifiant);
  } catch {
    // Rien de plus à faire.
  }
}
