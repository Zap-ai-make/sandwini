/**
 * Le garde-fou de la suite bout en bout, qui interroge le build (S53).
 *
 * **Le trou qu'il ferme.** `playwright.config.ts` refusait de lancer la suite
 * hors émulateurs — et il avait raison : ces tests créent puis effacent des
 * comptes, des boutiques et des ventes. Mais il ne lisait que le **texte** de
 * `.env.local` ou `.env`, à la recherche de `NEXT_PUBLIC_FIREBASE_EMULATEURS=1`.
 *
 * Or son `webServer` sert un build **déjà compilé**. Les `NEXT_PUBLIC_*` y sont
 * figées au moment du `next build`, pas relues au démarrage. Poser le fichier
 * puis lancer la suite sans recompiler faisait donc passer le garde pendant que
 * le navigateur parlait au vrai projet. Aucun message, verdict vert : c'est
 * exactement la catastrophe que ce garde existe pour empêcher, et il la
 * laissait passer dans le cas le plus naturel — remettre le fichier, lancer les
 * tests. Constaté le 6 octobre 2026, corrigé ici.
 *
 * **Le fichier ne décide de rien ; le paquet décide.** Le garde lit donc le
 * `projectId` compilé dans les fragments, qui est littéralement ce à quoi le
 * navigateur va parler. Un fichier d'environnement juste et un build périmé ne
 * passent plus, et la contrepartie est voulue : la suite exige qu'on ait
 * recompilé.
 *
 * La logique est pure et le disque reste dehors : elle se teste sans build.
 */

/**
 * Le projet Firebase des émulateurs, le seul auquel la suite a le droit de
 * parler. La même constante est écrite dans `scripts/amorcer.mjs`, qui amorce
 * le compte responsable, et dans `.firebaserc`.
 */
export const PROJET_EMULATEUR = "sdi-dev";

/**
 * Les projets Firebase que les fragments désignent, sans répétition.
 *
 * `projectId` plutôt qu'`authDomain` ou le seau de stockage : c'est la clé que
 * le SDK utilise pour router ses appels, donc celle qui ne peut pas mentir.
 */
export function projetsCompiles(fragments: readonly string[]): string[] {
  const trouves = new Set<string>();
  for (const fragment of fragments) {
    for (const occurrence of fragment.matchAll(/projectId:"([^"]+)"/g)) {
      trouves.add(occurrence[1]);
    }
  }
  return [...trouves];
}

/**
 * `null` si la suite peut tourner ; sinon la raison, telle qu'on la lira.
 *
 * Le message nomme le projet trouvé. « Ce n'est pas le bon projet » n'apprend
 * rien à qui vient de poser un fichier d'environnement et croit avoir tout
 * fait : ce qui lui manque, c'est de savoir que son build est plus vieux que
 * son fichier.
 */
export function verdictGarde(projets: readonly string[]): string | null {
  const SAUT = String.fromCharCode(10);

  /* Aucun projet trouvé : pas de build, ou un format de paquet qui a changé.
     Un garde qui ne sait plus rien doit refuser — sinon il redevient le garde
     décoratif qu'on vient de remplacer. */
  if (projets.length === 0) {
    return [
      "Les tests bout en bout refusent de tourner : le build ne contient",
      "aucune configuration Firebase lisible.",
      "",
      "Soit il n’y a pas de build, soit le format du paquet a changé. Dans les",
      "deux cas ce garde ne peut plus dire à quel projet l’application parle,",
      "et il ne laisse pas passer ce qu’il ne sait pas vérifier.",
      "",
      "  npm run build",
    ].join(SAUT);
  }

  const intrus = projets.filter((projet) => projet !== PROJET_EMULATEUR);
  if (intrus.length === 0) return null;

  return [
    `Les tests bout en bout refusent de tourner : le build visé parle à « ${intrus.join(" », « ")} ».`,
    "",
    "Cette suite crée puis efface des comptes, des boutiques et des ventes.",
    `Elle n’a le droit de parler qu’au projet des émulateurs, « ${PROJET_EMULATEUR} ».`,
    "",
    "Ce contrôle lit le paquet compilé, et non un fichier d’environnement :",
    "les NEXT_PUBLIC_* sont figées par « next build ». Un fichier juste et un",
    "build périmé, c’est le build qui décide — et c’est ce qui a failli faire",
    "tourner la suite sur un vrai projet.",
    "",
    "Recompilez avec la configuration des émulateurs :",
    "  NEXT_PUBLIC_FIREBASE_EMULATEURS=1 \\",
    `  NEXT_PUBLIC_FIREBASE_PROJECT_ID=${PROJET_EMULATEUR} \\`,
    "  (les autres valeurs sont dans .env.local.emulateurs)",
    "  npm run build",
  ].join(SAUT);
}
