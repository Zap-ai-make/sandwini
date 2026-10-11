import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import withSerwistInit from "@serwist/next";
import type { NextConfig } from "next";

const enDev = process.env.NODE_ENV === "development";

/* ── La version du produit, telle qu'on la lira au comptoir (S34) ───────────
   Ces trois valeurs sont posées ici parce qu'elles n'existent qu'à la
   compilation : l'écran qui les affiche est celui qu'on ouvre quand plus rien
   ne marche, et il ne peut donc rien aller chercher. Elles partent dans le
   paquet et se lisent hors ligne.
   Corollaire connu du projet : un `npm run dev` déjà lancé les a figées à son
   démarrage — les changer demande de redémarrer le serveur. */

/**
 * L'entier de la maquette `a1:25`, posé à la main dans le commit qui ferme un
 * lot — au même moment que la décision et la ligne de roadmap.
 *
 * Il vit dans un fichier d'une ligne et non dans le champ `version` de
 * `package.json` : ce champ vaut `0.1.0`, ne veut rien dire pour un paquet
 * privé, et n'accepte pas un entier nu. Deux nombres qui se disent tous deux
 * « la version » seraient exactement la confusion que ce lot vient supprimer.
 */
const lireNumeroDeVersion = (): string => {
  try {
    return readFileSync(new URL("VERSION", import.meta.url), "utf8").trim();
  } catch {
    /* Un paquet déployé sans son fichier VERSION vaut mieux sans numéro
       qu'avec un numéro inventé : le domaine sait afficher « SDI » tout court,
       et l'absence de numéro reste une information exacte. */
    return "";
  }
};

/**
 * L'empreinte du commit compilé. Vercel la pose ; en local on la demande à git.
 *
 * `execFileSync` et non `execSync` : aucun shell, donc rien à échapper.
 */
const lireEmpreinte = (): string => {
  const posteeParVercel = process.env.VERCEL_GIT_COMMIT_SHA;
  if (posteeParVercel) return posteeParVercel;
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  } catch {
    /* Ni Vercel ni dépôt git — une archive décompressée, par exemple. Le
       domaine affichera « — » plutôt qu'une valeur qui ferait chercher un
       commit inexistant. */
    return "";
  }
};

/* Un seul instant pour les deux usages : la date que lit le gérant et la
   révision qui invalide le cache du service worker désignent alors la même
   compilation. Deux horloges auraient pu diverger d'une seconde et faire
   mentir l'une des deux. */
