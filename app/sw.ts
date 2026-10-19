/// <reference lib="webworker" />
import { defaultCache } from "@serwist/next/worker";
import type { PrecacheEntry, SerwistGlobalConfig } from "serwist";
import { Serwist } from "serwist";

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

/* Le service worker ne s’occupe que de la coquille : HTML, CSS, JS, polices,
   icônes. Les données métier sont la affaire de Firestore, qui tient son propre
   cache IndexedDB et sa file d’écritures. Doubler ce travail ici produirait deux
   caches qui se contredisent — la panne la plus pénible à diagnostiquer.

   Corollaire : rien de ce qui part vers googleapis.com n’est mis en cache. */
const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  /* Un paramètre d'URL ne change pas quel document servir : nos écrans sont
     rendus par le navigateur, et `/motos?moto=42` est le même document que
     `/motos`. Sans cette ligne, ouvrir la fiche d'une moto hors ligne tombait
     sur la page de repli — juste après un formulaire qui, lui, avait
     parfaitement fonctionné sans réseau (D39).

     La liste est explicite, et pas un joker : `_rsc`, que Next ajoute pour
     demander des données et non un document, doit continuer à ne PAS
     correspondre au cache de précharge. Tout nouveau paramètre d'état d'écran
     s'ajoute ici — l'oubli ne se voit qu'en coupure. */
  precacheOptions: {
    ignoreURLParametersMatching: [
      /^utm_/,
      /^fbclid$/,
      /^moto$/,
      /^vente$/,
      /^nouvelle$/,
      /^recu$/,
    ],
  },
  /* Une mise à jour n'emporte jamais une saisie en cours (S34, réponse 5).

     Avec `skipWaiting: true`, un service worker fraîchement installé prenait la
     main sur les onglets déjà ouverts. La page continuait d'exécuter le code
     déjà chargé, mais le morceau suivant qu'elle demandait — une navigation, un
     panneau qui s'ouvre — était cherché dans le nouveau cache, où l'ancien
     fichier n'existe plus. Le geste échouait alors au pire moment : celui où le
     gérant vient de changer d'écran, donc en pleine saisie. C'est l'esprit de
     D76 pris à l'envers — le comptoir subissait le serveur.

     À `false`, la nouvelle version s'installe et attend. L'onglet ouvert finit
     sa journée sur la version avec laquelle il l'a commencée, cohérente d'un
     bout à l'autre, et passe à la suivante au rechargement.

     Ce n'est pas renoncer à `skipWaiting` : Serwist, quand l'option est fausse,
     installe lui-même l'écouteur du message `SKIP_WAITING` (`serwist/dist/
     index.mjs:1328`). Le bouton « Mettre à jour » des réglages l'envoie. Le
     saut de version cesse d'être une option de compilation posée une fois pour
     toutes et devient un geste du comptoir, au moment choisi par celui qui
     tient la caisse. */
  skipWaiting: false,
  /* Reste vrai, et ne se contredit pas : `clientsClaim` n'agit qu'à
     l'activation — c'est-à-dire, désormais, après le geste ci-dessus. Il évite
     qu'un onglet rechargé reparte non contrôlé, donc sans repli hors ligne. */
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: defaultCache,
  fallbacks: {
    entries: [
      {
        url: "/hors-ligne",
        matcher: ({ request }) => request.destination === "document",
      },
    ],
  },
});

serwist.addEventListeners();
