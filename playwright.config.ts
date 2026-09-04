import { defineConfig, devices } from "@playwright/test";
import { existsSync, readFileSync } from "node:fs";

/**
 * Garde-fou : la suite ne tourne QUE sur les émulateurs.
 *
 * Ces tests créent des comptes, des boutiques, des motos et des ventes, puis
 * vident la base. Pointés sur un vrai projet Firebase, ils détruiraient des
 * données réelles — et personne ne s'en apercevrait avant de les chercher.
 *
 * Le contrôle lit les fichiers d'environnement plutôt que `process.env` : Next
 * les charge lui-même au démarrage du serveur de test, et ce processus-ci ne
 * les voit pas. C'est le même fichier qui décidera dans quelques secondes à
 * quel projet l'application parle.
 */
const SAUT = String.fromCharCode(10);

function exigerLesEmulateurs(): void {
  const fichier = [".env.local", ".env"].find((nom) => existsSync(nom));
  const contenu = fichier ? readFileSync(fichier, "utf8") : "";
  const surEmulateurs = /^NEXT_PUBLIC_FIREBASE_EMULATEURS\s*=\s*1\s*$/m.test(contenu);
  if (surEmulateurs) return;

  throw new Error(
    [
      "Les tests bout en bout refusent de tourner hors des émulateurs.",
      "",
      `Le fichier « ${fichier ?? "(aucun)"} » ne pose pas NEXT_PUBLIC_FIREBASE_EMULATEURS=1 :`,
      "l'application viserait un vrai projet Firebase, et cette suite y créerait",
      "puis effacerait des comptes, des boutiques et des ventes.",
      "",
      "Pour lancer les tests, remettez la configuration des émulateurs :",
      "  mv .env.local.emulateurs .env.local",
    ].join(SAUT),
  );
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
