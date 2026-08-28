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
    ignoreURLParametersMatching: [/^utm_/, /^fbclid$/, /^moto$/, /^vente$/],
  },
  skipWaiting: true,
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
