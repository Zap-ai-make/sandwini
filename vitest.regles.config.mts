import { defineConfig } from "vitest/config";

/* Les tests de regles parlent a l'emulateur Firestore : ils sont sequentiels,
   plus lents, et lances par `firebase emulators:exec` (cf. package.json). */
export default defineConfig({
  test: {
    include: ["regles/**/*.test.ts"],
    environment: "node",
    globals: false,
    fileParallelism: false,
    testTimeout: 20_000,
    hookTimeout: 30_000,
  },
});
