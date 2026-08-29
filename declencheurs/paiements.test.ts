import type { Firestore } from "firebase-admin/firestore";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

/**
 * Le recalcul des agrégats de paiement (S9).
 *
 * Ce déclencheur répond à un défaut que le hors-ligne rend inévitable.
 * `totalPaye` et `resteDu` vivent sur le document de vente (`prompt.md` §5.4).
 * Deux gérants sans réseau qui encaissent chacun un versement sur la même vente
 * écrivent tous deux ce champ : la dernière écriture gagne (§3.4), et un
 * versement disparaît des totaux alors que son reçu est entre les mains du
 * client. Les sous-documents, eux, survivent tous les deux.
 *
 * D'où le partage (`DECISIONS.md` D56) : les versements font foi, le parent est
 * un cache d'affichage, et ce déclencheur le remet d'aplomb depuis la
 * sous-collection dès que les écritures se rejoignent.
 *
 * Ce qui se vérifie ici, et nulle part ailleurs : qu'il additionne bien TOUS les
 * versements — y compris celui qu'un autre appareil avait écrasé — et qu'il ne
 * réécrit pas un document déjà juste.
 */

const PROJET = "sdi-dev";
const FIRESTORE = "127.0.0.1:8181";
const FONCTIONS = "http://127.0.0.1:5301";
const TEMOIN = `${FONCTIONS}/${PROJET}/europe-west1/creerGerant`;

process.env.FIRESTORE_EMULATOR_HOST = FIRESTORE;
process.env.GCLOUD_PROJECT = PROJET;

const BOUTIQUE = "PAI";

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
 * Réveille le runtime avant la première mesure (D43, D49).
 *
 * Un déclencheur n'a pas d'URL : on le réveille en écrivant ce à quoi il réagit
 * et en attendant son verdict. Sans cela, le premier test paierait le démarrage
 * du processus et accuserait le code.
 */
async function reveillerLeDeclencheur(): Promise<void> {
  const debut = Date.now();
  await faireLePropre();
  const venteId = await vendre(600_000);
  await verser(venteId, 100_000);
  try {
    await attendreTotal(venteId, 100_000, 90_000);
  } catch (cause) {
    throw new Error(
      [
        "Le déclencheur de recalcul des paiements n'a pas réagi.",
        "",
        "Vérifiez la ligne « functions[europe-west1-recalculerPaiementsVente]:",
        "firestore function initialized » au démarrage des émulateurs, puis le",
        "journal de l'émulateur.",
        "",
        String(cause),
      ].join("\n"),
    );
  }
  await faireLePropre();
  console.log(`Déclencheur de paiements réveillé en ${Date.now() - debut} ms.`);
}

async function faireLePropre(): Promise<void> {
  const tout = await base.collection("ventesMotos").get();
  await Promise.all(tout.docs.map((document) => base.recursiveDelete(document.ref)));
}

/** Une vente sans versement, telle que le lot du navigateur l'écrirait. */
async function vendre(prixConvenu: number): Promise<string> {
  rang += 1;
  const numero = `${BOUTIQUE}-2608-${String(rang).padStart(4, "0")}`;

  const vente = base.collection("ventesMotos").doc();
  await vente.set({
    boutiqueId: BOUTIQUE,
    motoId: `moto-${rang}`,
    numero,
    numeroInitial: numero,
    prixConvenu,
    modePaiement: "credit",
    totalPaye: 0,
    resteDu: prixConvenu,
    statutPaiement: "impaye",
    dernierVersementAt: null,
  });
  return vente.id;
}

/**
 * Un versement, sans toucher aux agrégats du parent.
 *
 * C'est exactement ce que produit un appareil dont l'écriture du parent a été
 * écrasée par un autre : le sous-document est là, le total ne le compte pas.
 */
async function verser(venteId: string, montant: number): Promise<void> {
  await base.collection(`ventesMotos/${venteId}/versements`).add({
    boutiqueId: BOUTIQUE,
    venteId,
    montant,
    date: new Date(),
    moyenPaiement: "especes",
  });
}

const pause = (ms: number) => new Promise((suite) => setTimeout(suite, ms));

async function lireVente(venteId: string) {
  return (await base.doc(`ventesMotos/${venteId}`).get()).data();
}

async function attendreTotal(venteId: string, attendu: number, plafondMs = 25_000) {
  const debut = Date.now();
  let dernier: unknown;
  while (Date.now() - debut < plafondMs) {
    const vente = await lireVente(venteId);
    dernier = vente?.totalPaye;
    if (dernier === attendu) return vente;
    await pause(200);
  }
  throw new Error(
    `La vente ${venteId} porte ${String(dernier)} au lieu de ${attendu} après ${plafondMs} ms.`,
  );
}

