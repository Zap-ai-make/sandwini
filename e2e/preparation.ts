import { execFileSync } from "node:child_process";

/**
 * Préparation des tests bout en bout.
 *
 * Deux responsabilités, et la première est la plus importante : **vérifier que
 * l’environnement est bien celui qu’on croit avant de mesurer quoi que ce soit.**
 *
 * La suite s’appuie sur les émulateurs du développeur (elle les réutilise
 * plutôt que d’en démarrer un second jeu). C’est pratique, mais cela veut dire
 * qu’un émulateur incomplet — démarré avant l’ajout des Cloud Functions, par
 * exemple — produirait des échecs incompréhensibles. On préfère s’arrêter tout
 * de suite avec la commande à taper. Même leçon que le port dédié du serveur
 * web : un harnais qui mesure ce qui traîne n’est pas un harnais.
 */

const SERVICES = [
  { nom: "Firestore", url: "http://127.0.0.1:8181/" },
  { nom: "Authentication", url: "http://127.0.0.1:9399/" },
  { nom: "Functions", url: "http://127.0.0.1:5301/" },
];

async function joignable(url: string): Promise<boolean> {
  try {
    await fetch(url);
    return true;
  } catch {
    return false;
  }
}

export default async function preparer() {
  const absents: string[] = [];
  for (const service of SERVICES) {
    if (!(await joignable(service.url))) absents.push(service.nom);
  }

  if (absents.length > 0) {
    throw new Error(
      `Émulateur(s) injoignable(s) : ${absents.join(", ")}.\n\n` +
        "Lancez « npm run emulators » dans un autre terminal.\n" +
        "Si les émulateurs tournent déjà, redémarrez-les : le script inclut désormais\n" +
        "les Cloud Functions, et une instance démarrée avant ne les sert pas.",
    );
  }

  // Le premier responsable ne peut pas être créé par l’application : la
  // fonction `creerGerant` en exige déjà un. Le script d’amorçage casse la
  // boucle, exactement comme un administrateur le ferait en production.
  execFileSync("node", ["scripts/amorcer.mjs"], { stdio: "inherit" });

  await prechaufferFonctions();
}

/**
 * Réveille le runtime des Cloud Functions avant que les tests commencent.
 *
 * La première invocation dans l’émulateur démarre un processus Node et charge
 * le SDK Admin : mesuré à près de vingt secondes sur cette machine, contre
 * quelques dizaines de millisecondes ensuite. Sans ce réveil, ce coût tombe au
 * hasard dans le premier test qui appelle une fonction et le fait échouer sur
 * un délai — un test qui mesure la lenteur du démarrage plutôt que le produit.
 *
 * L’appel est volontairement sans jeton : il est refusé, ce qui suffit à
 * charger le runtime.
 */
async function prechaufferFonctions() {
  const debut = Date.now();
  try {
    await fetch("http://127.0.0.1:5301/sdi-dev/europe-west1/creerGerant", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ data: {} }),
    });
    console.log(`Runtime des fonctions prêt en ${Date.now() - debut} ms.`);
  } catch {
    // Sans importance : le contrôle ci-dessus a déjà vérifié la disponibilité.
  }
}
