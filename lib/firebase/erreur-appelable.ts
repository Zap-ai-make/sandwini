/**
 * La phrase que le serveur a écrite, débarrassée de ce que le SDK y accroche.
 *
 * **Le SDK colle le code HTTP à la fin de chaque message d'erreur appelable.**
 * `@firebase/functions` termine sa construction d'erreur par
 * `new FunctionsError(code, \`${description} [${httpStatus}]\`, …)` : la phrase
 * soignée côté serveur arrive donc au navigateur suffixée de ` [400]`, ` [403]`
 * ou ` [404]`.
 *
 * Vu à l'écran en S52, sur le refus d'effacer un compte : « Désactivez-le — son
 * nom doit rester lisible dans l'historique. **[400]** ». Le défaut est plus
 * ancien que ce lot — tout message serveur affiché depuis S2 le portait — mais
 * il ne s'était jamais montré d'aussi près.
 *
 * Trois chiffres seulement, et en fin de chaîne : un crochet au milieu d'une
 * phrase, ou un nombre d'une autre longueur, n'a rien à voir avec ce suffixe et
 * reste intact.
 */
export function phraseDuServeur(cause: unknown): string {
  /* L’appel optionnel n’est pas une précaution de style : un `catch` reçoit ce
     qu’on lui jette, et `throw null` existe. Tomber dans le traducteur
     d’erreurs est le pire endroit où tomber — il ne resterait plus rien à
     afficher à la personne, au moment précis où quelque chose vient d’échouer. */
  const message = (cause as { message?: string } | null | undefined)?.message ?? "";
  return message.replace(/\s*\[\d{3}\]$/, "");
}
