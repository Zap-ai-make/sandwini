/**
 * Dévoiler une réponse **mot à mot**, à un rythme régulier.
 *
 * **Le problème que ça résout.** Le réseau ne livre pas le texte au rythme où
 * on le lit : Gemini renvoie des paquets de taille très inégale — deux mots,
 * puis trois phrases d'un coup. Branché directement sur l'écran, ça donne un
 * texte qui sursaute, et le commanditaire l'a dit après l'avoir vu : « la
 * réponse ne doit pas venir en vrac ».
 *
 * Ce module sépare donc **ce qui est reçu** de **ce qui est montré**. Le
 * réseau remplit une cible ; l'écran la rattrape à cadence fixe, un mot par
 * battement. L'effet n'est pas décoratif : un texte qui apparaît au rythme de
 * la lecture se lit pendant qu'il s'écrit, au lieu de se relire une fois
 * tombé.
 *
 * **Pur, donc testable.** Pas de minuteur ici, pas d'état : une fonction qui
 * répond « jusqu'où montrer, maintenant ». Le battement appartient au
 * composant, les règles appartiennent à ce fichier.
 */

/**
 * Le retard qu'on accepte, en mots.
 *
 * Au-delà, on avance de plusieurs mots par battement. Sans ce rattrapage, une
 * réponse de trois cents mots arrivée d'un bloc continuerait de s'égrener
 * longtemps après que tout soit connu : l'utilisateur attendrait une machine
 * qui a déjà fini, ce qui est exactement le défaut qu'on voulait corriger.
 */
export const RETARD_MAX = 24;

/** Vrai pour une espace, une tabulation ou un retour à la ligne. */
function estBlanc(caractere: string): boolean {
  return /\s/.test(caractere);
}

/**
 * La fin du mot qui commence à `depuis`, **espaces suivantes comprises**.
 *
 * Les emporter plutôt que de s'arrêter au dernier caractère visible évite un
 * battement où le curseur reste collé à la ponctuation. Et les retours à la
 * ligne voyagent avec : ce sont eux qui portent les paragraphes et les listes.
 */
function finDuMot(texte: string, depuis: number): number {
  let indice = depuis;
  while (indice < texte.length && estBlanc(texte[indice])) indice += 1;
  while (indice < texte.length && !estBlanc(texte[indice])) indice += 1;
  while (indice < texte.length && estBlanc(texte[indice])) indice += 1;
  return indice;
}

/** Combien de mots restent entre `montre` et la fin de `cible`. */
function motsRestants(cible: string, montre: number): number {
  const reste = cible.slice(montre).trim();
  return reste === "" ? 0 : reste.split(/\s+/).length;
}

/**
 * Jusqu'où montrer au battement suivant.
 *
 * Rend un indice de coupe dans `cible`, toujours strictement supérieur à
 * `montre` tant qu'il reste du texte — un appelant qui boucle dessus termine.
 */
export function avancerDUnMot(cible: string, montre: number): number {
  if (montre >= cible.length) return cible.length;

  /* Un mot par battement au rythme normal ; davantage quand la cible a pris
     de l'avance, pour que le retard ne s'accumule jamais. */
  const restants = motsRestants(cible, montre);
  const pas = restants > RETARD_MAX ? Math.ceil(restants / RETARD_MAX) : 1;

  let indice = montre;
  for (let fait = 0; fait < pas && indice < cible.length; fait += 1) {
    indice = finDuMot(cible, indice);
  }
  return indice;
}
