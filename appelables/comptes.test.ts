import type { Auth } from "firebase-admin/auth";
import type { Firestore } from "firebase-admin/firestore";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

/**
 * Les gardes des fonctions appelables (S52).
 *
 * **Pourquoi cette suite existe.** Avant S52, aucune fonction appelable n'avait
 * de test. `creerGerant`, `changerActivationUtilisateur` et `attribuerBoutique`
 * n'étaient exercées que comme décor — `e2e/preparation.ts` s'en sert pour
 * installer un compte, les tests de déclencheurs pour réveiller un runtime.
 * Leur câblage était donc vérifié tous les jours, et leurs **gardes** ne
 * l'étaient nulle part : rien ne prouvait qu'un gérant soit refusé, ni qu'un
 * appel sans jeton n'aboutisse pas. Pour un lot qui ajoute l'effacement d'un
 * compte, c'était la dette à payer d'abord. Elle se referme ici pour tout le
 * monde.
 *
 * **Ce qui se vérifie ici, et nulle part ailleurs.** La règle qui lit une
 * demande de modification est pure et se vérifie en millisecondes
 * (`functions/src/gerants.test.ts`). Ce qui demande un émulateur, c'est tout le
 * reste : que le rôle soit réellement lu dans le jeton, que la révocation ferme
 * réellement une session ouverte, que la question « ce compte a-t-il signé ? »
 * interroge réellement Firestore, et qu'un refus laisse le compte intact.
 *
 * **Le dossier s'appelle `appelables/` et non `fonctions/`.** Il fait pendant à
 * `declencheurs/` — les deux natures de code serveur du produit, chacune avec sa
 * suite. `fonctions/` aurait été à une lettre de `functions/`, le dossier du
 * code lui-même, sur un système de fichiers qui ne distingue pas la casse.
 *
 * On parle aux fonctions comme un navigateur le fait : du HTTP, un jeton
 * d'identité dans l'en-tête, le corps `{ data }` du protocole appelable. Passer
 * par le SDK client aurait ajouté une couche entre la garde et sa preuve.
 */

const PROJET = "sdi-dev";
const AUTH = "127.0.0.1:9399";
const FIRESTORE = "127.0.0.1:8181";
const FONCTIONS = "http://127.0.0.1:5301";
const BASE_APPELABLES = `${FONCTIONS}/${PROJET}/europe-west1`;

process.env.FIREBASE_AUTH_EMULATOR_HOST = AUTH;
process.env.FIRESTORE_EMULATOR_HOST = FIRESTORE;
process.env.GCLOUD_PROJECT = PROJET;

/**
 * Toutes les fonctions appelables — pas seulement celles de ce lot.
 *
 * Une fonction de plus dans `functions/src` est une ligne de plus ici, comme
 * dans `e2e/preparation.ts` : l'oubli se paie par un échec au milieu d'un test,
 * loin de sa cause.
 */
const APPELABLES = [
  "creerGerant",
  "changerActivationUtilisateur",
  "attribuerBoutique",
  "modifierGerant",
  "supprimerGerant",
] as const;

/**
 * Le suffixe des comptes de ce harnais.
 *
 * Il sert à faire le propre **sans toucher au décor du développeur** : les
 * émulateurs sont ceux de sa machine, et ses comptes à lui n'ont rien à faire
 * dans le ménage d'une suite de tests. Un passage interrompu se nettoie au
 * passage suivant, puisque le ménage se fait par suffixe et non par liste tenue
 * en mémoire.
 */
const SUFFIXE = "@s52.test";
const MOT_DE_PASSE = "temoin-sdi-2026";

/** La vente qui sert de signature : un seul document, à un identifiant connu. */
const VENTE_TEMOIN = "s52-temoin-signature";

let auth: Auth;
let base: Firestore;
let rang = 0;

/** Le responsable qui appelle. Épargné par le ménage, il vit toute la suite. */
let patron = { uid: "", email: "", jeton: "" };

