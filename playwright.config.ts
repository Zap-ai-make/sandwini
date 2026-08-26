import { defineConfig, devices } from "@playwright/test";

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
  timeout: 60_000,
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
