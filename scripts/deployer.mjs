/**
 * Déploie sur Firebase avec un délai de découverte réaliste.
 *
 * Avant d'envoyer quoi que ce soit, la CLI lance le code compilé et l'interroge
 * pour savoir quelles fonctions il déclare. Elle accorde **dix secondes**, tous
 * frais compris. Sur cette machine le seul chargement du module en prend près
 * de quatre à froid, et le déploiement s'arrête sur :
 *
 *     Error: User code failed to load.
 *     Cannot determine backend specification. Timeout after 10000.
 *
 * `DEPLOIEMENT.md` donnait déjà le remède — préfixer la commande de
 * `FUNCTIONS_DISCOVERY_TIMEOUT=120`. Il le donnait en syntaxe POSIX, et ce
 * dépôt se développe sous Windows : PowerShell ne connaît pas le préfixe de
 * variable, il cherche une commande qui s'appellerait
 * `FUNCTIONS_DISCOVERY_TIMEOUT=120` et refuse. Qui recopie la ligne la voit
 * échouer, retire le préfixe pour la faire passer — et retrouve les dix
 * secondes par défaut. C'est ainsi que le piège a été repayé une troisième
 * fois, en S44, après D23, D25 et D29.
 *
 * Le délai vit donc ici, dans le chemin lui-même, comme il vit déjà dans
 * `scripts/emulateurs.mjs` pour les émulateurs et dans `scripts/e2e-propre.mjs`
 * pour la passe bout en bout. Une ligne de documentation se recopie mal ; un
 * chemin unique ne se recopie pas.
 *
 *     node scripts/deployer.mjs --only functions --project sandwini
 *
 * **Appelé par `node`, et non par `npm run`.** `npm` lit la ligne avant de la
 * transmettre, et `--only` est une de ses propres options : il l'avale avec sa
 * valeur, et n'en laisse rien au script. `--project` subit le même sort. Le
 * `--` censé protéger la suite n'y change rien — npm continue d'interpréter ce
 * qu'il reconnaît. La commande partait donc en `firebase deploy sandwini`, que
 * la CLI refuse pour une raison sans aucun rapport avec la demande : « Too many
 * arguments », sur une ligne qui n'en portait qu'un.
 *
 * *Deuxième fois en une journée qu'un intermédiaire réécrit une commande avant
 * de la passer* — PowerShell pour le préfixe de variable, npm pour les options.
 * Le script détecte ce cas et donne la bonne ligne plutôt que de laisser
 * `firebase` échouer ailleurs. `npm run deployer` reste dans `package.json`
 * pour la découverte.
 *
 * Tout ce qui est passé part à `firebase deploy` sans être relu : le script
 * porte le délai, pas la politique de déploiement. Le projet se nomme
 * explicitement — sans `--project`, la CLI vise `default`, c'est-à-dire
 * `sdi-dev` (`.firebaserc`), et un déploiement ne se devine pas.
 *
 * La compilation des fonctions reste au `predeploy` de `firebase.json` : elle
 * appartient au déploiement, pas à son lanceur.
 */
import { spawn } from "node:child_process";

/* Soixante secondes suffisent aux émulateurs ; le déploiement type-vérifie
   d'abord tout le code des fonctions, et `DEPLOIEMENT.md` a mesuré qu'il lui en
   faut davantage. Le délai n'excuse aucun import lourd (D29 tient) : il absorbe
   la variabilité de la machine. */
const SECONDES_DECOUVERTE = "120";

const arguments_ = process.argv.slice(2);

const EXEMPLES =
  "  node scripts/deployer.mjs --only functions --project sandwini\n" +
  "  node scripts/deployer.mjs --only firestore:rules,functions --project sandwini";

/* npm expose ce qu'il a intercepté : si `npm_config_only` existe, c'est que la
   ligne est passée par `npm run` et que `--only` n'est jamais arrivé jusqu'ici.
   On le dit, plutôt que de laisser `firebase` refuser pour une tout autre
   raison — « Too many arguments », sur une ligne qui n'en portait qu'un. */
const avales = ["only", "project"].filter((nom) => process.env[`npm_config_${nom}`]);
if (avales.length > 0) {
  console.error(
    `npm a intercepté ${avales.map((nom) => `--${nom}`).join(" et ")} : ce sont ses propres\n` +
      "options, et il les retire de la ligne avant que ce script les voie. Le `--`\n" +
      "n'y change rien — npm continue d'interpréter ce qu'il reconnaît.\n" +
      "Appelez le script directement :\n" +
      EXEMPLES,
  );
  process.exit(1);
}

if (arguments_.length === 0) {
  console.error(`Rien à déployer. Nommez la cible et le projet, par exemple :\n${EXEMPLES}`);
  process.exit(1);
}

/* `shell: true` est nécessaire à `npx` sous Windows, et remet la ligne entre
   les mains du shell : un argument qui porte une espace s'y couperait en deux.
   On les recolle avant de les lui rendre. */
const cite = (argument) => (/\s/.test(argument) ? `"${argument}"` : argument);

console.log(`> firebase deploy ${arguments_.join(" ")}`);
console.log(`  FUNCTIONS_DISCOVERY_TIMEOUT=${SECONDES_DECOUVERTE}\n`);

const enfant = spawn("npx", ["firebase", "deploy", ...arguments_.map(cite)], {
  stdio: "inherit",
  shell: true,
  env: { ...process.env, FUNCTIONS_DISCOVERY_TIMEOUT: SECONDES_DECOUVERTE },
});

enfant.on("exit", (code) => process.exit(code ?? 0));