describe("les agrégats de paiement sont recalculés depuis les versements", () => {
  it("additionne un versement écrit seul, sans mise à jour du parent", async () => {
    const venteId = await vendre(1_200_000);
    await verser(venteId, 400_000);

    const vente = await attendreTotal(venteId, 400_000);
    expect(vente?.resteDu).toBe(800_000);
    expect(vente?.statutPaiement).toBe("partiel");
  });

  it("rattrape le versement qu’un autre appareil avait écrasé des totaux", async () => {
    const venteId = await vendre(1_200_000);

    /* Deux appareils hors ligne. Le premier encaisse 300 000 et écrit le
       parent ; le second encaisse 200 000 et écrit le parent par-dessus, sans
       connaître le premier versement. Le parent affiche 200 000, alors que le
       client détient deux reçus pour 500 000. */
    await verser(venteId, 300_000);
    await verser(venteId, 200_000);
    await base.doc(`ventesMotos/${venteId}`).update({
      totalPaye: 200_000,
      resteDu: 1_000_000,
      statutPaiement: "partiel",
    });

    const vente = await attendreTotal(venteId, 500_000);
    expect(vente?.resteDu).toBe(700_000);
  });

  it("solde la vente quand la somme des versements atteint le prix", async () => {
    const venteId = await vendre(600_000);
    await verser(venteId, 600_000);

    const vente = await attendreTotal(venteId, 600_000);
    expect(vente?.resteDu).toBe(0);
    expect(vente?.statutPaiement).toBe("solde");
  });

  it("ne descend jamais le reste dû sous zéro, même en cas de trop-perçu", async () => {
    const venteId = await vendre(500_000);
    await verser(venteId, 400_000);
    await verser(venteId, 300_000);

    const vente = await attendreTotal(venteId, 700_000);
    expect(vente?.resteDu).toBe(0);
    expect(vente?.statutPaiement).toBe("solde");
  });

  it("retient la date du versement le plus récent", async () => {
    const venteId = await vendre(600_000);
    await base.collection(`ventesMotos/${venteId}/versements`).add({
      boutiqueId: BOUTIQUE,
      venteId,
      montant: 100_000,
      date: new Date("2026-08-10T10:00:00Z"),
      moyenPaiement: "especes",
    });
    await base.collection(`ventesMotos/${venteId}/versements`).add({
      boutiqueId: BOUTIQUE,
      venteId,
      montant: 100_000,
      date: new Date("2026-08-25T10:00:00Z"),
      moyenPaiement: "especes",
    });

    const vente = await attendreTotal(venteId, 200_000);
    expect(vente?.dernierVersementAt?.toDate()).toEqual(new Date("2026-08-25T10:00:00Z"));
  });

  it("l’auteur est le serveur : personne n’a saisi ce total", async () => {
    const venteId = await vendre(600_000);
    await verser(venteId, 250_000);

    const vente = await attendreTotal(venteId, 250_000);
    expect(vente?.updatedBy).toBe("systeme");
  });

  it("ne réécrit pas une vente dont le navigateur a déjà posé les bons totaux", async () => {
    /* Le cas ordinaire, et de très loin le plus fréquent : un seul appareil,
       dont le lot a écrit le versement ET les agrégats justes. Le déclencheur
       n’a alors rien à corriger, et ne doit rien écrire — sinon chaque
       versement coûterait une écriture pour rien sur le document le plus
       sollicité du produit. */
    const venteId = await vendre(600_000);
    await base.doc(`ventesMotos/${venteId}`).update({
      totalPaye: 150_000,
      resteDu: 450_000,
      statutPaiement: "partiel",
      updatedByName: "Le gérant",
    });
    const avant = await lireVente(venteId);
    await verser(venteId, 150_000);

    /* Une seconde vente sert de repère : quand SON total est recalculé, le
       déclencheur a traité une écriture postérieure à celle qu’on surveille. */
    const temoin = await vendre(400_000);
    await verser(temoin, 400_000);
    await attendreTotal(temoin, 400_000);

    const apres = await lireVente(venteId);
    expect(apres?.totalPaye).toBe(150_000);
    expect(apres?.updatedByName).toBe("Le gérant");
    expect(apres?.updatedAt?.toMillis()).toBe(avant?.updatedAt?.toMillis());
  });
});
