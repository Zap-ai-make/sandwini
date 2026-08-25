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
