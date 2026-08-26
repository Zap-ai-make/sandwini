import { execFileSync } from "node:child_process";

/**
 * Préparation des tests bout en bout.
 *
 * Deux responsabilités, et la première est la plus importante : **vérifier que
 * l’environnement est bien celui qu’on croit avant de mesurer quoi que ce soit.**
 *
 * La suite s’appuie sur les émulateurs du développeur (elle les réutilise
 * plutôt que d’en démarrer un second jeu). C’est pratique, mais cela veut dire
 * qu’un émulateur incomplet — démarré avant l’ajout des Cloud Functions, ou
 * démarré sans avoir réussi à charger le code — produirait des échecs
 * incompréhensibles. On préfère s’arrêter tout de suite avec la commande à
 * taper. Même leçon que le port dédié du serveur web : un harnais qui mesure ce
 * qui traîne n’est pas un harnais.
 */

const PROJET = "sdi-dev";
const FIRESTORE = "http://127.0.0.1:8181";
const AUTH = "http://127.0.0.1:9399";

const SERVICES = [
  { nom: "Firestore", url: "http://127.0.0.1:8181/" },
  { nom: "Authentication", url: "http://127.0.0.1:9399/" },
  { nom: "Functions", url: "http://127.0.0.1:5301/" },
];

/** Une fonction connue, dont la présence prouve que le code a bien été chargé. */
const FONCTION_TEMOIN = "http://127.0.0.1:5301/sdi-dev/europe-west1/creerGerant";

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

  await repartirDUneBaseVide();

  // Le premier responsable ne peut pas être créé par l’application : la
  // fonction `creerGerant` en exige déjà un. Le script d’amorçage casse la
  // boucle, exactement comme un administrateur le ferait en production.
  execFileSync("node", ["scripts/amorcer.mjs"], { stdio: "inherit" });

  await verifierFonctionsServies();
}

/**
 * Vide les émulateurs avant la première mesure.
 *
 * Sans cela, chaque exécution héritait de la précédente : au bout d’une
 * journée, le sélecteur de boutique proposait cinquante entrées, la collection
 * `motos` en contenait des centaines, et les tests échouaient pour des raisons
 * qui n’avaient rien à voir avec le code qu’ils vérifient. Un harnais qui
 * mesure ce qui traîne n’est pas un harnais — troisième fois que cette phrase
 * sert (D23, D25, D33).
 *
 * Repartir vide a un autre mérite : l’état « aucune boutique », « aucune
 * moto », « aucun compte » devient vérifiable, alors qu’il était devenu
 * inatteignable.
 *
 * **Conséquence assumée :** lancer la suite efface les données que le
 * développeur a saisies à la main dans ses émulateurs. Elles n’ont de toute
 * façon pas d’existence au-delà du redémarrage des émulateurs.
 */
async function repartirDUneBaseVide() {
  const aVider = [
    { nom: "Firestore", url: `${FIRESTORE}/emulator/v1/projects/${PROJET}/databases/(default)/documents` },
    { nom: "Authentication", url: `${AUTH}/emulator/v1/projects/${PROJET}/accounts` },
  ];

  for (const cible of aVider) {
    const reponse = await fetch(cible.url, { method: "DELETE" });
    if (!reponse.ok) {
      throw new Error(
        `Impossible de vider l’émulateur ${cible.nom} (${reponse.status}). ` +
          "La suite refuse de mesurer sur un état inconnu.",
      );
    }
  }
  console.log("Émulateurs remis à zéro : la suite part d’une base vide.");
}

/**
 * Vérifie qu’une fonction est **réellement servie**, pas seulement que le port
 * répond.
 *
 * L’émulateur Functions ouvre son port même quand il n’a chargé aucune
 * fonction : si la découverte du code dépasse son délai, il démarre vide et
 * annonce quand même « All emulators ready ». Chaque appel renvoie alors un 404
 * que l’application traduit par « le serveur n’a pas répondu » — un message de
 * panne réseau pour un problème qui n’a rien de réseau, et une suite de tests
 * qui échoue à quatre endroits, loin de sa cause.
 *
 * Cette requête sert donc deux fois : elle constate que la fonction existe, et
 * elle réveille le runtime. La première invocation démarre un processus Node et
 * charge le SDK Admin ; sans ce réveil, ce coût tombe au hasard dans le premier
 * test qui appelle une fonction. Elle part volontairement sans jeton : le refus
 * pour authentification manquante prouve exactement ce qu’on cherche.
 */
async function verifierFonctionsServies() {
  const debut = Date.now();

  /* Trois essais : la toute première invocation démarre un processus Node, et
     cette montée en charge fait parfois tomber la connexion avant qu'une
     réponse revienne. Un hoquet ne doit pas annuler la suite entière — mais
     trois échecs de suite, si. */
  let reponse: Response | null = null;
  let derniereCause: unknown = null;
  for (let essai = 0; essai < 3 && !reponse; essai += 1) {
    try {
      reponse = await fetch(FONCTION_TEMOIN, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data: {} }),
      });
    } catch (cause) {
      derniereCause = cause;
      await new Promise((suite) => setTimeout(suite, 2000));
    }
  }

  if (!reponse) {
    throw new Error(`L’émulateur Functions n’a pas répondu : ${String(derniereCause)}`);
  }

  if (reponse.status === 404) {
    throw new Error(
      [
        "L’émulateur Functions tourne mais ne sert aucune fonction.",
        "",
        "C’est le symptôme d’une découverte du code qui a dépassé son délai :",
        "  « Cannot determine backend specification. Timeout after 10000 »",
        "",
        "Redémarrez-les avec « npm run emulators » : le script accorde à la",
        "découverte un délai suffisant (cf. scripts/emulateurs.mjs).",
      ].join("\n"),
    );
  }

  console.log(`Fonctions servies, runtime prêt en ${Date.now() - debut} ms.`);
}