beforeAll(async () => {
  await exigerEmulateurs();

  const { getApps, initializeApp } = await import("firebase-admin/app");
  const { getAuth } = await import("firebase-admin/auth");
  const { getFirestore } = await import("firebase-admin/firestore");
  if (getApps().length === 0) initializeApp({ projectId: PROJET });
  auth = getAuth();
  base = getFirestore();

  await faireLePropre();

  const compte = await creerCompte("responsable");
  patron = { uid: compte.uid, email: compte.email, jeton: await seConnecter(compte.email) };

  await reveillerLesRuntimes();
});

beforeEach(async () => {
  await faireLePropre();
});

afterAll(async () => {
  await faireLePropre();
  if (patron.uid) {
    await auth.deleteUser(patron.uid).catch(() => null);
    await base.doc(`users/${patron.uid}`).delete();
  }
});

/* --- Le harnais ----------------------------------------------------------- */

async function exigerEmulateurs(): Promise<void> {
  const services = [
    { nom: "Authentication", url: `http://${AUTH}/` },
    { nom: "Firestore", url: `http://${FIRESTORE}/` },
    { nom: "Functions", url: `${FONCTIONS}/` },
  ];
  const absents: string[] = [];
  for (const service of services) {
    try {
      await fetch(service.url);
    } catch {
      absents.push(service.nom);
    }
  }
  if (absents.length > 0) {
    throw new Error(
      `Émulateur(s) injoignable(s) : ${absents.join(", ")}.\n` +
        "Démarrez-les avec « npm run emulators » dans un autre terminal.",
    );
  }
}

/**
 * Réveille un runtime par fonction, et vérifie au passage qu'elle est servie.
 *
 * L'émulateur démarre un processus **par fonction**, à la première invocation
 * (D43, D49) : sans ce réveil, le premier test de chaque fonction paie ce
 * démarrage et accuse le code. Et l'émulateur ouvre son port même quand la
 * découverte du code a échoué — il rend alors 404 sur tout, ce que l'application
 * traduit par « le serveur n'a pas répondu » (D29).
 *
 * L'appel se fait **sans jeton** : il tombe sur la première garde, ce qui
 * réveille le runtime sans rien écrire.
 */
async function reveillerLesRuntimes(): Promise<void> {
  const debut = Date.now();
  for (const nom of APPELABLES) {
    const reponse = await fetch(`${BASE_APPELABLES}/${nom}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ data: {} }),
    });
    if (reponse.status === 404) {
      throw new Error(
        [
          `L'émulateur Functions ne sert pas « ${nom} ».`,
          "",
          "Soit le code n'est pas compilé — « npm run build:functions » —,",
          "soit les émulateurs ont démarré avant qu'il existe. Redémarrez-les",
          "avec « npm run emulators » : le script accorde à la découverte un",
          "budget réaliste (cf. scripts/emulateurs.mjs).",
        ].join("\n"),
      );
    }
  }
  console.log(`${APPELABLES.length} runtimes réveillés en ${Date.now() - debut} ms.`);
}

/**
 * Efface les comptes du harnais, et eux seuls.
 *
 * Le responsable de la suite est épargné : il est créé une fois et n'est jamais
 * modifié, donc le recréer à chaque test ne prouverait rien de plus.
 */
async function faireLePropre(): Promise<void> {
  const comptes = await auth.listUsers(1000);
  const miens = comptes.users.filter(
    (compte) => (compte.email ?? "").endsWith(SUFFIXE) && compte.uid !== patron.uid,
  );
  for (const compte of miens) {
    await auth.deleteUser(compte.uid);
    await base.doc(`users/${compte.uid}`).delete();
  }
  await base.doc(`ventesMotos/${VENTE_TEMOIN}`).delete();
}

