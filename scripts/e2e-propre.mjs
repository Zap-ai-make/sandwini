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
import { readFileSync, rmSync } from "node:fs";
import { createConnection } from "node:net";

/**
 * Les ports à surveiller, **lus dans `firebase.json`** et non recopiés.
 *
 * Ils l'étaient, et les deux listes avaient divergé dans les deux sens : le
 * script guettait le hub sur 4400 et Storage sur 9199 — les ports *par défaut*
 * de Firebase —, quand SDI les a déplacés sur 4700 et 9599. Or `firebase.json`
 * dit pourquoi il les a déplacés : « la machine de développement fait tourner
 * d'autres projets Firebase, et les ports par défaut entrent en conflit avec
 * eux ». Le garde surveillait donc exactement la collision que la configuration
 * avait été écrite pour éviter.
 *
 * Les deux conséquences sont opposées, et la seconde est la pire. Il refusait
 * de démarrer parce qu'un **autre projet** occupait 4400 — un faux refus, qui
 * bloque une passe légitime. Et il n'aurait rien dit d'un émulateur **SDI**
 * resté ouvert sur 4700 ou 9599, c'est-à-dire du cas qu'il existe pour
 * attraper.
 *
 * Une liste recopiée finit toujours par mentir : celle-ci se lit à la source.
 */
function portsDesEmulateurs() {
  const NOMS = {
    firestore: "Firestore",
    auth: "Authentication",
    functions: "Functions",
    storage: "Storage",
    hub: "hub des émulateurs",
  };
  const configuration = JSON.parse(readFileSync("firebase.json", "utf8"));
  return Object.entries(NOMS)
    .map(([cle, nom]) => ({ port: configuration.emulators?.[cle]?.port, nom }))
    .filter(({ port }) => typeof port === "number");
}

const PORTS = portsDesEmulateurs();

if (PORTS.length === 0) {
  console.error(
    "Aucun port d'émulateur lisible dans `firebase.json`. Sans eux, ce script ne " +
      "peut pas garantir des émulateurs neufs — ce qui est sa seule raison d'être.",
  );
  process.exit(1);
}

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
      "Des émulateurs SDI tournent déjà : " + occupes.join(", ") + ".",
      "",
      "Ces ports sont ceux de `firebase.json`, donc ceux de ce projet : un autre",
      "projet Firebase sur la machine ne déclenche plus ce refus.",
      "",
      "Cette commande démarre un jeu neuf, et refuse de mesurer sur celui",
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
