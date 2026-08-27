import type { Firestore } from "firebase-admin/firestore";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

/**
 * Le câblage de la réconciliation des numéros (S7).
 *
 * La *règle* qui décide qui garde son numéro est vérifiée ailleurs, sans
 * émulateur et en millisecondes (`functions/src/numerotation.test.ts`). Ici on
 * vérifie ce que cette règle ne peut pas prouver toute seule : que le
 * déclencheur est branché sur la bonne collection, qu’il retrouve les pièces
 * concurrentes, et qu’il écrit le nouveau numéro là où le reçu ira le lire.
 *
 * Les documents écrits ne portent que ce que le déclencheur lit — `boutiqueId`,
 * `numero`, `numeroInitial`, `createdAt`. La forme complète d’une vente est
 * l’affaire de S8 ; l’anticiper ici figerait un modèle qui n’est pas décidé.
 */

const PROJET = "sdi-dev";
const FIRESTORE = "127.0.0.1:8181";
const FONCTIONS = "http://127.0.0.1:5301";
const TEMOIN = `${FONCTIONS}/${PROJET}/europe-west1/creerGerant`;

process.env.FIRESTORE_EMULATOR_HOST = FIRESTORE;
process.env.GCLOUD_PROJECT = PROJET;

const BOUTIQUE = "PTG";

let base: Firestore;
let Horodatage: typeof import("firebase-admin/firestore").Timestamp;

beforeAll(async () => {
  await exigerEmulateurs();

  const { getApps, initializeApp } = await import("firebase-admin/app");
  const { getFirestore, Timestamp } = await import("firebase-admin/firestore");
  if (getApps().length === 0) initializeApp({ projectId: PROJET });
  base = getFirestore();
  Horodatage = Timestamp;

  await reveillerLeDeclencheur();
});

beforeEach(async () => {
  await viderLesVentes();
});

afterAll(async () => {
  await viderLesVentes();
});

/**
 * S’arrête tout de suite si l’environnement n’est pas celui qu’on croit.
 *
 * Le port ouvert ne prouve rien : l’émulateur Functions démarre et répond même
 * quand la découverte du code a échoué, et il ne sert alors **aucune** fonction
 * — ni appelable, ni déclencheur (`DECISIONS.md` D33). Un test qui attend une
 * réaction qui ne viendra jamais échoue au bout de quarante secondes en
 * accusant le code. On interroge donc une fonction témoin : si elle est servie,
 * le module s’est chargé, et le déclencheur est enregistré avec elle.
 */
async function exigerEmulateurs(): Promise<void> {
  const injoignable = async (url: string) => {
    try {
      await fetch(url);
      return false;
    } catch {
      return true;
    }
  };

  if (await injoignable(`http://${FIRESTORE}/`)) {
    throw new Error(
      `L’émulateur Firestore ne répond pas sur ${FIRESTORE}.\n` +
        "Démarrez-les avec « npm run emulators ».",
    );
  }
  if (await injoignable(`${FONCTIONS}/`)) {
    throw new Error(
      `L’émulateur Functions ne répond pas sur ${FONCTIONS}.\n` +
        "Démarrez-les avec « npm run emulators ».",
    );
  }

  const temoin = await fetch(TEMOIN, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ data: {} }),
  });
  if (temoin.status === 404) {
    throw new Error(
      [
        "L’émulateur Functions tourne mais ne sert aucune fonction.",
        "",
        "C’est le symptôme d’une découverte du code qui a dépassé son délai.",
        "Redémarrez-les avec « npm run emulators » : le script lui accorde un",
        "budget réaliste (cf. scripts/emulateurs.mjs).",
      ].join("\n"),
    );
  }
}

/**
 * Provoque une vraie collision avant la première mesure, et attend le verdict.
 *
 * L'émulateur démarre un runtime **par fonction**, à la première invocation.
 * Pour une fonction appelable, on paie ce démarrage en réveillant l'URL ; un
 * déclencheur n'a pas d'URL, alors on le réveille de la seule manière qui
 * existe — en écrivant ce à quoi il réagit. Sans cela, le premier test de la
 * suite attendait quarante secondes une réaction qui arrivait juste après, et
 * accusait le code d'un défaut qui n'était que de la mise en route (même leçon
 * que `DECISIONS.md` D43).
 *
 * Ce réveil vérifie aussi le câblage : s'il échoue, aucun des tests suivants
 * n'aurait de sens, et le message dit quoi regarder.
 */
async function reveillerLeDeclencheur(): Promise<void> {
  const debut = Date.now();
  await viderLesVentes();
  const temoin = "ZZZ-0000-0001";
  await ecrirePiece(temoin, new Date("2020-01-01T00:00:00Z"), "ZZZ");
  const second = await ecrirePiece(temoin, new Date("2020-01-01T00:01:00Z"), "ZZZ");
  try {
    await attendreNumero(second, `${temoin}-B`, 90_000);
  } catch (cause) {
    throw new Error(
      [
        "Le déclencheur de réconciliation n'a pas réagi.",
        "",
        "Vérifiez la ligne « functions[europe-west1-reconcilierNumeroVente]:",
        "firestore function initialized » au démarrage des émulateurs, puis le",
        "journal de l'émulateur : une erreur dans la fonction y est visible.",
        "",
        String(cause),
      ].join("\n"),
    );
  }
  await viderLesVentes();
  console.log(`Déclencheur de numérotation réveillé en ${Date.now() - debut} ms.`);
}

