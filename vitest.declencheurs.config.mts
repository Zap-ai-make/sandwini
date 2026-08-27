import { defineConfig } from "vitest/config";

/* Les tests de declencheurs parlent aux emulateurs Firestore *et* Functions :
   ils ecrivent un document et attendent qu'une fonction reagisse. Sequentiels
   par nature — deux fichiers qui ecrivent dans la meme collection se verraient
   l'un l'autre — et lents, parce qu'attendre une reaction prend le temps qu'il
   faut.

   Ils ne tournent pas avec `npm run test:unite` : la regle de reconciliation,
   elle, se verifie sans emulateur (functions/src/numerotation.test.ts). Ici on
   verifie le cablage, pas la regle. */
export default defineConfig({
  test: {
    include: ["declencheurs/**/*.test.ts"],
    environment: "node",
    globals: false,
    fileParallelism: false,
    testTimeout: 40_000,
    hookTimeout: 120_000,
  },
});
