import { defineConfig } from "vitest/config";

/* Vitest ne couvre que la logique metier pure de lib/ : calculs de montants,
   machines a etats, numerotation. C'est la que le bug coute de l'argent reel
   (ARCHITECTURE.md SS4). Le rendu et le hors-ligne sont l'affaire de Playwright,
   les regles Firestore celle de leur propre harnais. */
export default defineConfig({
  test: {
    include: ["lib/**/*.test.ts"],
    environment: "node",
    globals: false,
  },
});
