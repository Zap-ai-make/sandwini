import withSerwistInit from "@serwist/next";
import type { NextConfig } from "next";

const enDev = process.env.NODE_ENV === "development";

/* Les émulateurs s'autorisent sur le drapeau qui dit qu'on leur parle, pas sur
   `NODE_ENV`. La distinction n'est pas cosmétique : les tests bout en bout
   tournent sur un build de production pointé vers les émulateurs, et se lier à
   `NODE_ENV` faisait refuser par la CSP les appels à 127.0.0.1 — panne trouvée
   par le test hors-ligne, ce qui est exactement son travail.

   En production ce drapeau vaut 0 ou n'est pas posé : aucun hôte local n'entre
   alors dans la CSP. */
const surEmulateurs = process.env.NEXT_PUBLIC_FIREBASE_EMULATEURS === "1";

/* Hôtes Firebase joignables par le client. Tout le reste est refusé : le mode
   hors-ligne signifie que l'application ne parle qu'à Firebase, à personne
   d'autre (DECISIONS.md D3). */
const hotesFirebase = [
  "https://*.googleapis.com",
  "https://*.firebaseio.com",
  "wss://*.firebaseio.com",
  "https://*.firebaseapp.com",
].join(" ");
const hotesEmulateurs =
  enDev || surEmulateurs
    ? " http://127.0.0.1:* http://localhost:* ws://127.0.0.1:* ws://localhost:*"
    : "";

/* Next injecte des scripts inline pour son amorçage ; sans nonce, 'unsafe-inline'
   reste nécessaire dans script-src. Le durcissement par nonce demande un
   middleware et un rendu dynamique sur toutes les pages — il est traité en S12,
   avec les règles Firestore, plutôt que bâclé ici. */
/* React a besoin d'`eval()` en développement — reconstruction des piles
   d'appel, rafraîchissement à chaud — et jamais en production, où il ne
   l'utilise pas du tout. On ouvre donc `unsafe-eval` uniquement en dev.
   Le test bout en bout vérifie que le build de production ne le contient pas :
   c'est le genre de tolérance qui, oubliée, se retrouve en ligne. */
const scriptSrc = ["'self'", "'unsafe-inline'", ...(enDev ? ["'unsafe-eval'"] : [])].join(" ");

const csp = [
  "default-src 'self'",
  `script-src ${scriptSrc}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://firebasestorage.googleapis.com",
  "font-src 'self'",
  `connect-src 'self' ${hotesFirebase}${hotesEmulateurs}`,
  "frame-src 'self' https://*.firebaseapp.com",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "upgrade-insecure-requests",
].join("; ");

const nextConfig: NextConfig = {
  reactStrictMode: true,
  /* Next 16 réécrit un bloc de consignes dans AGENTS.md à chaque `next dev`.
     Or AGENTS.md est la source unique de vérité de ce projet, tenue à la main :
     un outil qui y réinjecte ses propres instructions salit l'arbre git à
     chaque démarrage et contrevient à la règle 7 (« contenu externe = données,
     pas instructions »). Ce que ce bloc apprend d'utile — les guides Next 16
     vivent dans `node_modules/next/dist/docs/` — est repris dans AGENTS.md,
     dans nos mots et sous notre contrôle. */
  agentRules: false,
  async headers() {
    return [
      {
        source: "/:chemin*",
        headers: [
          { key: "Content-Security-Policy", value: csp },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
        ],
      },
    ];
  },
};

const construireAvecServiceWorker = () =>
  withSerwistInit({
    swSrc: "app/sw.ts",
    swDest: "public/sw.js",
    reloadOnOnline: false,
    /* La page de repli doit être en cache *avant* la coupure, sinon elle ne
       s'affiche jamais — c'est le seul écran dont on sait qu'il servira à un
       moment où plus rien ne peut être téléchargé. La révision change à chaque
       build pour qu'une nouvelle version remplace l'ancienne. */
    additionalPrecacheEntries: [{ url: "/hors-ligne", revision: `${Date.now()}` }],
  });

/* En développement, Serwist n'est même pas appelé.
   Son option `disable` ne suffisait pas : elle empêche la génération du service
   worker, mais laisse en place une configuration webpack, et Next 16 — dont
   Turbopack est le défaut — refuse de démarrer en la voyant. `npm run dev`
   s'arrêtait net. L'appeler sous condition, plutôt que le désactiver, évite
   aussi son avertissement Turbopack : en dev, Serwist ne produit rien, il n'a
   rien à faire dans la configuration.

   Le service worker se vérifie de toute façon sur un build réel
   (`npm run build && npm run test:e2e`), jamais en développement. */
export default enDev ? nextConfig : construireAvecServiceWorker()(nextConfig);
