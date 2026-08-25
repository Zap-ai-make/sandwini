/**
 * Génère les icônes PWA à partir d'une seule source SVG.
 *
 * Le rendu passe par Chromium via Playwright, déjà présent pour les tests : pas
 * de dépendance graphique supplémentaire pour quatre fichiers (ARCHITECTURE.md
 * §1, échelle 4).
 *
 *   node scripts/generer-icones.mjs
 */
import { mkdir, writeFile } from "node:fs/promises";
import { chromium } from "@playwright/test";

const DOSSIER = new URL("../public/icones/", import.meta.url);

/* L'icône reprend la signature du produit : une plaque d'immatriculation.
   Jaune de plaque, caractères encre, filet noir. `marge` réserve la zone sûre
   exigée par les icônes « maskable » d'Android, qui recadrent en cercle. */
const svg = (taille, marge) => {
  const bord = taille * marge;
  const plaque = taille - bord * 2;
  const rayon = plaque * 0.14;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${taille}" height="${taille}" viewBox="0 0 ${taille} ${taille}">
  <rect width="${taille}" height="${taille}" fill="#F5C518"/>
  <rect x="${bord}" y="${bord}" width="${plaque}" height="${plaque}" rx="${rayon}"
        fill="#F5C518" stroke="#0F1720" stroke-width="${plaque * 0.055}"/>
  <text x="50%" y="50%" dy="0.35em" text-anchor="middle"
        font-family="Arial Black, Arial, Helvetica, sans-serif"
        font-weight="900" font-size="${plaque * 0.42}"
        letter-spacing="${plaque * 0.02}" fill="#0F1720">SDI</text>
</svg>`;
};

const CIBLES = [
  { fichier: "icone-192.png", taille: 192, marge: 0.06 },
  { fichier: "icone-512.png", taille: 512, marge: 0.06 },
  // Android recadre les icônes maskable : le motif doit tenir dans les 80 %
  // centraux, d'où une marge nettement plus large.
  { fichier: "icone-maskable-512.png", taille: 512, marge: 0.18 },
  { fichier: "apple-touch-icon.png", taille: 180, marge: 0.06 },
];

const navigateur = await chromium.launch();
const page = await navigateur.newPage();
await mkdir(DOSSIER, { recursive: true });

for (const { fichier, taille, marge } of CIBLES) {
  await page.setViewportSize({ width: taille, height: taille });
  await page.setContent(
    `<body style="margin:0">${svg(taille, marge)}</body>`,
    { waitUntil: "load" },
  );
  const png = await page.screenshot({ omitBackground: false });
  await writeFile(new URL(fichier, DOSSIER), png);
  console.log(`écrit  public/icones/${fichier}  (${taille}×${taille})`);
}

await navigateur.close();

// La source SVG est versionnée elle aussi : elle sert de favicon moderne et
// permet de régénérer les PNG sans relire ce script.
await writeFile(new URL("icone.svg", DOSSIER), svg(512, 0.06));
console.log("écrit  public/icones/icone.svg");
