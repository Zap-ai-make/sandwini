"use client";

/**
 * L'invite d'installation, retenue dès le premier instant.
 *
 * **Le défaut qu'on répare ici.** Le bouton « Installer » apparaissait au
 * chargement puis disparaissait. La cause n'est pas un bug d'affichage :
 * `beforeinstallprompt` ne part **qu'une fois**, quelques centaines de
 * millisecondes après l'ouverture de la page. L'écouteur vivait dans le
 * composant des réglages — un écran qu'on atteint plus tard, et qui n'était
 * donc pas monté quand l'événement est passé. Il arrivait par hasard, quand on
 * atterrissait directement sur cette page.
 *
 * L'écoute est donc **posée à l'import**, dans la coquille, avant que le
 * moindre écran ne s'affiche. Ce module est importé pour son seul effet par
 * `components/BandeauEtat.tsx`, qui est toujours monté.
 *
 * Hors de React pour la même raison que le périmètre mémorisé : la valeur
 * existe avant le premier rendu, et `useSyncExternalStore` sait lire une
 * source qui n'a rien à voir avec le cycle des composants.
 */

/** Le type n'existe pas dans les définitions du DOM : Chrome seul le publie. */
export type InviteInstallation = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

let invite: InviteInstallation | null = null;
let installee = false;
const abonnes = new Set<() => void>();

function prevenir(): void {
  for (const abonne of abonnes) abonne();
}

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (evenement) => {
    /* Sans ça, Chrome affiche sa propre barre et la retire aussitôt : on garde
       l'invite pour la rejouer au moment choisi par l'utilisateur. */
    evenement.preventDefault();
    invite = evenement as InviteInstallation;
    prevenir();
  });

  window.addEventListener("appinstalled", () => {
    installee = true;
    invite = null;
    prevenir();
  });
}

/** Vrai quand l'application tourne déjà depuis l'écran d'accueil. */
export function dejaPosee(): boolean {
  if (typeof window === "undefined") return false;
  return (
    installee ||
    window.matchMedia("(display-mode: standalone)").matches ||
    /* Le drapeau propriétaire d'iOS, seul moyen de le savoir sur Safari. */
    (navigator as { standalone?: boolean }).standalone === true
  );
}

export function ecouterInstallation(abonne: () => void): () => void {
  abonnes.add(abonne);
  return () => abonnes.delete(abonne);
}

/** L'invite retenue, ou `null` si ce navigateur n'en propose pas. */
export function lireInvite(): InviteInstallation | null {
  return invite;
}

/**
 * Rejoue l'invite.
 *
 * Elle ne se rejoue qu'une fois : le navigateur refuse la seconde. On l'oublie
 * donc tout de suite, plutôt que de laisser un bouton qui ne fait plus rien.
 */
export function proposerInstallation(): void {
  const retenue = invite;
  if (!retenue) return;
  invite = null;
  prevenir();
  void retenue.prompt();
}
