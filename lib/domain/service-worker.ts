/**
 * Le contrôle du service worker produit (S53, suite de l'audit du 15 octobre).
 *
 * **Le piège, et pourquoi il mérite un module.** `swDest` vaut `public/sw.js`
 * et **ne suit pas `NEXT_DIST_DIR`** : un build fait pour les émulateurs
 * réécrit donc le service worker de production, avec des empreintes de
 * fragments qui n'existent que dans `.next-emulateurs`. En ligne, rien ne se
 * voit — l'application marche. Elle ne cesse de marcher qu'au moment précis où
 * elle devait tenir : une coupure, sur un comptoir.
 *
 * Le même piège a une seconde bouche : une route retirée de l'application mais
 * laissée dans `ECRANS_HORS_LIGNE`. Serwist refuse l'installation quand une
 * entrée préchargée rend 404, et **le hors-ligne entier tombe** — c'est le
 * défaut que `/diagnostic` a produit en S54 et que l'audit a trouvé.
 *
 * **Ce module ne répare pas le piège, il le rend détectable.** Le réparer
 * demanderait de servir le service worker depuis le répertoire de build, ce que
 * `public/` ne sait pas faire — et les tests e2e hors ligne ont besoin d'un
 * `/sw.js` servi sur le build des émulateurs. Transformer un piège silencieux
 * en commande qui échoue est le pas qui se tient.
 *
 * La logique est pure et le disque est injecté : elle se teste sans build.
 */

/**
 * Les URL du manifeste de préchargement.
 *
 * **Quotes simples**, et c'est le détail qui compte : le fichier produit écrit
 * `'url':'/caisse'`. Viser les doubles rendait toutes les entrées absentes, y
 * compris celles qui étaient là, et le contrôle passait pour un échec total
 * alors qu'il ne lisait rien.
 */
export function entreesPrechargees(sw: string): string[] {
  return [...sw.matchAll(/'url':'([^']+)'/g)].map((trouve) => trouve[1]);
}

/**
 * Les entrées préchargées qui ne mènent à rien.
 *
 * Deux familles, séparées par la présence d'une extension : un **fichier** doit
 * exister dans le build, une **route** doit avoir sa page. Les deux font tomber
 * l'installation du service worker de la même façon, donc le contrôle les rend
 * dans une seule liste.
 *
 * Les chemins du manifeste sont encodés pour l'URL — un segment dynamique s'y
 * lit `%5Bid%5D` —, donc ils se décodent avant d'aller voir sur le disque. Sans
 * cela le contrôle déclare absents des fragments parfaitement présents.
 */
export function entreesSansCible(
  entrees: readonly string[],
  fichierExiste: (chemin: string) => boolean,
  routeExiste: (route: string) => boolean,
): string[] {
  return entrees.filter((entree) => {
    const decodee = decodeURIComponent(entree);
    const extension = decodee.slice(decodee.lastIndexOf("/") + 1).includes(".");

    if (!extension) return !routeExiste(decodee);

    const relatif = decodee.replace(/^\//, "");
    /* Deux emplacements possibles : les actifs statiques du dépôt vivent dans
       `public/`, les fragments produits par le build dans `.next/`. Le préfixe
       `_next/` est la marque des seconds. */
    const candidats = relatif.startsWith("_next/")
      ? [`.next/${relatif.slice("_next/".length)}`]
      : [`public/${relatif}`];

    return !candidats.some(fichierExiste);
  });
}
