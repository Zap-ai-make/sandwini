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

const RESPONSABLE = { email: "responsable@sdi.test", motDePasse: "responsable-sdi-2026" };

/** Ouvre une session : la plupart des écrans en exigent une depuis S2. */
async function seConnecter(page) {
  await page.goto(`${BASE}/login`, { waitUntil: "load" });
  await page.getByLabel("Adresse e-mail").fill(RESPONSABLE.email);
  await page.getByLabel("Mot de passe", { exact: true }).fill(RESPONSABLE.motDePasse);
  await page.getByRole("button", { name: /Se connecter/ }).click();
  await page.waitForURL("**/dashboard");
}

const PRISES = [
  { nom: "connexion-mobile-clair", chemin: "/login", theme: "light", mobile: true, publique: true },
  { nom: "connexion-mobile-sombre", chemin: "/login", theme: "dark", mobile: true, publique: true },
  { nom: "reglages-mobile-clair", chemin: "/parametres", theme: "light", mobile: true },
  { nom: "boutiques-mobile-clair", chemin: "/parametres/boutiques", theme: "light", mobile: true },
  { nom: "boutiques-bureau-sombre", chemin: "/parametres/boutiques", theme: "dark", mobile: false },
  { nom: "utilisateurs-mobile-clair", chemin: "/parametres/utilisateurs", theme: "light", mobile: true },
  { nom: "utilisateurs-bureau-sombre", chemin: "/parametres/utilisateurs", theme: "dark", mobile: false },
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

for (const { nom, chemin, theme, mobile, coupe, publique } of PRISES) {
  const contexte = await navigateur.newContext({
    ...(mobile ? devices["Pixel 7"] : { viewport: { width: 1280, height: 820 } }),
    colorScheme: theme,
  });
  const page = await contexte.newPage();
  if (!publique) await seConnecter(page);
  await page.goto(`${BASE}${chemin}`, { waitUntil: "load" });
  await page.locator("h1").first().waitFor({ timeout: 20000 });
  /* Une capture prise pendant « Chargement… » ne dit rien du rendu réel : on
     attend que les listes en direct soient arrivées (DESIGN.md §14). */
  await page
    .getByText(/Chargement/)
    .first()
    .waitFor({ state: "detached", timeout: 15000 })
    .catch(() => {});
  if (coupe) {
    await contexte.setOffline(true);
    await page.getByRole("status").getByText("Hors ligne").waitFor({ timeout: 5000 });
  }
  await page.screenshot({ path: `${DOSSIER}/${nom}.png`, fullPage: !mobile });
  console.log(`capturé  ${DOSSIER}/${nom}.png`);
  await contexte.close();
}

await navigateur.close();
