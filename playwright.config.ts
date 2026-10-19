import { defineConfig, devices } from "@playwright/test";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { projetsCompiles, verdictGarde } from "./lib/domain/garde-emulateurs";

/**
 * Garde-fou : la suite ne tourne QUE sur un build compilé pour les émulateurs.
 *
 * Ces tests créent des comptes, des boutiques, des motos et des ventes, puis
 * vident la base. Pointés sur un vrai projet Firebase, ils détruiraient des
 * données réelles — et personne ne s'en apercevrait avant de les chercher.
 *
 * **Il lisait un fichier, il lit maintenant le paquet (S53).** L'ancienne
 * version cherchait `NEXT_PUBLIC_FIREBASE_EMULATEURS=1` dans le texte de
 * `.env.local` ou `.env`. Or le `webServer` ci-dessous sert un build **déjà
 * compilé**, où ces variables sont figées depuis le `next build` : poser le
 * fichier puis lancer la suite sans recompiler faisait passer le garde pendant
 * que le navigateur parlait au vrai projet. Aucun message, verdict vert — soit
 * exactement la catastrophe qu'il existe pour empêcher, dans le cas le plus
 * naturel qui soit. Trou constaté le 6 octobre 2026.
 *
 * Le `projectId` compilé est littéralement ce à quoi le navigateur va parler :
 * c'est donc lui qu'on interroge. Le fichier ne décide de rien. Contrepartie
 * voulue : la suite exige qu'on ait recompilé, et le dit quand ce n'est pas le
 * cas. La logique du verdict vit dans `lib/domain/garde-emulateurs.ts`, sous
 * tests — une règle écrite deux fois ne se change pas d'un seul côté (D107).
 */
const REPERTOIRE_BUILD = process.env.NEXT_DIST_DIR ?? ".next";

function projetsDuBuild(): string[] {
  const racine = join(REPERTOIRE_BUILD, "static", "chunks");
  /* Répertoire absent : `verdictGarde` traite l'absence de projet comme un
     refus, et son message dit de compiler. Rien à décider ici. */
  if (!existsSync(racine)) return [];

  const projets = new Set<string>();
  for (const entree of readdirSync(racine, { recursive: true })) {
    const chemin = String(entree);
    if (!chemin.endsWith(".js")) continue;
    for (const projet of projetsCompiles([readFileSync(join(racine, chemin), "utf8")])) {
      projets.add(projet);
    }
  }
  return [...projets];
}

function exigerLesEmulateurs(): void {
  const verdict = verdictGarde(projetsDuBuild());
  if (verdict !== null) throw new Error(verdict);
}

exigerLesEmulateurs();

/* Le hors-ligne ne se verifie que sur un build reel : en developpement, le
   service worker est desactive (cf. next.config.ts). D'ou `npm run build` puis
   `npm start` comme serveur de test. */
export default defineConfig({
  testDir: "./e2e",
  // Contrôle de l'environnement avant toute mesure, puis amorçage du compte
  // responsable — cf. e2e/preparation.ts.
  globalSetup: "./e2e/preparation.ts",
  fullyParallel: false,
  /* Un seul worker : toute la suite partage un jeu d'émulateurs, un compte
     responsable et une base de données. En parallèle, deux fichiers créaient
     des comptes et appelaient les mêmes Cloud Functions en même temps, et la
     suite rendait un verdict différent d'une exécution à l'autre — sans qu'un
     seul de ces échecs porte sur le produit. Un test qui échoue doit accuser le
     code, pas le voisin. La suite complète tourne en une minute. */
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  /* Les 30 secondes par défaut ne suffisent pas ici : plusieurs tests attendent
     volontairement des bascules réseau (coupure, retour, remise en file), et
     s'accordent déjà 20 à 30 secondes par attente. Le plafond du test doit
     donc être plus large que la somme de ses attentes, sinon il tombe non pas
     sur un défaut du produit mais sur sa propre arithmétique. */
  timeout: 90_000,
  /**
   * Le plafond de la passe entière, et il a une raison mesurée (S27).
   *
   * Le budget par test ne couvre pas tout : quand l'émulateur Functions perd sa
   * socket — « Request to function failed: Error: socket hang up » —, un test
   * peut rester suspendu **bien au-delà** de son propre budget. Deux cas
   * mesurés, à 45 minutes et à 1 h 30 pour un test qui en demandait trois. Une
   * passe lancée le soir se retrouvait encore là le matin, et le verdict qu'on
   * venait chercher n'existait pas.
   *
   * Deux heures laissent la place à la suite complète sur une machine chargée,
   * et coupent net ce qui ne finira pas.
   */
  globalTimeout: 2 * 60 * 60_000,
  /* Le budget par assertion, porté de cinq à quinze secondes.
     Presque toutes les attentes de cette suite portent sur de la propagation
     asynchrone : une écriture part dans la file Firestore, revient par un
     écouteur, et l'écran se met à jour. Sur un émulateur partagé avec un
     serveur Next et quatre runtimes de fonctions, ce trajet dépasse
     régulièrement cinq secondes — et la suite rendait alors un verdict qui
     accusait le produit d'un défaut qui n'était que de l'impatience. Quinze
     secondes ne masquent rien : une donnée qui n'arrive pas fait toujours
     tomber le test, simplement pour la bonne raison. */
  expect: { timeout: 15_000 },
  reporter: process.env.CI ? "list" : [["list"], ["html", { open: "never" }]],
  /* Port dédié, distinct du 3000 du serveur de développement.
     Sans cela, Playwright réutilisait un `npm run dev` en cours et testait un
     build de développement — où le service worker est désactivé et la CSP plus
     permissive. La suite rendait alors un verdict qui ne portait pas sur ce
     qu'on croyait vérifier. Un harnais de test qui mesure ce qui traîne sur le
     port n'est pas un harnais. */
  use: {
    baseURL: "http://127.0.0.1:3100",
    trace: "retain-on-failure",
  },
  projects: [
    {
      // Le terrain reel : un Android d'entree de gamme, pas un ecran 27 pouces.
      name: "android",
      use: { ...devices["Pixel 7"] },
    },
  ],
  /* Les émulateurs ne sont pas démarrés d'ici : ce sont un service de
     développement que l'on lance à part (« npm run emulators »). Les piloter
     depuis Playwright entrait en conflit avec l'instance du développeur et
     rendait les échecs illisibles. e2e/preparation.ts vérifie simplement
     qu'ils répondent, et dit quoi taper sinon. */
  webServer: [
    {
      // Toujours un serveur neuf sur le build courant : jamais de réutilisation,
      // pour que le verdict porte sur ce qui vient d'être compilé.
      command: "npm run start -- --port 3100",
      url: "http://127.0.0.1:3100/dashboard",
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ],
});
