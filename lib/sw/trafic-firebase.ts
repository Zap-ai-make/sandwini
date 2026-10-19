/**
 * Le trafic qui doit traverser le service worker sans jamais y être mis en
 * cache.
 *
 * **Pourquoi ce module existe.** `app/sw.ts` promet depuis sa première version
 * que rien de ce qui part vers Firebase n'est mis en cache : Firestore tient
 * déjà son propre cache IndexedDB et sa file d'écritures, et doubler ce travail
 * produirait deux caches qui se contredisent. La promesse n'était pas tenue —
 * `defaultCache` de Serwist finit par une règle qui attrape **tout** GET
 * cross-origin en `NetworkFirst`, avec abandon du réseau à 10 secondes.
 *
 * Appliquée au canal d'écoute de Firestore, qui est un long-poll gardé ouvert
 * exprès, cette stratégie le coupe à chaque fois, sert une réponse de cache, et
 * le canal se rouvre sans fin. Un document déjà publié n'arrive alors jamais
 * chez un lecteur qui vient de recharger, alors que celui qui l'a écrit le voit
 * par son cache local : exactement le défaut S41.
 *
 * **Pourquoi une liste d'hôtes et non un suffixe.** `*.googleapis.com`
 * attraperait `fonts.googleapis.com`, et les polices doivent rester en cache —
 * sans elles, le produit s'ouvre hors ligne avec la mauvaise typographie. On
 * nomme donc les hôtes de Firebase un par un.
 *
 * Ce module est pur et ne connaît pas le service worker : c'est ce qui le rend
 * vérifiable en millisecondes, sans navigateur (`lib/sw/trafic-firebase.test.ts`).
 */

/** Les hôtes de Firebase en production. Chacun porte des données, jamais de coquille. */
const HOTES_FIREBASE = new Set([
  "firestore.googleapis.com",
  "firebasestorage.googleapis.com",
  "identitytoolkit.googleapis.com",
  /* Le renouvellement du jeton d'authentification. Mis en cache une heure, il
     rendrait un jeton périmé — et les règles Firestore refuseraient tout. */
  "securetoken.googleapis.com",
  "firebaseinstallations.googleapis.com",
]);

/**
 * Les hôtes locaux : en développement et en bout en bout, les émulateurs
 * vivent sur le même nom d'hôte que l'application et ne s'en distinguent que
 * par le port. C'est `memeOrigine` qui les sépare, pas ce nom.
 */
const HOTES_LOCAUX = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);

export function estTraficFirebase(url: URL, memeOrigine: boolean): boolean {
  /* La coquille de l'application est de la même origine, et elle doit rester
     en cache : c'est elle qui fait tenir le hors-ligne. Cette ligne passe
     avant tout le reste, parce que s'en tromper casse le produit sans réseau
     et en silence. */
  if (memeOrigine) return false;

  if (HOTES_FIREBASE.has(url.hostname)) return true;

  /* Les Cloud Functions déployées, dont le portail du prestataire dépend : un
     hôte par région et par projet, d'où le suffixe plutôt qu'une liste. */
  if (url.hostname.endsWith(".cloudfunctions.net")) return true;

  /* Cross-origin **et** local : ce ne peut être qu'un émulateur, puisque
     l'application vient d'être écartée par `memeOrigine`. */
  return HOTES_LOCAUX.has(url.hostname);
}