async function viderLesVentes(): Promise<void> {
  const tout = await base.collection("ventesMotos").get();
  await Promise.all(tout.docs.map((document) => document.ref.delete()));
}

/** Écrit une pièce comme le ferait un appareil : `numero` et `numeroInitial` identiques. */
async function ecrirePiece(numero: string, recueA: Date, boutiqueId = BOUTIQUE): Promise<string> {
  const reference = base.collection("ventesMotos").doc();
  await reference.set({
    boutiqueId,
    numero,
    numeroInitial: numero,
    createdAt: Horodatage.fromDate(recueA),
  });
  return reference.id;
}

async function lireNumero(id: string): Promise<string> {
  const instantane = await base.doc(`ventesMotos/${id}`).get();
  return instantane.get("numero") ?? "";
}

const pause = (ms: number) => new Promise((suite) => setTimeout(suite, ms));

/** Attend que le déclencheur ait tranché, ou dit clairement ce qu’il a fait à la place. */
async function attendreNumero(id: string, attendu: string, plafondMs = 25_000): Promise<void> {
  const debut = Date.now();
  let vu = "";
  while (Date.now() - debut < plafondMs) {
    vu = await lireNumero(id);
    if (vu === attendu) return;
    await pause(200);
  }
  throw new Error(
    `La pièce ${id} porte « ${vu} » après ${plafondMs} ms ; on attendait « ${attendu} ».`,
  );
}

describe("réconciliation des numéros en double", () => {
  it("laisse son numéro à la pièce arrivée la première, suffixe la seconde", async () => {
    const premiere = await ecrirePiece("PTG-2608-0042", new Date("2026-08-25T09:00:00Z"));
    const seconde = await ecrirePiece("PTG-2608-0042", new Date("2026-08-25T09:05:00Z"));

    await attendreNumero(seconde, "PTG-2608-0042-B");
    expect(await lireNumero(premiere)).toBe("PTG-2608-0042");
  });

  it("continue en -C quand une troisième arrive après coup", async () => {
    const premiere = await ecrirePiece("PTG-2608-0042", new Date("2026-08-25T09:00:00Z"));
    const seconde = await ecrirePiece("PTG-2608-0042", new Date("2026-08-25T09:05:00Z"));
    await attendreNumero(seconde, "PTG-2608-0042-B");

    /* Le point qui justifie `numeroInitial` : la seconde ne porte plus
       « PTG-2608-0042 ». Un rapprochement fait sur `numero` ne la retrouverait
       pas, et la troisième réclamerait le -B déjà pris. */
    const troisieme = await ecrirePiece("PTG-2608-0042", new Date("2026-08-25T09:10:00Z"));
    await attendreNumero(troisieme, "PTG-2608-0042-C");

    expect(await lireNumero(premiere)).toBe("PTG-2608-0042");
    expect(await lireNumero(seconde)).toBe("PTG-2608-0042-B");
  });

  it("ne touche pas à une pièce dont le numéro est unique", async () => {
    const seule = await ecrirePiece("PTG-2608-0100", new Date("2026-08-25T09:00:00Z"));

    /* Une collision sert de repère : quand elle est tranchée, le déclencheur a
       traité des écritures postérieures à celle de la pièce isolée. On laisse
       ensuite une seconde de battement avant de conclure. */
    await ecrirePiece("PTG-2608-0200", new Date("2026-08-25T09:01:00Z"));
    const doublon = await ecrirePiece("PTG-2608-0200", new Date("2026-08-25T09:02:00Z"));
    await attendreNumero(doublon, "PTG-2608-0200-B");
    await pause(1000);

    expect(await lireNumero(seule)).toBe("PTG-2608-0100");
  });

  it("ne confond pas deux boutiques qui en sont au même compteur", async () => {
    const ptg = await ecrirePiece("PTG-2608-0042", new Date("2026-08-25T09:00:00Z"));
    const kdg = await ecrirePiece("KDG-2608-0042", new Date("2026-08-25T09:05:00Z"), "KDG");

    const doublon = await ecrirePiece("PTG-2608-0042", new Date("2026-08-25T09:10:00Z"));
    await attendreNumero(doublon, "PTG-2608-0042-B");

    expect(await lireNumero(ptg)).toBe("PTG-2608-0042");
    expect(await lireNumero(kdg)).toBe("KDG-2608-0042");
  });

  it("tranche aussi quand les deux pièces arrivent coup sur coup", async () => {
    const { FieldValue } = await import("firebase-admin/firestore");
    const ecrire = async () => {
      const reference = base.collection("ventesMotos").doc();
      await reference.set({
        boutiqueId: BOUTIQUE,
        numero: "PTG-2608-0500",
        numeroInitial: "PTG-2608-0500",
        createdAt: FieldValue.serverTimestamp(),
      });
      return reference.id;
    };

    const une = await ecrire();
    const autre = await ecrire();

    /* L’ordre est ici celui du serveur, que le test ne choisit pas. On vérifie
       donc la propriété qui compte : exactement une des deux est renumérotée. */
    const debut = Date.now();
    let numeros: string[] = [];
    while (Date.now() - debut < 25_000) {
      numeros = [await lireNumero(une), await lireNumero(autre)];
      if (numeros.some((numero) => numero.endsWith("-B"))) break;
      await pause(200);
    }

    expect([...numeros].sort()).toEqual(["PTG-2608-0500", "PTG-2608-0500-B"]);
  });
});
