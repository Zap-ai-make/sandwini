import type { Firestore } from "firebase-admin/firestore";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

/**
 * Le figement du coût et le calcul de la marge (S8).
 *
 * Ce déclencheur existe pour une raison qui n'est pas technique mais de
 * sécurité : le coût d'une moto est illisible par un gérant (`DECISIONS.md`
 * D2), donc un gérant ne peut pas le recopier dans la vente qu'il enregistre.
 * Un navigateur ne peut pas figer ce qu'il n'a pas le droit de lire (D51).
 *
 * Ce qui se vérifie ici, et nulle part ailleurs : que le déclencheur est branché
 * sur la bonne collection, qu'il va chercher le coût au bon endroit, qu'il pose
 * la marge là où le responsable la lira — et qu'il **n'écrit rien** quand il ne
 * sait pas, plutôt que de poser un zéro qui mentirait.
 */

const PROJET = "sdi-dev";
const FIRESTORE = "127.0.0.1:8181";
const FONCTIONS = "http://127.0.0.1:5301";
const TEMOIN = `${FONCTIONS}/${PROJET}/europe-west1/creerGerant`;

process.env.FIRESTORE_EMULATOR_HOST = FIRESTORE;
process.env.GCLOUD_PROJECT = PROJET;

const BOUTIQUE = "MRG";

let base: Firestore;
let rang = 0;

beforeAll(async () => {
  await exigerEmulateurs();

  const { getApps, initializeApp } = await import("firebase-admin/app");
  const { getFirestore } = await import("firebase-admin/firestore");
  if (getApps().length === 0) initializeApp({ projectId: PROJET });
  base = getFirestore();

  await reveillerLeDeclencheur();
});

beforeEach(async () => {
  await faireLePropre();
});

afterAll(async () => {
  await faireLePropre();
});

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
        "Redémarrez-les avec « npm run emulators » : le script accorde à la",
        "découverte du code un budget réaliste (cf. scripts/emulateurs.mjs).",
      ].join("\n"),
    );
  }
}

/**
 * Réveille le runtime avant la première mesure.
 *
 * L'émulateur démarre un processus **par fonction**, à la première invocation
 * (D43, D49). Un déclencheur n'ayant pas d'URL, on le réveille de la seule
 * façon possible : en écrivant ce à quoi il réagit, et en attendant son
 * verdict. Sans cela, le premier test paie ce démarrage et accuse le code.
 */
async function reveillerLeDeclencheur(): Promise<void> {
  const debut = Date.now();
  await faireLePropre();
  const { venteId } = await vendre({ coutTotal: 500_000, prixConvenu: 700_000 });
  try {
    await attendreMarge(venteId, 90_000);
  } catch (cause) {
    throw new Error(
      [
        "Le déclencheur de figement de la marge n'a pas réagi.",
        "",
        "Vérifiez la ligne « functions[europe-west1-figerMargeVente]: firestore",
        "function initialized » au démarrage des émulateurs, puis le journal de",
        "l'émulateur : une erreur dans la fonction y est visible.",
        "",
        String(cause),
      ].join("\n"),
    );
  }
  await faireLePropre();
  console.log(`Déclencheur de marge réveillé en ${Date.now() - debut} ms.`);
}

async function faireLePropre(): Promise<void> {
  for (const chemin of ["ventesMotos", "motos"]) {
    const tout = await base.collection(chemin).get();
    await Promise.all(tout.docs.map((document) => base.recursiveDelete(document.ref)));
  }
}

/**
 * Écrit une moto avec son coût, puis la vente — comme le fait le lot du
 * navigateur, à ceci près qu'on passe ici par le SDK Admin.
 */
async function vendre(options: {
  coutTotal: number | null;
  prixConvenu: number;
}): Promise<{ venteId: string; motoId: string }> {
  const moto = base.collection("motos").doc();
  await moto.set({ boutiqueId: BOUTIQUE, numeroChassis: "LC6TEST", statut: "vendue" });
  if (options.coutTotal !== null) {
    await moto.collection("prive").doc("cout").set({
      boutiqueId: BOUTIQUE,
      prixAchat: options.coutTotal,
      fraisEntree: [],
      coutTotal: options.coutTotal,
    });
  }

  /* Un numéro distinct par vente : deux ventes homonymes réveilleraient en plus
     le déclencheur de réconciliation, qui n'a rien à faire ici. */
  rang += 1;
  const numero = `${BOUTIQUE}-2608-${String(rang).padStart(4, "0")}`;

  const vente = base.collection("ventesMotos").doc();
  await vente.set({
    boutiqueId: BOUTIQUE,
    motoId: moto.id,
    prixConvenu: options.prixConvenu,
    numero,
    numeroInitial: numero,
  });

  return { venteId: vente.id, motoId: moto.id };
}

const pause = (ms: number) => new Promise((suite) => setTimeout(suite, ms));

async function lireMarge(venteId: string) {
  const instantane = await base.doc(`ventesMotos/${venteId}/prive/marge`).get();
  return instantane.exists ? instantane.data() : null;
}

async function attendreMarge(venteId: string, plafondMs = 25_000) {
  const debut = Date.now();
  while (Date.now() - debut < plafondMs) {
    const marge = await lireMarge(venteId);
    if (marge) return marge;
    await pause(200);
  }
  throw new Error(`Aucune marge écrite pour la vente ${venteId} après ${plafondMs} ms.`);
}

describe("le coût est figé sur la vente par le serveur", () => {
  it("recopie le coût total de la moto et en déduit la marge", async () => {
    const { venteId } = await vendre({ coutTotal: 865_000, prixConvenu: 1_200_000 });

    const marge = await attendreMarge(venteId);
    expect(marge?.coutMotoSnapshot).toBe(865_000);
    expect(marge?.marge).toBe(335_000);
    expect(marge?.boutiqueId).toBe(BOUTIQUE);
  });

  it("écrit une marge négative telle quelle : une moto vendue à perte se voit", async () => {
    const { venteId } = await vendre({ coutTotal: 900_000, prixConvenu: 800_000 });

    const marge = await attendreMarge(venteId);
    expect(marge?.marge).toBe(-100_000);
  });

  it("n’écrit rien quand la moto n’a pas de coût — un zéro annoncerait une marge fausse", async () => {
    const { venteId } = await vendre({ coutTotal: null, prixConvenu: 1_200_000 });

    /* Une vente complète sert de repère : quand SA marge est posée, le
       déclencheur a traité une écriture postérieure à celle qu'on surveille. */
    const temoin = await vendre({ coutTotal: 500_000, prixConvenu: 600_000 });
    await attendreMarge(temoin.venteId);
    await pause(1000);

    expect(await lireMarge(venteId)).toBeNull();
  });

  it("l’auteur est le serveur, pas la personne qui a saisi la vente", async () => {
    const { venteId } = await vendre({ coutTotal: 700_000, prixConvenu: 1_000_000 });

    const marge = await attendreMarge(venteId);
    expect(marge?.updatedBy).toBe("systeme");
  });
});
