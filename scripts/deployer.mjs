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
 *     npm run deployer -- --only functions --project sandwini
 *
 * Tout ce qui suit `--` part à `firebase deploy` sans être relu : le script
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

if (arguments_.length === 0) {
  console.error(
    "Rien à déployer. Nommez la cible et le projet, par exemple :\n" +
      "  npm run deployer -- --only functions --project sandwini\n" +
      "  npm run deployer -- --only firestore:rules --project sandwini",
  );
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
