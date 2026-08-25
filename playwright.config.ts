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
  use: {
    baseURL: "http://127.0.0.1:3000",
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
      command: "npm run start",
      url: "http://127.0.0.1:3000/dashboard",
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
  ],
});
