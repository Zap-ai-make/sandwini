/**
 * La réconciliation des numéros, côté serveur (`DECISIONS.md` D5).
 *
 * Deux appareils de la même boutique, tous deux sans réseau, peuvent attribuer
 * le même numéro à deux pièces différentes. Aucun des deux ne pouvait le
 * savoir. C'est ici qu'on répare, au moment où les deux écritures se rejoignent
 * enfin : la première arrivée garde son numéro, les suivantes reçoivent un
 * suffixe.
 *
 * Ce fichier est du calcul pur — pas de Firestore, pas d'Admin SDK — pour que
 * la règle qui décide se vérifie en millisecondes plutôt que sur émulateur.
 *
 * Il ne partage volontairement rien avec `lib/domain/numerotation.ts` : le
 * client *lit* les suffixes, le serveur les *fabrique*, et ces deux moitiés ne
 * s'appellent jamais. Ce qu'elles doivent est vérifié par un test d'aller-retour
 * (`numerotation.test.ts`) : tout suffixe produit ici doit être relu là-bas.
 */

/** Une pièce vue par la réconciliation : son identité, son numéro d'origine, et quand le serveur l'a reçue. */
export type PieceNumerotee = {
  id: string;
  /** Le numéro attribué par l'appareil, qui ne change jamais — c'est la clé du rapprochement. */
  numeroInitial: string;
  /** Millisecondes de `createdAt`, c'est-à-dire l'ordre d'**arrivée au serveur**, pas de saisie. */
  recueA: number;
};

/**
 * Le suffixe de désambiguïsation d'un rang.
 *
 * `0` → aucun suffixe : c'est la pièce qui garde son numéro. Ensuite `-B`,
 * `-C`… puis, si l'invraisemblable arrivait, `-AA`, `-AB` — la suite ne
 * s'arrête jamais, parce qu'une numérotation qui bloque au vingt-sixième
 * doublon serait un piège posé pour plus tard.
 *
 * Pourquoi commencer à `B` et non à `A` : le cahier des charges l'écrit ainsi
 * (§3.3), et cela dit la bonne chose — l'original est implicitement le `A`.
 */
export function suffixeDeRang(rang: number): string {
  if (!Number.isInteger(rang) || rang <= 0) return "";
  let reste = rang + 1;
  let lettres = "";
  while (reste > 0) {
    const position = (reste - 1) % 26;
    lettres = String.fromCharCode(65 + position) + lettres;
    reste = Math.floor((reste - 1) / 26);
  }
  return `-${lettres}`;
}

/**
 * Tranche une collision : quel numéro cette pièce doit-elle porter désormais ?
 *
 * Rend `null` quand il n'y a rien à faire — cas de très loin le plus fréquent,
 * puisqu'une pièce sur des milliers entre en collision.
 *
 * **L'ordre est celui d'arrivée au serveur**, l'identifiant du document
 * départageant les ex æquo. Deux propriétés en découlent, et ce sont les deux
 * qui comptent : le verdict ne dépend pas de l'ordre dans lequel les
 * déclencheurs s'exécutent, et deux exécutions concurrentes tombent d'accord
 * sans se parler. Une réconciliation qui aurait besoin d'un verrou serait une
 * réconciliation qui échoue au pire moment.
 *
 * Trancher par ordre d'arrivée plutôt que par heure de saisie est délibéré :
 * l'heure de saisie vient d'un téléphone dont personne ne contrôle le réglage,
 * et une pièce déjà synchronisée — peut-être déjà imprimée et remise au
 * client — ne doit pas se faire renuméroter par une saisie plus ancienne qui
 * remonte trois jours plus tard.
 */
export function resoudreCollision(
  piece: PieceNumerotee,
  memeNumeroInitial: readonly PieceNumerotee[],
): string | null {
  const concurrentes = [...memeNumeroInitial].sort(
    (a, b) => a.recueA - b.recueA || a.id.localeCompare(b.id),
  );
  const rang = concurrentes.findIndex((autre) => autre.id === piece.id);
  if (rang <= 0) return null;
  return piece.numeroInitial + suffixeDeRang(rang);
}
