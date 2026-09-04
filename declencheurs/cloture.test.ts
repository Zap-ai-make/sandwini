import type { Firestore } from "firebase-admin/firestore";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

/**
 * La clôture automatique du dossier (S11, §7.1).
 *
 * Trois écritures peuvent achever un dossier — le dernier document remis, le
 * dernier versement, la remise de la moto — et elles se font sur trois écrans
 * différents. La condition est donc évaluée côté serveur, une fois pour toutes.
 *
 * Ce qui se vérifie ici, et nulle part ailleurs : que les déclencheurs sont
 * branchés sur les **deux** chemins (la vente et ses documents), qu'ils
 * n'écrivent rien tant qu'il manque quelque chose, et surtout **qu'ils
 * s'arrêtent**. Un déclencheur qui écrit sur le document qui le déclenche
 * tourne indéfiniment ; ici la garde est la condition elle-même — on n'écrit
 * que si le dossier est encore `ouvert`.
 */

const PROJET = "sdi-dev";
const FIRESTORE = "127.0.0.1:8181";
const FONCTIONS = "http://127.0.0.1:5301";

process.env.FIRESTORE_EMULATOR_HOST = FIRESTORE;
process.env.GCLOUD_PROJECT = PROJET;

const BOUTIQUE = "CLO";
const TYPES = ["quittance", "cmc", "carte_grise", "plaque"] as const;

let base: Firestore;
let rang = 0;

beforeAll(async () => {
  const injoignable = async (url: string) => {
    try {
      await fetch(url);
      return false;
    } catch {
      return true;
    }
  };
  if ((await injoignable(`http://${FIRESTORE}/`)) || (await injoignable(`${FONCTIONS}/`))) {
    throw new Error("Les émulateurs ne répondent pas. Démarrez-les avec « npm run emulators ».");
  }

  const { getApps, initializeApp } = await import("firebase-admin/app");
  const { getFirestore } = await import("firebase-admin/firestore");
  if (getApps().length === 0) initializeApp({ projectId: PROJET });
  base = getFirestore();

  /* L'émulateur démarre un processus par fonction, à la première invocation
     (D43, D49). On paie ce réveil ici plutôt que dans la première mesure, qui
     accuserait le code d'une lenteur qui n'est pas la sienne. */
  const debut = Date.now();
  const { venteId } = await poser({ soldee: true, motoRemise: true, documents: "tous_regles" });
  await attendreStatut(venteId, "clos", 90_000);
  await faireLePropre();
  console.log(`Déclencheur de clôture réveillé en ${Date.now() - debut} ms.`);
});

beforeEach(async () => faireLePropre());
afterAll(async () => faireLePropre());

async function faireLePropre(): Promise<void> {
  const ventes = await base.collection("ventesMotos").where("boutiqueId", "==", BOUTIQUE).get();
  for (const vente of ventes.docs) {
    const documents = await vente.ref.collection("documents").get();
    for (const document of documents.docs) await document.ref.delete();
    await vente.ref.delete();
  }
}

const audit = {
  createdAt: new Date(),
  createdBy: "test",
  createdByName: "Test",
  updatedAt: new Date(),
  updatedBy: "test",
  updatedByName: "Test",
};

/** Écrit une vente et ses quatre documents dans l'état demandé. */
async function poser(options: {
  soldee: boolean;
  motoRemise: boolean;
  documents: "tous_regles" | "un_en_cours";
}): Promise<{ venteId: string }> {
  rang += 1;
  const venteId = `${BOUTIQUE}-cloture-${rang}-${Date.now()}`;
  const reference = base.doc(`ventesMotos/${venteId}`);

  /* Les documents d'abord, la vente ensuite : chaque écriture réveille les
     déclencheurs, et on veut que la dernière trouve le dossier complet. */
  for (const type of TYPES) {
    const regle = options.documents === "tous_regles" || type !== "plaque";
    await reference.collection("documents").doc(type).set({
      boutiqueId: BOUTIQUE,
      venteId,
      type,
      statut: regle ? "remis_client" : "a_faire",
      ...audit,
    });
  }

  await reference.set({
    boutiqueId: BOUTIQUE,
    statutPaiement: options.soldee ? "solde" : "partiel",
    motoRemise: options.motoRemise,
    statutDossier: "ouvert",
    dateClotureDossier: null,
    ...audit,
  });

  return { venteId };
}

async function attendreStatut(venteId: string, attendu: string, budget = 30_000): Promise<void> {
  const limite = Date.now() + budget;
  while (Date.now() < limite) {
    const vente = await base.doc(`ventesMotos/${venteId}`).get();
    if (vente.get("statutDossier") === attendu) return;
    await new Promise((suite) => setTimeout(suite, 500));
  }
  throw new Error(`Le dossier ${venteId} n'est jamais passé à « ${attendu} ».`);
}

describe("clôture automatique", () => {
  it("clôt le dossier quand tout est remis, soldé et livré", async () => {
    const { venteId } = await poser({
      soldee: true,
      motoRemise: true,
      documents: "tous_regles",
    });
    await attendreStatut(venteId, "clos");

    const vente = await base.doc(`ventesMotos/${venteId}`).get();
    expect(vente.get("dateClotureDossier")).not.toBeNull();
    /* Personne n'a décidé cette clôture : elle découle de faits déjà saisis.
       Recopier l'auteur du dernier geste lui attribuerait une décision qu'il
       n'a pas prise. */
    expect(vente.get("updatedBy")).toBe("systeme");
  });

  it("ne clôt pas tant qu’un document traîne", async () => {
    const { venteId } = await poser({
      soldee: true,
      motoRemise: true,
      documents: "un_en_cours",
    });
    await expect(attendreStatut(venteId, "clos", 8_000)).rejects.toThrow();
  });

  it("ne clôt pas une vente qui reste due", async () => {
    const { venteId } = await poser({
      soldee: false,
      motoRemise: true,
      documents: "tous_regles",
    });
    await expect(attendreStatut(venteId, "clos", 8_000)).rejects.toThrow();
  });

  /* Le cas des tranches : tout est payé, tous les papiers sont remis, mais la
     moto dort encore au magasin. Le dossier n'est pas fini. */
  it("ne clôt pas une vente soldée dont la moto n’est pas partie", async () => {
    const { venteId } = await poser({
      soldee: true,
      motoRemise: false,
      documents: "tous_regles",
    });
    await expect(attendreStatut(venteId, "clos", 8_000)).rejects.toThrow();
  });

  /* La garde anti-boucle : l'écriture de clôture rappelle le déclencheur, qui
     doit voir « clos » et s'arrêter. Si elle ne tenait pas, `updatedAt`
     continuerait d'avancer après la clôture — et la facture avec. */
  it("s’arrête après avoir clos : il ne se redéclenche pas sur sa propre écriture", async () => {
    const { venteId } = await poser({
      soldee: true,
      motoRemise: true,
      documents: "tous_regles",
    });
    await attendreStatut(venteId, "clos");

    const apresCloture = (await base.doc(`ventesMotos/${venteId}`).get()).get("updatedAt");
    await new Promise((suite) => setTimeout(suite, 6_000));
    const plusTard = (await base.doc(`ventesMotos/${venteId}`).get()).get("updatedAt");

    expect(plusTard.isEqual(apresCloture)).toBe(true);
  });
});