async function creerCompte(
  role: "responsable" | "gerant",
  motDePasse = MOT_DE_PASSE,
): Promise<{ uid: string; email: string; nom: string }> {
  rang += 1;
  const email = `temoin-${rang}${SUFFIXE}`;
  const nom = `Témoin ${rang}`;
  const boutiqueId = role === "gerant" ? "PTG" : null;

  const compte = await auth.createUser({ email, password: motDePasse, displayName: nom });
  await auth.setCustomUserClaims(compte.uid, { role, boutiqueId });
  /* Le miroir, écrit par le SDK Admin comme le font les fonctions elles-mêmes :
     les règles Firestore l'interdisent à tout client. */
  await base.doc(`users/${compte.uid}`).set({ nom, email, role, boutiqueId, actif: true });

  return { uid: compte.uid, email, nom };
}

/** Un jeton d'identité, obtenu comme le ferait un navigateur qui se connecte. */
async function seConnecter(email: string, motDePasse = MOT_DE_PASSE): Promise<string> {
  const reponse = await fetch(
    `http://${AUTH}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=cle-emulateur`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password: motDePasse, returnSecureToken: true }),
    },
  );
  const corps = (await reponse.json()) as { idToken?: string; error?: { message?: string } };
  if (!corps.idToken) {
    throw new Error(`Connexion impossible pour ${email} : ${corps.error?.message ?? "sans motif"}`);
  }
  return corps.idToken;
}

type Reponse = { refus?: string; message?: string; resultat?: Record<string, unknown> };

