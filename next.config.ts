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
const csp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
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

export default withSerwistInit({
  swSrc: "app/sw.ts",
  swDest: "public/sw.js",
  // En dev, un service worker qui met en cache complique le rechargement sans
  // rien apprendre : la vérification hors-ligne se fait sur un build réel.
  disable: enDev,
  reloadOnOnline: false,
  /* La page de repli doit être en cache *avant* la coupure, sinon elle ne
     s'affiche jamais — c'est le seul écran dont on sait qu'il servira à un
     moment où plus rien ne peut être téléchargé. La révision change à chaque
     build pour qu'une nouvelle version remplace l'ancienne. */
  additionalPrecacheEntries: [{ url: "/hors-ligne", revision: `${Date.now()}` }],
})(nextConfig);
