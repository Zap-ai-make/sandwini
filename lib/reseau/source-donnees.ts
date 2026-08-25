/**
 * D’où viennent les données que l’écran affiche : du serveur, ou du cache ?
 *
 * `navigator.onLine` répond « en ligne » dès qu’une interface réseau est
 * active, même sans accès réel — wifi captif, réseau mobile qui accroche sans
 * transmettre. Le gérant voit alors « À jour » alors que rien ne part
 * (`DECISIONS.md` D20). Firestore, lui, sait la vérité : chaque instantané dit
 * `metadata.fromCache`, c’est-à-dire « je n’ai pas pu joindre le serveur ».
 *
 * Ce module recueille ce signal depuis les écouteurs de `lib/repositories` et
 * le republie à l’indicateur réseau, sans les coupler l’un à l’autre.
 *
 * **Pourquoi un délai.** Au démarrage, Firestore sert d’abord le cache puis
 * rattrape le serveur dans la foulée : afficher « hors ligne » pendant cette
 * fraction de seconde apprendrait au gérant à ne plus regarder le bandeau. On
 * ne conclut à la coupure que si le cache dure — un vrai réseau muet dure, un
 * démarrage non.
 */

/** Assez long pour couvrir un démarrage, assez court pour prévenir avant la saisie suivante. */
export const DELAI_CONFIRMATION_MS = 2_500;

let confirmee = false;
let minuterie: ReturnType<typeof setTimeout> | null = null;
const ecouteurs = new Set<() => void>();

function notifier(): void {
  for (const ecouteur of ecouteurs) ecouteur();
}

/** Appelé par chaque écouteur Firestore ouvert avec `includeMetadataChanges`. */
export function signalerSourceDonnees(depuisLeCache: boolean): void {
  if (depuisLeCache) {
    if (confirmee || minuterie) return;
    minuterie = setTimeout(() => {
      minuterie = null;
      confirmee = true;
      notifier();
    }, DELAI_CONFIRMATION_MS);
    return;
  }

  if (minuterie) {
    clearTimeout(minuterie);
    minuterie = null;
  }
  if (confirmee) {
    confirmee = false;
    notifier();
  }
}

/** `true` quand Firestore sert depuis le cache assez longtemps pour que ce soit une coupure. */
export function coupureConfirmee(): boolean {
  return confirmee;
}

export function ecouterSourceDonnees(ecouteur: () => void): () => void {
  ecouteurs.add(ecouteur);
  return () => {
    ecouteurs.delete(ecouteur);
  };
}

/** Réservé aux tests : remet le module à zéro entre deux cas. */
export function reinitialiserSourceDonnees(): void {
  if (minuterie) clearTimeout(minuterie);
  minuterie = null;
  confirmee = false;
  ecouteurs.clear();
}
