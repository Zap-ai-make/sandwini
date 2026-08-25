import { defineConfig, devices } from "@playwright/test";

/* Le hors-ligne ne se verifie que sur un build reel : en developpement, le
   service worker est desactive (cf. next.config.ts). D'ou `npm run build` puis
   `npm start` comme serveur de test. */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
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
  webServer: [
    {
      // Les emulateurs Firebase : le test hors-ligne ecrit reellement dans Firestore.
      command: "npx firebase emulators:start --only auth,firestore --project sdi-dev",
      url: "http://127.0.0.1:4100",
      reuseExistingServer: true,
      timeout: 120_000,
    },
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
