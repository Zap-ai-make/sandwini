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
  { nom: "entreprise-mobile-clair", chemin: "/parametres/entreprise", theme: "light", mobile: true },
  { nom: "catalogue-mobile-clair", chemin: "/parametres/catalogue", theme: "light", mobile: true },
  { nom: "catalogue-bureau-sombre", chemin: "/parametres/catalogue", theme: "dark", mobile: false },
  { nom: "referentiels-mobile-clair", chemin: "/parametres/referentiels", theme: "light", mobile: true },
  { nom: "prestataires-bureau-clair", chemin: "/parametres/prestataires", theme: "light", mobile: false },
  { nom: "utilisateurs-mobile-clair", chemin: "/parametres/utilisateurs", theme: "light", mobile: true },
  { nom: "utilisateurs-bureau-sombre", chemin: "/parametres/utilisateurs", theme: "dark", mobile: false },
  { nom: "accueil-mobile-clair", chemin: "/dashboard", theme: "light", mobile: true },
  { nom: "accueil-mobile-sombre", chemin: "/dashboard", theme: "dark", mobile: true },
  { nom: "accueil-bureau-clair", chemin: "/dashboard", theme: "light", mobile: false },
  { nom: "clients-mobile-clair", chemin: "/clients", theme: "light", mobile: true },
  { nom: "clients-bureau-sombre", chemin: "/clients", theme: "dark", mobile: false },
  { nom: "motos-mobile-clair", chemin: "/motos", theme: "light", mobile: true },
  { nom: "motos-bureau-sombre", chemin: "/motos", theme: "dark", mobile: false },
  { nom: "motos-nouvelle-mobile-clair", chemin: "/motos/nouvelle", theme: "light", mobile: true, boutique: true },
  { nom: "motos-nouvelle-bureau-sombre", chemin: "/motos/nouvelle", theme: "dark", mobile: false, boutique: true },
  { nom: "ventes-mobile-clair", chemin: "/motos/ventes", theme: "light", mobile: true, boutique: true },
  { nom: "ventes-bureau-sombre", chemin: "/motos/ventes", theme: "dark", mobile: false, boutique: true },
  { nom: "vente-nouvelle-mobile-clair", chemin: "/motos/ventes/nouvelle", theme: "light", mobile: true, boutique: true },
  { nom: "vente-nouvelle-mobile-sombre", chemin: "/motos/ventes/nouvelle", theme: "dark", mobile: true, boutique: true },
  { nom: "vente-nouvelle-bureau-clair", chemin: "/motos/ventes/nouvelle", theme: "light", mobile: false, boutique: true },
  { nom: "vente-nouvelle-bureau-sombre", chemin: "/motos/ventes/nouvelle", theme: "dark", mobile: false, boutique: true },
  /* Sans choix de boutique : le périmètre « toutes » est celui du responsable,
     et c'est le seul qui montre des listes garnies quel que soit l'état de la
     base. Un écran de suivi photographié vide ne se revoit pas. */
  { nom: "paiements-mobile-clair", chemin: "/motos/paiements", theme: "light", mobile: true },
  { nom: "paiements-bureau-sombre", chemin: "/motos/paiements", theme: "dark", mobile: false },
  /* La fiche d'une vente n'a pas d'adresse fixe : c'est un panneau ouvert par
     `?vente=`. On ouvre donc la première de la liste, comme le ferait un
     gérant — sans quoi l'écran qui porte le formulaire de versement ne serait
     jamais regardé. */
  { nom: "vente-fiche-mobile-clair", chemin: "/motos/ventes", theme: "light", mobile: true, premiereVente: true },
  { nom: "vente-fiche-bureau-sombre", chemin: "/motos/ventes", theme: "dark", mobile: false, premiereVente: true },
  { nom: "recus-mobile-clair", chemin: "/motos/recus", theme: "light", mobile: true },
  { nom: "recus-bureau-sombre", chemin: "/motos/recus", theme: "dark", mobile: false },
  /* Le reçu lui-même : un panneau ouvert par `?recu=`, donc atteint en cliquant
     la première ligne de la liste, comme le ferait un gérant. */
  { nom: "recu-mobile-clair", chemin: "/motos/recus", theme: "light", mobile: true, premierRecu: true },
  { nom: "recu-bureau-sombre", chemin: "/motos/recus", theme: "dark", mobile: false, premierRecu: true },
  /* **Le rendu imprimé, qui est le vrai livrable de S10.** Un `@media print`
     cassé ne se voit sur aucune capture ordinaire : sans cette prise, la revue
     visuelle regarderait un écran et croirait avoir vu le papier. */
  { nom: "recu-papier", chemin: "/motos/recus", theme: "light", mobile: false, premierRecu: true, impression: true },
  { nom: "diagnostic-mobile-clair", chemin: "/diagnostic", theme: "light", mobile: true, boutique: true },
  { nom: "diagnostic-bureau-sombre", chemin: "/diagnostic", theme: "dark", mobile: false, boutique: true },
  { nom: "hors-ligne-mobile-clair", chemin: "/hors-ligne", theme: "light", mobile: true },
  // Le bandeau en alerte : l’état signature du produit.
  { nom: "accueil-mobile-coupe", chemin: "/dashboard", theme: "light", mobile: true, coupe: true },
  { nom: "accueil-mobile-sombre-coupe", chemin: "/dashboard", theme: "dark", mobile: true, coupe: true },
];

