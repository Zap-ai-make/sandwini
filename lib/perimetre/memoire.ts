/**
 * Mémoire du périmètre choisi par le responsable.
 *
 * Le cahier des charges demande un sélecteur « persisté en session » (§3.2). On
 * le garde en `localStorage` plutôt qu’en `sessionStorage` : sur le téléphone
 * du comptoir, l’application se ferme et se rouvre vingt fois par jour, et
 * retomber sur « Toutes les boutiques » à chaque réouverture ferait ressaisir
 * le même choix sans arrêt.
 *
 * La clé porte l’identifiant du compte : deux personnes qui se relaient sur le
 * même appareil ne s’héritent pas leur périmètre. La déconnexion efface tout,
 * comme elle efface le cache Firestore.
 *
 * Ce module est écrit comme un **magasin extérieur** — lecture, abonnement,
 * notification — parce que c’est ce que `useSyncExternalStore` attend. Recopier
 * la valeur dans un état React depuis un effet déclencherait des rendus en
 * cascade et se désynchroniserait à l’hydratation.
 */

const PREFIXE = "sdi.perimetre.";

/** Évite de relire `localStorage` à chaque rendu, et donne une valeur stable à React. */
const cache = new Map<string, string | null>();
const ecouteurs = new Set<() => void>();

/* `localStorage` lève en navigation privée ou quand le quota est plein. Un
   périmètre non mémorisé est un désagrément ; une application qui plante en
   ouvrant le bandeau serait un défaut. */
function stockage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

function notifier(): void {
  for (const ecouteur of ecouteurs) ecouteur();
}

export function lirePerimetreMemorise(uid: string): string | null {
  if (!cache.has(uid)) {
    try {
      cache.set(uid, stockage()?.getItem(PREFIXE + uid) || null);
    } catch {
      cache.set(uid, null);
    }
  }
  return cache.get(uid) ?? null;
}

/** `null` mémorise le choix « toutes les boutiques », qui est aussi le défaut. */
export function memoriserPerimetre(uid: string, boutiqueId: string | null): void {
  cache.set(uid, boutiqueId);
  try {
    const memoire = stockage();
    if (memoire) {
      if (boutiqueId) memoire.setItem(PREFIXE + uid, boutiqueId);
      else memoire.removeItem(PREFIXE + uid);
    }
  } catch {
    // Le choix vaudra pour cette session seulement.
  }
  notifier();
}

export function ecouterPerimetreMemorise(ecouteur: () => void): () => void {
  ecouteurs.add(ecouteur);
  return () => {
    ecouteurs.delete(ecouteur);
  };
}

/** Appelé à la déconnexion : l’appareil est partagé, il ne garde rien. */
export function oublierPerimetres(): void {
  cache.clear();
  try {
    const memoire = stockage();
    if (memoire) {
      const aSupprimer: string[] = [];
      for (let i = 0; i < memoire.length; i += 1) {
        const cle = memoire.key(i);
        if (cle?.startsWith(PREFIXE)) aSupprimer.push(cle);
      }
      for (const cle of aSupprimer) memoire.removeItem(cle);
    }
  } catch {
    // Rien à faire de plus : le prochain compte aura sa propre clé.
  }
  notifier();
}
