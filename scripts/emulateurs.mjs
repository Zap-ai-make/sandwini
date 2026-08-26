/**
 * Démarre la Firebase Emulator Suite avec un délai de découverte réaliste.
 *
 * Pour connaître les fonctions à servir, l'émulateur charge le code et attend
 * qu'il déclare ses exports. Le budget par défaut est de **dix secondes**, tous
 * frais compris : démarrage de Node, lecture des fichiers fraîchement compilés,
 * chargement des modules. Sur une machine occupée — un build en cours, un
 * serveur Next à côté — ce budget se dépasse, et l'émulateur démarre alors sans
 * aucune fonction :
 *
 *     Failed to load function definition from source:
 *     Cannot determine backend specification. Timeout after 10000.
 *
 * L'application reçoit ensuite « le serveur n'a pas répondu » sur chaque appel,
 * ce qui ressemble à une panne réseau et n'en est pas une. C'est la deuxième
 * fois que ce message coûte du temps (`DECISIONS.md` D29) ; on lui retire donc
 * sa cause plutôt que de le rediagnostiquer.
 *
 * Le chargement du module lui-même est mesuré à moins de deux secondes : ce
 * délai n'excuse pas un import lourd, il absorbe seulement la variabilité de la
 * machine.
 */
import { spawn } from "node:child_process";

const SECONDES_DECOUVERTE = "60";

const enfant = spawn(
  "npx",
  ["firebase", "emulators:start", "--only", "auth,firestore,storage,functions"],
  {
    stdio: "inherit",
    shell: true,
    env: { ...process.env, FUNCTIONS_DISCOVERY_TIMEOUT: SECONDES_DECOUVERTE },
  },
);

enfant.on("exit", (code) => process.exit(code ?? 0));
