import { describe, expect, it } from "vitest";
import { entreesPrechargees, entreesSansCible } from "./service-worker";

/**
 * Le piège que ce module transforme en condition vérifiable.
 *
 * `swDest` vaut `public/sw.js` et **ne suit pas `NEXT_DIST_DIR`** : un build
 * fait pour les émulateurs réécrit donc le service worker de production, avec
 * des empreintes de fragments qui n'existent que dans `.next-emulateurs`. En
 * ligne, rien ne se voit — l'application marche. Elle ne cesse de marcher qu'au
 * moment précis où elle devait tenir : une coupure, sur un comptoir.
 */

const SW_REEL = `
if(!self.define){/* ... */}
self.__SW_MANIFEST=[{'revision':null,'url':'/_next/static/chunks/abc-1234.js'},{'revision':null,'url':'/caisse'},{'revision':'a1','url':'/icone-192.png'}];
`;

describe("entreesPrechargees", () => {
  /* Les URL sont encodées en quotes SIMPLES dans le fichier produit. Viser les
     doubles rendait toutes les entrées absentes, y compris celles qui étaient
     là — et le contrôle passait pour un échec total alors qu'il ne lisait
     rien. Payé une fois, le 15 octobre. */
  it("lit les URL encodées en quotes simples", () => {
    expect(entreesPrechargees(SW_REEL)).toEqual([
      "/_next/static/chunks/abc-1234.js",
      "/caisse",
      "/icone-192.png",
    ]);
  });

  it("ne rend rien d’un fichier sans manifeste", () => {
    expect(entreesPrechargees("self.define=1;")).toEqual([]);
  });
});

describe("entreesSansCible", () => {
  /* Le prédicat est injecté : la logique se teste sans toucher au disque, et
     le script n'a plus qu'à brancher `existsSync`. */
  const present = (chemins: string[]) => (chemin: string) => chemins.includes(chemin);

  it("rend vide quand tout résout", () => {
    const manquantes = entreesSansCible(
      ["/_next/static/chunks/abc-1234.js", "/caisse"],
      present([".next/static/chunks/abc-1234.js"]),
      (route) => route === "/caisse",
    );
    expect(manquantes).toEqual([]);
  });

  /* **Le cas d'un `sw.js` empoisonné par un build émulateurs.** Le fragment
     cité n'existe pas dans `.next` : il n'existe que dans
     `.next-emulateurs`. C'est exactement ce que le contrôle doit attraper. */
  it("signale un fragment que le build de production ne contient pas", () => {
    const manquantes = entreesSansCible(
      ["/_next/static/chunks/empoisonne-9999.js"],
      present([".next/static/chunks/abc-1234.js"]),
      () => true,
    );
    expect(manquantes).toEqual(["/_next/static/chunks/empoisonne-9999.js"]);
  });

  /* **Le défaut du 15 octobre, en test.** `/diagnostic` est resté dans
     `ECRANS_HORS_LIGNE` après la suppression de la route, et Serwist refuse
     l'installation quand une entrée préchargée rend 404 : le hors-ligne entier
     tombe, silencieusement. */
  it("signale une route préchargée qui n’existe plus", () => {
    const manquantes = entreesSansCible([
      "/diagnostic",
    ], present([]), (route) => route !== "/diagnostic");
    expect(manquantes).toEqual(["/diagnostic"]);
  });

  /* Les chemins du manifeste sont encodés pour l'URL : un segment dynamique
     s'y lit `%5Bid%5D`, et un contrôle qui ne décode pas déclare absents deux
     fragments parfaitement présents. Payé une fois aussi. */
  it("décode les segments dynamiques avant de chercher le fichier", () => {
    const manquantes = entreesSansCible(
      ["/_next/static/chunks/app/(app)/clients/%5Bid%5D/page-aaa.js"],
      present([".next/static/chunks/app/(app)/clients/[id]/page-aaa.js"]),
      () => true,
    );
    expect(manquantes).toEqual([]);
  });
});
