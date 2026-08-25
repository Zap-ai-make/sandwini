/**
 * Compteur des écritures parties mais pas encore confirmées par le serveur.
 *
 * Firestore ne publie pas ce nombre. Il expose `hasPendingWrites` par instantané
 * et `waitForPendingWrites()` pour l’ensemble, mais jamais un décompte. Or le
 * cahier des charges demande de montrer « le nombre d’écritures en attente »
 * (§3.4) — parce qu’un gérant qui a saisi six ventes dans la journée veut voir
 * ce six descendre à zéro, pas un voyant vert qui ne prouve rien.
 *
 * On le tient donc nous-mêmes : une promesse d’écriture Firestore ne se résout
 * qu’à l’accusé de réception du serveur. Hors ligne, elle reste en suspens —
 * c’est exactement le signal cherché.
 *
 * Limite connue et assumée : ce compteur ne voit que les écritures de la session
 * courante. Celles laissées par une session précédente sont bien rejouées par
 * Firestore, mais ne sont pas comptées ici ; `waitForPendingWrites()` les
 * couvre, et c’est ce qui alimente l’état « synchronisation en cours ».
 */

type Ecouteur = (enAttente: number) => void;

let enAttente = 0;
const ecouteurs = new Set<Ecouteur>();

function notifier(): void {
  for (const ecouteur of ecouteurs) ecouteur(enAttente);
}

/**
 * Enveloppe une écriture Firestore pour la compter tant qu’elle n’est pas
 * confirmée. Renvoie la promesse d’origine : l’appelant ne change pas son code.
 *
 * Tous les dépôts de `lib/repositories` passeront par ici. Une écriture qui
 * oublie cette enveloppe n’est pas une erreur fonctionnelle — elle est
 * simplement invisible dans l’indicateur, ce qui est pire qu’une erreur.
 */
export function suivreEcriture<T>(promesse: Promise<T>): Promise<T> {
  enAttente += 1;
  notifier();
  return promesse.finally(() => {
    enAttente -= 1;
    notifier();
  });
}

/** S’abonne au compteur. Appelle l’écouteur immédiatement avec la valeur courante. */
export function ecouterFileEcritures(ecouteur: Ecouteur): () => void {
  ecouteurs.add(ecouteur);
  ecouteur(enAttente);
  return () => {
    ecouteurs.delete(ecouteur);
  };
}

export function ecrituresEnAttente(): number {
  return enAttente;
}

/** Réservé aux tests : remet le module à zéro entre deux cas. */
export function reinitialiserFileEcritures(): void {
  enAttente = 0;
  ecouteurs.clear();
}
