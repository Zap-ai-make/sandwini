import { defineConfig } from "vitest/config";

/* Les tests des fonctions appelables parlent aux emulateurs Auth, Firestore
   *et* Functions : ils se connectent pour obtenir un vrai jeton, appellent la
   fonction en HTTP, puis relisent le compte et son miroir.

   Sequentiels par nature — ils creent et effacent des comptes, et deux fichiers
   qui le feraient de front se verraient l'un l'autre — et lents, parce qu'un
   runtime par fonction demarre a la premiere invocation (D43, D49).

   Ils ne tournent pas avec `npm run test:unite` : la regle qui lit une demande
   de modification, elle, se verifie sans emulateur
   (functions/src/gerants.test.ts). Ici on verifie les gardes, pas la regle.

   Pendant de `vitest.declencheurs.config.mts` : les deux natures de code
   serveur du produit, chacune avec sa suite. */
export default defineConfig({
  test: {
    include: ["appelables/**/*.test.ts"],
    environment: "node",
    globals: false,
    fileParallelism: false,
    testTimeout: 40_000,
    hookTimeout: 120_000,
  },
});
