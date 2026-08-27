import { defineConfig } from "vitest/config";

/* Vitest ne couvre que la logique metier pure : calculs de montants, machines a
   etats, numerotation. C'est la que le bug coute de l'argent reel
   (ARCHITECTURE.md SS4). Le rendu et le hors-ligne sont l'affaire de Playwright,
   les regles Firestore celle de leur propre harnais.

   `functions/src` y figure parce que la reconciliation des numeros est, elle
   aussi, du calcul pur : elle merite d'etre verifiee sans emulateur, en
   millisecondes. Le declencheur qui l'appelle, lui, se verifie sur emulateur
   (npm run test:fonctions). */
export default defineConfig({
  test: {
    include: ["lib/**/*.test.ts", "functions/src/**/*.test.ts"],
    environment: "node",
    globals: false,
  },
});