const COMPILEE_LE = new Date().toISOString();

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
  /* Les fonctions appelables. Le SDK les joint sur
     `https://{region}-{projet}.cloudfunctions.net/{nom}`, qui n'appartient à
     aucun des domaines ci-dessus — et sans cette ligne le navigateur coupe
     l'appel avant qu'il parte. L'application n'en voyait qu'un « le serveur n'a
     pas répondu », ce qui accusait le réseau alors que la demande n'avait
     jamais quitté la page.

     Invisible sur les émulateurs, qui répondent sur 127.0.0.1, lui autorisé
     plus bas : la panne n'apparaissait donc qu'en ligne. */
  "https://*.cloudfunctions.net",
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
  /**
   * Le répertoire de compilation, déplaçable par l'environnement.
   *
   * **Il n'y a qu'un seul `.next`, et c'est ce qui coûte.** Regarder un écran
   * avant de le déclarer fait (règle 5) demande un build pointé vers les
   * émulateurs ; or le commanditaire fait tourner un `next start` sur le port
   * 3000, qui sert un build de production. Reconstruire par-dessus **casse son
   * serveur** : le processus garde en mémoire l'ancien bundle serveur pendant
   * que les chunks sur disque changent de nom, et sa page tombe en 404 de
   * chunks. La revue visuelle devenait donc un choix entre regarder le rendu et
   * laisser quelqu'un travailler.
   *
   * `NEXT_DIST_DIR=.next-emulateurs npm run build` met le build d'à côté
   * ailleurs. La même variable doit accompagner le `next start` qui le sert —
   * `next start` relit cette configuration, donc les deux doivent s'accorder.
   *
   * Sans la variable, rien ne change : `.next`, comme avant.
   *
   * *Réserve connue :* Serwist écrit `public/sw.js`, hors de ce répertoire. Deux
   * builds de configurations différentes se le disputent donc encore. Il est
   * régénéré à chaque compilation et n'est pas commité (`.gitignore`) ; le
   * sauvegarder le temps d'un build d'émulateurs suffit à ne pas troubler le
   * serveur d'à côté.
   *
   * *Seconde réserve :* `next build` **réécrit `tsconfig.json`** quand il voit
   * un répertoire inhabituel — il y ajoute `.next-emulateurs/types/**` et, au
   * passage, reformate tous les tableaux du fichier à raison d'un élément par
   * ligne. Ce n'est pas un changement à garder : `tsc --noEmit` passe sans ces
   * chemins, et le reformatage est du bruit de générateur. Un
   * `git checkout -- tsconfig.json` après un build d'émulateurs, et ne pas le
   * prendre pour du travail.
   */
  distDir: process.env.NEXT_DIST_DIR ?? ".next",
  /* Next 16 réécrit un bloc de consignes dans AGENTS.md à chaque `next dev`.
     Or AGENTS.md est la source unique de vérité de ce projet, tenue à la main :
     un outil qui y réinjecte ses propres instructions salit l'arbre git à
     chaque démarrage et contrevient à la règle 7 (« contenu externe = données,
     pas instructions »). Ce que ce bloc apprend d'utile — les guides Next 16
     vivent dans `node_modules/next/dist/docs/` — est repris dans AGENTS.md,
     dans nos mots et sous notre contrôle. */
  agentRules: false,
  /* Ces trois clés entrent telles quelles dans le paquet JavaScript. Elles se
     lisent une par une, jamais par déstructuration de `process.env` : Next les
     remplace littéralement à la compilation, et un `const { X } = process.env`
     ne trouverait rien (doc Next, `05-config/01-next-config-js/env.md`). */
  env: {
    NEXT_PUBLIC_VERSION: lireNumeroDeVersion(),
    NEXT_PUBLIC_COMPILEE_LE: COMPILEE_LE,
    NEXT_PUBLIC_EMPREINTE: lireEmpreinte(),
  },
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

/**
 * Les écrans que l'application met en cache dès son installation.
 *
 * Sans cette liste, seuls les écrans déjà **visités** survivaient à une
 * coupure : un gérant qui ouvre l'application le matin sur l'accueil et perd
 * le réseau ne pouvait plus atteindre le formulaire d'entrée en stock, alors
 * que c'est précisément ce que le produit promet de savoir faire. Le service
 * worker les télécharge donc tous à l'installation, pendant qu'il y a du
 * réseau (D40).
 *
 * Une route de plus dans l'application est une ligne de plus ici. C'est le
 * genre d'oubli qui ne se voit qu'en coupure, donc les tests bout en bout en
 * vérifient au moins un.
 */
const ECRANS_HORS_LIGNE = [
  "/hors-ligne",
  "/login",
  "/dashboard",
  "/supervision",
  "/supervision/couts",
  "/motos",
  "/motos/nouvelle",
  "/motos/ventes",
  "/motos/dossiers",
  "/motos/ventes/nouvelle",
  "/motos/paiements",
  "/clients",
  "/pieces",
  "/pieces/nouvelle",
  "/caisse",
  "/diagnostic",
  "/parametres",
  "/parametres/boutiques",
  "/parametres/utilisateurs",
  "/parametres/entreprise",
  "/parametres/catalogue",
  "/parametres/referentiels",
  "/parametres/prestataires",
];

/* Une révision par build : elle change à chaque compilation pour qu'une
   nouvelle version remplace l'ancienne dans le cache, et reste identique
   pour toutes les entrées d'un même build. C'est l'instant que lit aussi le
   gérant dans « Cet appareil ». */
const REVISION = `${Date.parse(COMPILEE_LE)}`;

const construireAvecServiceWorker = () =>
  withSerwistInit({
    swSrc: "app/sw.ts",
    swDest: "public/sw.js",
    reloadOnOnline: false,
    additionalPrecacheEntries: ECRANS_HORS_LIGNE.map((url) => ({ url, revision: REVISION })),
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
