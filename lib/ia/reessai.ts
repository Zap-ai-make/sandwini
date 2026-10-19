/**
 * Reprendre un appel que le serveur a refusé **parce qu'il était occupé**.
 *
 * **Pourquoi une limite alors que la facture est mensuelle.** La facturation
 * dit combien on paiera à la fin du mois ; elle ne réserve aucun débit. Les
 * modèles Gemini sont servis sur une capacité partagée entre tous les projets,
 * et un `429` ne veut pas dire « vous avez dépassé votre forfait » : il veut
 * dire « à cette seconde précise, la file était pleine ». Il n'y a donc aucun
 * quota à relever dans une console — la réponse attendue, celle que Google
 * documente, est de **réessayer un peu plus tard**.
 *
 * C'est exactement ce que fait ce module. Afficher « réessayez dans quelques
 * minutes » déportait sur le gérant un geste que la machine fait mieux, et en
 * trois secondes.
 *
 * **Pur, donc testable.** Il ne dort pas et n'appelle rien : il répond à deux
 * questions — est-ce que ça vaut le coup de reprendre, et après combien de
 * temps. L'attente elle-même est tenue par `assistant.ts`.
 */

/** Les paliers, en millisecondes. Trois reprises : ~0,7 s, ~1,6 s, ~3,5 s. */
const PALIERS = [700, 1600, 3500];

/** Jusqu'à +40 % de décalage, pour que deux appareils ne reviennent pas ensemble. */
const DECALAGE = 0.4;

function message(cause: unknown): string {
  return String((cause as { message?: unknown })?.message ?? "");
}

/**
 * Le code HTTP d'un échec, quand il y en a un.
 *
 * Le SDK le range dans `customErrorData.status`, et le recopie entre crochets
 * en tête du message. On lit les deux : la première source est la bonne, la
 * seconde rattrape les erreurs re-enveloppées en cours de route.
 */
export function statutHttp(cause: unknown): number | null {
  const range = (cause as { customErrorData?: { status?: unknown } })?.customErrorData?.status;
  if (typeof range === "number") return range;

  const crochets = /\[(\d{3})\]/.exec(message(cause));
  return crochets ? Number(crochets[1]) : null;
}

/**
 * Cet échec se dissipera-t-il tout seul ?
 *
 * `429` file pleine, `503` service momentanément indisponible. Tout le reste —
 * droits, configuration, requête mal formée — rendra la même erreur à la
 * centième tentative.
 */
export function estSurcharge(cause: unknown): boolean {
  const statut = statutHttp(cause);
  if (statut !== 429 && statut !== 503) return false;

  /* Des crédits épuisés portent le même 429 et appellent un geste humain :
     recharger. Les confondre ferait attendre un retour qui n'arrivera pas. */
  return !/credits?|prepayment|billing|quota exceeded for quota metric/i.test(message(cause));
}

/**
 * Combien attendre avant la reprise numéro `reprise` (0 pour la première).
 *
 * `null` signale qu'il n'y a plus de palier : l'appelant abandonne et affiche.
 */
export function attenteAvantReessai(reprise: number, hasard: () => number = Math.random): number | null {
  const palier = PALIERS[reprise];
  if (palier === undefined) return null;
  return Math.round(palier * (1 + hasard() * DECALAGE));
}