await mkdir(DOSSIER, { recursive: true });
const navigateur = await chromium.launch();

for (const {
  nom,
  chemin,
  theme,
  mobile,
  coupe,
  publique,
  boutique,
  premiereVente,
  premierRecu,
  impression,
} of PRISES) {
  const contexte = await navigateur.newContext({
    ...(mobile ? devices["Pixel 7"] : { viewport: { width: 1280, height: 820 } }),
    colorScheme: theme,
  });
  const page = await contexte.newPage();
  let boutiqueChoisie = null;
  if (!publique) await seConnecter(page);

  /* Certains écrans n'ont de sens que dans une boutique précise : le formulaire
     d'entrée en stock demande où ranger la moto. On en choisit une, comme le
     ferait le responsable avant de saisir. */
  if (boutique) {
    const selecteur = page.getByRole("banner").getByRole("combobox", { name: "Boutique affichée" });
    /* On attend une option qui porte vraiment un code : la première, « Toutes
       les boutiques », existe avant que la liste soit chargée. */
    await selecteur.locator('option[value]:not([value=""])').first().waitFor({
      state: "attached",
      timeout: 20000,
    });
    const codes = await selecteur.locator("option").evaluateAll((options) =>
      options.map((option) => option.value).filter(Boolean),
    );
    await selecteur.selectOption(codes[0]);
    boutiqueChoisie = codes[0];
  }

  await page.goto(`${BASE}${chemin}`, { waitUntil: "load" });
  await page.locator("h1").first().waitFor({ timeout: 20000 });

  /* Le périmètre se vérifie **après** la navigation, pas avant.
     Le choix est mémorisé tout de suite, mais l'écran d'arrivée le relit à son
     propre rythme : photographié trop tôt, il montre encore « Toutes les
     boutiques ». La version précédente ne vérifiait rien du tout, et avalait
     même l'échec du choix — depuis S5, les captures de `motos/nouvelle`
     montraient l'invitation à choisir une boutique, et la revue visuelle
     portait sur un écran vide sans que cela se voie. Un outil de revue qui ne
     montre pas ce qu'on croit est pire que pas d'outil. */
  if (boutiqueChoisie) {
    const selecteur = page.getByRole("banner").getByRole("combobox", { name: "Boutique affichée" });
    let applique = false;
    for (let essai = 0; essai < 40 && !applique; essai += 1) {
      applique = (await selecteur.inputValue().catch(() => "")) === boutiqueChoisie;
      if (!applique) await page.waitForTimeout(500);
    }
    if (!applique) {
      throw new Error(`Le périmètre ne s'est pas appliqué à « ${nom} » (attendu ${boutiqueChoisie}).`);
    }
  }
  /* Une capture prise pendant « Chargement… » ne dit rien du rendu réel : on
     attend que les listes en direct soient arrivées (DESIGN.md §14). */
  await page
    .getByText(/Chargement/)
    .first()
    .waitFor({ state: "detached", timeout: 15000 })
    .catch(() => {});
  if (premiereVente || premierRecu) {
    /* Dans le contenu, pas n'importe où : la navigation principale est elle
       aussi une liste, et sa première entrée renvoyait à l'accueil. */
    const premiere = page.getByRole("main").getByRole("listitem").first().getByRole("link").first();
    await premiere.waitFor({ timeout: 20000 });
    await premiere.click();
    await page.locator("h1").first().waitFor({ timeout: 20000 });
    await page
      .getByText(/Chargement/)
      .first()
      .waitFor({ state: "detached", timeout: 15000 })
      .catch(() => {});
  }
  if (coupe) {
    await contexte.setOffline(true);
    await page.getByRole("status").getByText("Hors ligne").waitFor({ timeout: 5000 });
  }
  /* On regarde ce qui sortira de l'imprimante, pas ce qui est à l'écran : la
     feuille `@media print` retire la coquille, repasse la palette en clair et
     ajoute les traits de signature (DESIGN.md §14 — regarder le rendu réel). */
  if (impression) await page.emulateMedia({ media: "print" });
  await page.screenshot({ path: `${DOSSIER}/${nom}.png`, fullPage: !mobile });
  console.log(`capturé  ${DOSSIER}/${nom}.png`);
  await contexte.close();
}

await navigateur.close();
