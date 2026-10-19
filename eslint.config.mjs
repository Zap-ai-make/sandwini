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
    // Le build d'a cote, quand `NEXT_DIST_DIR` le deplace (cf. next.config.ts).
    // Oublie ici alors qu'il etait deja dans `.gitignore` : le lint y trouvait
    // 147 fichiers generes et 1687 erreurs, pour un code source propre. Un
    // repertoire de build se range dans les deux listes, jamais dans une seule.
    ".next-emulateurs/**",
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
    // Les worktrees d'agent vivent dans le depot : `.claude/worktrees/S49` est
    // une copie de travail complete, rapports Playwright et `node_modules`
    // compris. Sans cette ligne, `npm run lint` relit ce bois mort — mesure du
    // 7 octobre 2026 : 1953 erreurs, toutes de la, et huit minutes de lint
    // pour un code source propre. Un lint qui crie faux ne se lit plus.
    ".claude/**",
  ]),
]);

export default eslintConfig;
