/**
 * Captures d’écran pour la revue visuelle (DESIGN.md §14 : « prends une capture
 * et regarde le rendu réel »).
 *
 * Suppose l’application servie sur http://127.0.0.1:3000 (npm run build && npm run start).
 *
 *   node scripts/captures.mjs
 */
import { mkdir } from "node:fs/promises";
import { chromium, devices } from "@playwright/test";

const BASE = process.env.BASE_URL ?? "http://127.0.0.1:3000";
const DOSSIER = "captures";

const PRISES = [
  { nom: "accueil-mobile-clair", chemin: "/dashboard", theme: "light", mobile: true },
  { nom: "accueil-mobile-sombre", chemin: "/dashboard", theme: "dark", mobile: true },
  { nom: "accueil-bureau-clair", chemin: "/dashboard", theme: "light", mobile: false },
  { nom: "motos-mobile-clair", chemin: "/motos", theme: "light", mobile: true },
  { nom: "diagnostic-mobile-clair", chemin: "/diagnostic", theme: "light", mobile: true },
  { nom: "hors-ligne-mobile-clair", chemin: "/hors-ligne", theme: "light", mobile: true },
  // Le bandeau en alerte : l’état signature du produit.
  { nom: "accueil-mobile-coupe", chemin: "/dashboard", theme: "light", mobile: true, coupe: true },
  { nom: "accueil-mobile-sombre-coupe", chemin: "/dashboard", theme: "dark", mobile: true, coupe: true },
];

await mkdir(DOSSIER, { recursive: true });
const navigateur = await chromium.launch();

for (const { nom, chemin, theme, mobile, coupe } of PRISES) {
  const contexte = await navigateur.newContext({
    ...(mobile ? devices["Pixel 7"] : { viewport: { width: 1280, height: 820 } }),
    colorScheme: theme,
  });
  const page = await contexte.newPage();
  await page.goto(`${BASE}${chemin}`, { waitUntil: "networkidle" });
  if (coupe) {
    await contexte.setOffline(true);
    await page.getByRole("status").getByText("Hors ligne").waitFor({ timeout: 5000 });
  }
  await page.screenshot({ path: `${DOSSIER}/${nom}.png`, fullPage: !mobile });
  console.log(`capturé  ${DOSSIER}/${nom}.png`);
  await contexte.close();
}

await navigateur.close();
