/**
 * Une passe bout en bout sur des émulateurs **neufs**, du début à la fin.
 *
 *     npm run test:e2e:propre
 *
 * **Pourquoi ce script existe** (S27). Les émulateurs vieillissent, et pas avec
 * le temps : avec les données. `e2e/preparation.ts` vide la base une fois par
 * passe, puis les cent tests y accumulent chacun une boutique, une marque, un
 * modèle, une provenance, un client. Or presque chaque écran du produit écoute
 * ces collections **en entier** — c'est le choix de D16 et il est bon pour le
 * comptoir. Au centième test, chaque ouverture d'écran relit tout ce que les
 * quatre-vingt-dix-neuf précédents ont écrit. Le coût de la suite n'est donc pas
 * linéaire, et une passe lancée sur les émulateurs du matin part déjà chargée de
 * la veille.
 *
 * `firebase emulators:exec` démarre son propre jeu, exécute, puis l'éteint. Rien
 * ne survit d'une passe à l'autre : le verdict porte sur le code, pas sur ce qui
 * traîne.
 *
 * **Le build a lieu avant**, et hors des émulateurs : il n'en a pas besoin, et
 * chaque minute passée à compiler pendant qu'ils tournent est une minute de
 * fraîcheur perdue. Purger `.next` n'est pas une précaution : le développement
 * compile en Turbopack, la production en webpack, et les deux partagent le
 * répertoire.
 */
import { spawnSync } from "node:child_process";
import { rmSync } from "node:fs";
import { createConnection } from "node:net";

const PORTS = [
  { port: 8181, nom: "Firestore" },
  { port: 9399, nom: "Authentication" },
  { port: 5301, nom: "Functions" },
  { port: 9199, nom: "Storage" },
  { port: 4400, nom: "hub des émulateurs" },
];

/** Le délai de découverte des fonctions, pour la même raison que `emulateurs.mjs`. */
const SECONDES_DECOUVERTE = "60";

function ecoute(port) {
  return new Promise((resoudre) => {
    const prise = createConnection({ port, host: "127.0.0.1" })
      .on("connect", () => {
        prise.destroy();
        resoudre(true);
      })
      .on("error", () => resoudre(false));
    prise.setTimeout(800, () => {
      prise.destroy();
      resoudre(false);
    });
  });
}

const occupes = [];
for (const { port, nom } of PORTS) {
  if (await ecoute(port)) occupes.push(`${nom} (${port})`);
}

if (occupes.length > 0) {
  console.error(
    [
      "Des émulateurs tournent déjà : " + occupes.join(", ") + ".",
      "",
      "Cette commande en démarre un jeu neuf, et refuse de mesurer sur celui",
      "d'à côté : c'est précisément ce qu'elle existe pour éviter (S27).",
      "",
      "Arrêtez le terminal qui fait tourner « npm run emulators », puis",
      "relancez. Pour mesurer volontairement sur des émulateurs vieillis —",
      "c'est une mesure légitime, pas un accident — utilisez « npm run test:e2e ».",
    ].join("\n"),
  );
  process.exit(1);
}

function etape(titre, commande, arguments_, environnement = {}) {
  console.log(`\n▸ ${titre}`);
  const resultat = spawnSync(commande, arguments_, {
    stdio: "inherit",
    shell: true,
    env: { ...process.env, ...environnement },
  });
  return resultat.status ?? 1;
}

console.log("▸ Purge de .next (Turbopack et webpack partagent ce répertoire)");
rmSync(".next", { recursive: true, force: true });

const compilation = etape("Compilation de production", "npm", ["run", "build"]);
if (compilation !== 0) process.exit(compilation);

/* Le jeu d'émulateurs ne vit que le temps de la passe. `emulators:exec` rend le
   code de sortie de la commande, ce qui fait de cette passe un verdict. */
const passe = etape(
  "Émulateurs neufs, puis la suite bout en bout",
  "npx",
  [
    "firebase",
    "emulators:exec",
    "--only",
    "auth,firestore,storage,functions",
    process.argv.slice(2).length > 0
      ? `"npx playwright test ${process.argv.slice(2).join(" ")}"`
      : '"npx playwright test"',
  ],
  { FUNCTIONS_DISCOVERY_TIMEOUT: SECONDES_DECOUVERTE },
);

process.exit(passe);
