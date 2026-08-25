import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Service worker produit par Serwist au build : du code généré, minifié,
    // qu'on ne relit pas et qu'on ne commite pas non plus (ARCHITECTURE.md §11).
    "public/sw.js",
    "public/sw.js.map",
    "public/swe-worker-*.js",
    // Rapports et captures produits par les tests.
    "playwright-report/**",
    "test-results/**",
    "captures/**",
    // Sortie de compilation des Cloud Functions.
    "functions/lib/**",
  ]),
]);

export default eslintConfig;