/** Le protocole appelable, à la main : `{ data }` en entrée, `{ result }` ou `{ error }`. */
async function appeler(nom: string, data: unknown, jeton?: string): Promise<Reponse> {
  const reponse = await fetch(`${BASE_APPELABLES}/${nom}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(jeton ? { Authorization: `Bearer ${jeton}` } : {}),
    },
    body: JSON.stringify({ data }),
  });
  const corps = (await reponse.json().catch(() => ({}))) as {
    error?: { status?: string; message?: string };
    result?: Record<string, unknown>;
  };
  if (corps.error) {
    return { refus: corps.error.status ?? "SANS_STATUT", message: corps.error.message };
  }
  return { resultat: corps.result };
}

/**
 * Le plancher de validité des jetons de ce compte, en millisecondes.
 *
 * C'est `tokensValidAfterTime` : `revokeRefreshTokens` l'avance à l'instant de
 * l'appel, et tout jeton émis avant devient invalide. Une révocation se prouve
 * donc en le voyant avancer.
 *
 * **Pourquoi pas un témoin plus direct, et c'est une mesure, pas une
 * supposition.** Deux chemins plus parlants ont été essayés contre l'émulateur
 * Auth, et aucun ne tient :
 *
 * - `verifyIdToken(jeton, true)` accepte encore le jeton, parce que son `iat`
 *   est tronqué à la seconde comme le plancher : émis dans la même seconde que
 *   la révocation, il n'est pas *antérieur* à elle ;
 * - le point de rafraîchissement (`securetoken.googleapis.com/v1/token`) rend
 *   un **jeton neuf** après révocation. L'émulateur n'invalide pas les jetons
 *   de rafraîchissement — mesuré à la sonde, en octobre 2026.
 *
 * Le plancher reste donc le seul témoin fiable ici, à une condition : franchir
 * un tic de seconde avant l'appel, sinon la troncature masque l'avance.
 */
async function validiteDepuis(uid: string): Promise<number> {
  const plancher = (await auth.getUser(uid)).tokensValidAfterTime;
  /* Facultatif dans le type, jamais absent en pratique : il est posé à la
     création du compte. Son absence serait donc un symptôme, pas un cas à
     traiter — on la fait échouer plutôt que de la lire comme un zéro, qui
     rendrait vraie pour rien l'égalité attendue par le test du nom. */
  if (!plancher) throw new Error(`Le compte ${uid} n’a pas de plancher de validité.`);
  return Date.parse(plancher);
}

/**
 * Attend le prochain tic de seconde.
 *
 * Moins d'une seconde par test, et c'est le prix de la troncature décrite
 * au-dessus : sans ce passage de seconde, une révocation réelle se lirait comme
 * une absence de révocation — et le test qui vérifie qu'un nom ne révoque
 * **rien** passerait pour une mauvaise raison.
 */
async function prochaineSeconde(): Promise<void> {
  const seconde = Math.floor(Date.now() / 1000);
  while (Math.floor(Date.now() / 1000) === seconde) {
    await new Promise((suite) => setTimeout(suite, 25));
  }
}

/* --- Les gardes communes aux cinq fonctions -------------------------------- */

/**
 * Les deux refus que **toutes** portent, vérifiés sur toutes.
 *
 * C'est le cœur de la dette que ce lot referme. Ces deux lignes sont ce qui
 * sépare « le rôle est lu quelque part » de « le rôle est lu, par cette
 * fonction-là, et il refuse ». Écrites une fois par fonction, elles auraient
 * été écrites pour les deux nouvelles et oubliées pour les trois anciennes.
 */
describe("aucune fonction appelable ne s’ouvre à un gérant ni à un inconnu", () => {
  for (const nom of APPELABLES) {
    it(`${nom} refuse un appel sans jeton`, async () => {
      const reponse = await appeler(nom, { uid: "peu-importe", nom: "Essai" });
      expect(reponse.refus).toBe("UNAUTHENTICATED");
    });

    it(`${nom} refuse un gérant`, async () => {
      const gerant = await creerCompte("gerant");
      const jeton = await seConnecter(gerant.email);
      const reponse = await appeler(nom, { uid: gerant.uid, nom: "Essai" }, jeton);
      expect(reponse.refus).toBe("PERMISSION_DENIED");
    });
  }
});

/* --- modifierGerant ------------------------------------------------------- */

describe("modifierGerant", () => {
  it("corrige le nom affiché, dans le compte et dans le miroir", async () => {
    const gerant = await creerCompte("gerant");

    const reponse = await appeler(
      "modifierGerant",
      { uid: gerant.uid, nom: "  Issaka Ouédraogo  " },
      patron.jeton,
    );

    expect(reponse.refus).toBeUndefined();
    expect((await auth.getUser(gerant.uid)).displayName).toBe("Issaka Ouédraogo");
    expect((await base.doc(`users/${gerant.uid}`).get()).get("nom")).toBe("Issaka Ouédraogo");
  });

  /**
   * Un nom corrigé ne déconnecte personne.
   *
   * Il ne change aucun droit. Couper la session de quelqu'un pour une faute de
   * frappe dans son nom serait une punition sans motif — et au comptoir, elle
   * tomberait au milieu d'une vente.
   */
  it("ne ferme aucune session pour un simple nom", async () => {
    const gerant = await creerCompte("gerant");
    const plancher = await validiteDepuis(gerant.uid);
    await prochaineSeconde();

    const reponse = await appeler("modifierGerant", { uid: gerant.uid, nom: "Issaka" }, patron.jeton);

    expect(reponse.resultat?.sessionsFermees).toBe(false);
    /* Le tic de seconde est franchi : si la fonction révoquait, le plancher
       aurait avancé. L'égalité est donc une vraie absence de révocation. */
    expect(await validiteDepuis(gerant.uid)).toBe(plancher);
  });

  it("change l’adresse de connexion, et ferme les sessions ouvertes", async () => {
    const gerant = await creerCompte("gerant");
    const nouvelle = `deplace-${Date.now()}${SUFFIXE}`;
    const plancher = await validiteDepuis(gerant.uid);
    await prochaineSeconde();

    const reponse = await appeler(
      "modifierGerant",
      { uid: gerant.uid, email: nouvelle.toUpperCase() },
      patron.jeton,
    );

    expect(reponse.resultat?.sessionsFermees).toBe(true);
    /* En minuscules : une adresse de connexion ne dépend pas de la casse de
       frappe, et le miroir doit dire la même chose que le compte. */
    expect((await auth.getUser(gerant.uid)).email).toBe(nouvelle);
    expect((await base.doc(`users/${gerant.uid}`).get()).get("email")).toBe(nouvelle);
    expect(await validiteDepuis(gerant.uid)).toBeGreaterThan(plancher);
    /* Et la nouvelle adresse ouvre bien une session. */
    await expect(seConnecter(nouvelle)).resolves.toBeTruthy();
  });

  it("repose le mot de passe, ferme les sessions, et le nouveau ouvre", async () => {
    const gerant = await creerCompte("gerant");
    const plancher = await validiteDepuis(gerant.uid);
    await prochaineSeconde();

    const reponse = await appeler(
      "modifierGerant",
      { uid: gerant.uid, motDePasse: "nouveau-mot-2026" },
      patron.jeton,
    );

    expect(reponse.resultat?.sessionsFermees).toBe(true);
    expect(await validiteDepuis(gerant.uid)).toBeGreaterThan(plancher);
    await expect(seConnecter(gerant.email, "nouveau-mot-2026")).resolves.toBeTruthy();
  });

  /** Le mot de passe ne va **jamais** dans le miroir : l'interface le lit. */
  it("n’écrit pas le mot de passe dans le document du compte", async () => {
    const gerant = await creerCompte("gerant");
    await appeler("modifierGerant", { uid: gerant.uid, motDePasse: "nouveau-mot-2026" }, patron.jeton);

    const miroir = (await base.doc(`users/${gerant.uid}`).get()).data() ?? {};
    expect(Object.keys(miroir)).not.toContain("motDePasse");
    expect(JSON.stringify(miroir)).not.toContain("nouveau-mot-2026");
  });

  it("refuse une adresse déjà prise par un autre compte", async () => {
    const premier = await creerCompte("gerant");
    const second = await creerCompte("gerant");

    const reponse = await appeler(
      "modifierGerant",
      { uid: second.uid, email: premier.email },
      patron.jeton,
    );

    expect(reponse.refus).toBe("ALREADY_EXISTS");
    /* Le compte visé n'a pas bougé : un refus ne laisse pas la moitié du geste. */
    expect((await auth.getUser(second.uid)).email).toBe(second.email);
  });

  it("refuse une demande qui ne demande rien", async () => {
    const gerant = await creerCompte("gerant");
    const reponse = await appeler("modifierGerant", { uid: gerant.uid }, patron.jeton);
    expect(reponse.refus).toBe("INVALID_ARGUMENT");
  });

  it("refuse un identifiant inconnu", async () => {
    const reponse = await appeler(
      "modifierGerant",
      { uid: "compte-qui-n-existe-pas", nom: "Essai" },
      patron.jeton,
    );
    expect(reponse.refus).toBe("NOT_FOUND");
  });

  it("refuse de toucher à un compte responsable", async () => {
    const autre = await creerCompte("responsable");
    const reponse = await appeler("modifierGerant", { uid: autre.uid, nom: "Essai" }, patron.jeton);
    expect(reponse.refus).toBe("PERMISSION_DENIED");
  });

  it("refuse que le responsable se modifie lui-même", async () => {
    const reponse = await appeler("modifierGerant", { uid: patron.uid, nom: "Essai" }, patron.jeton);
    expect(reponse.refus).toBe("FAILED_PRECONDITION");
  });
});

/* --- supprimerGerant ------------------------------------------------------ */

describe("supprimerGerant", () => {
  it("efface un compte qui n’a rien signé — compte et miroir", async () => {
    const gerant = await creerCompte("gerant");

    const reponse = await appeler("supprimerGerant", { uid: gerant.uid }, patron.jeton);

    expect(reponse.refus).toBeUndefined();
    expect(await auth.getUser(gerant.uid).catch(() => null)).toBeNull();
    expect((await base.doc(`users/${gerant.uid}`).get()).exists).toBe(false);
  });

  /**
   * La garde qui porte l'arbitrage du commanditaire : « effacer seulement si
   * rien n'a été signé ».
   *
   * Une seule vente suffit, et le refus doit laisser le compte **intact** — un
   * effacement à moitié fait serait pire que pas d'effacement du tout.
   */
  it("refuse un compte qui a enregistré une vente, et le laisse intact", async () => {
    const gerant = await creerCompte("gerant");
    await base.doc(`ventesMotos/${VENTE_TEMOIN}`).set({
      boutiqueId: "PTG",
      createdBy: gerant.uid,
      createdByName: gerant.nom,
    });

    const reponse = await appeler("supprimerGerant", { uid: gerant.uid }, patron.jeton);

    expect(reponse.refus).toBe("FAILED_PRECONDITION");
    /* La phrase dit quoi faire à la place : c'est elle que l'écran affiche. */
    expect(reponse.message).toMatch(/désactivez/i);
    expect(await auth.getUser(gerant.uid).catch(() => null)).not.toBeNull();
    expect((await base.doc(`users/${gerant.uid}`).get()).exists).toBe(true);
  });

  /**
   * Les référentiels ne sont pas des signatures, et c'est un choix.
   *
   * Avoir déclaré une marque n'engage ni argent ni stock. Les compter rendrait
   * quasiment tout compte indéboulonnable, et transformerait l'arbitrage du
   * commanditaire en interdiction pure.
   */
  it("efface un compte qui n’a créé qu’une entrée de référentiel", async () => {
    const gerant = await creerCompte("gerant");
    const marque = base.collection("marques").doc("s52-temoin-marque");
    await marque.set({ nom: "Témoin S52", actif: true, createdBy: gerant.uid });

    try {
      const reponse = await appeler("supprimerGerant", { uid: gerant.uid }, patron.jeton);
      expect(reponse.refus).toBeUndefined();
      expect(await auth.getUser(gerant.uid).catch(() => null)).toBeNull();
    } finally {
      await marque.delete();
    }
  });

  it("refuse un identifiant inconnu", async () => {
    const reponse = await appeler(
      "supprimerGerant",
      { uid: "compte-qui-n-existe-pas" },
      patron.jeton,
    );
    expect(reponse.refus).toBe("NOT_FOUND");
  });

  it("refuse d’effacer un compte responsable", async () => {
    const autre = await creerCompte("responsable");
    const reponse = await appeler("supprimerGerant", { uid: autre.uid }, patron.jeton);
    expect(reponse.refus).toBe("PERMISSION_DENIED");
    expect(await auth.getUser(autre.uid).catch(() => null)).not.toBeNull();
  });

  it("refuse que le responsable s’efface lui-même", async () => {
    const reponse = await appeler("supprimerGerant", { uid: patron.uid }, patron.jeton);
    expect(reponse.refus).toBe("FAILED_PRECONDITION");
    expect(await auth.getUser(patron.uid).catch(() => null)).not.toBeNull();
  });

  /**
   * Le miroir orphelin s'achève au second essai.
   *
   * La fonction efface le compte d'authentification d'abord, le miroir ensuite :
   * dans l'autre ordre, un échec à mi-chemin laisserait un compte capable de se
   * connecter et absent de la liste. Reste donc le cas où le second effacement
   * échoue — une ligne qu'on ne pourrait plus ni modifier ni effacer. Cette
   * situation se reproduit ici en effaçant le compte à la main.
   */
  it("achève un miroir resté seul après l’effacement du compte", async () => {
    const gerant = await creerCompte("gerant");
    await auth.deleteUser(gerant.uid);

    const reponse = await appeler("supprimerGerant", { uid: gerant.uid }, patron.jeton);

    expect(reponse.refus).toBeUndefined();
    expect((await base.doc(`users/${gerant.uid}`).get()).exists).toBe(false);
  });
});

/* --- Ce que les anciennes fonctions n’avaient jamais prouvé ---------------- */

/**
 * Désactiver ferme les sessions en cours, et pas seulement la prochaine
 * connexion.
 *
 * C'est écrit dans `changerActivationUtilisateur` depuis S2, avec la bonne
 * raison — sans révocation, un gérant désactivé continuerait de travailler
 * jusqu'à l'expiration de son jeton, soit jusqu'à une heure. Rien ne le
 * prouvait.
 */
describe("changerActivationUtilisateur", () => {
  it("coupe l’accès et ferme la session ouverte", async () => {
    const gerant = await creerCompte("gerant");
    const plancher = await validiteDepuis(gerant.uid);
    await prochaineSeconde();

    const reponse = await appeler(
      "changerActivationUtilisateur",
      { uid: gerant.uid, actif: false },
      patron.jeton,
    );

    expect(reponse.refus).toBeUndefined();
    expect((await auth.getUser(gerant.uid)).disabled).toBe(true);
    expect((await base.doc(`users/${gerant.uid}`).get()).get("actif")).toBe(false);
    expect(await validiteDepuis(gerant.uid)).toBeGreaterThan(plancher);
  });

  it("réactive sans rouvrir la session fermée", async () => {
    const gerant = await creerCompte("gerant");
    const plancher = await validiteDepuis(gerant.uid);
    await prochaineSeconde();
    await appeler("changerActivationUtilisateur", { uid: gerant.uid, actif: false }, patron.jeton);

    await appeler("changerActivationUtilisateur", { uid: gerant.uid, actif: true }, patron.jeton);

    expect((await auth.getUser(gerant.uid)).disabled).toBe(false);
    /* Le compte remarche, les anciennes sessions non : la réactivation ne
       ramène pas le plancher en arrière, donc elle ne ressuscite rien. */
    expect(await validiteDepuis(gerant.uid)).toBeGreaterThan(plancher);
    await expect(seConnecter(gerant.email)).resolves.toBeTruthy();
  });

  it("refuse que le responsable se désactive lui-même", async () => {
    const reponse = await appeler(
      "changerActivationUtilisateur",
      { uid: patron.uid, actif: false },
      patron.jeton,
    );
    expect(reponse.refus).toBe("FAILED_PRECONDITION");
    expect((await auth.getUser(patron.uid)).disabled).toBe(false);
  });

  it("refuse de désactiver un compte responsable", async () => {
    const autre = await creerCompte("responsable");
    const reponse = await appeler(
      "changerActivationUtilisateur",
      { uid: autre.uid, actif: false },
      patron.jeton,
    );
    expect(reponse.refus).toBe("PERMISSION_DENIED");
  });
});

describe("creerGerant", () => {
  it("refuse un mot de passe trop court, et ne laisse aucun compte derrière", async () => {
    rang += 1;
    const email = `refuse-${rang}${SUFFIXE}`;

    const reponse = await appeler(
      "creerGerant",
      { nom: "Essai", email, motDePasse: "court" },
      patron.jeton,
    );

    expect(reponse.refus).toBe("INVALID_ARGUMENT");
    expect(await auth.getUserByEmail(email).catch(() => null)).toBeNull();
  });

  it("refuse une boutique qui n’existe pas", async () => {
    rang += 1;
    const email = `refuse-${rang}${SUFFIXE}`;

    const reponse = await appeler(
      "creerGerant",
      { nom: "Essai", email, motDePasse: MOT_DE_PASSE, boutiqueId: "ZZZ" },
      patron.jeton,
    );

    expect(reponse.refus).toBe("NOT_FOUND");
    /* Et surtout : aucun compte créé. La boutique est vérifiée **avant**
       l'écriture, sinon un refus laisserait un compte sans miroir. */
    expect(await auth.getUserByEmail(email).catch(() => null)).toBeNull();
  });
});

describe("attribuerBoutique", () => {
  it("refuse de rattacher un responsable à une boutique", async () => {
    const autre = await creerCompte("responsable");
    const reponse = await appeler(
      "attribuerBoutique",
      { uid: autre.uid, boutiqueId: null },
      patron.jeton,
    );
    expect(reponse.refus).toBe("FAILED_PRECONDITION");
  });

  it("refuse un identifiant inconnu", async () => {
    const reponse = await appeler(
      "attribuerBoutique",
      { uid: "compte-qui-n-existe-pas", boutiqueId: null },
      patron.jeton,
    );
    expect(reponse.refus).toBe("NOT_FOUND");
  });
});
