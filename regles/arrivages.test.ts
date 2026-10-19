import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { readFileSync } from "node:fs";
import { deleteDoc, doc, getDoc, serverTimestamp, setDoc, updateDoc } from "firebase/firestore";
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";

/**
 * Règles sur les arrivages et les fournisseurs (S42).
 *
 * Le test qui ne peut pas manquer : **un lot saisi par un gérant n'ouvre aucune
 * porte sur le coût.** Le gérant fait entrer les motos du lot, mais le prix
 * d'achat vit dans `motos/{id}/prive/cout`, où il n'a pas accès (D2). Une
 * garantie d'interface ne suffit pas ; celle-ci est structurelle, donc elle se
 * prouve ici.
 */

let env: RulesTestEnvironment;
const HOTE = "127.0.0.1";
const PORT = 8181;

const responsable = () => env.authenticatedContext("resp-1", { role: "responsable" }).firestore();
const gerant = (uid = "ger-1", boutiqueId = "PTG") =>
  env.authenticatedContext(uid, { role: "gerant", boutiqueId }).firestore();

const audit = (auteur = "ger-1") => ({
  createdAt: serverTimestamp(),
  createdBy: auteur,
  createdByName: "Auteur",
  updatedAt: serverTimestamp(),
  updatedBy: auteur,
  updatedByName: "Auteur",
});

const fournisseur = (partie: Record<string, unknown> = {}) => ({
  nom: "HAOJUE Import",
  telephone: "70 12 34 56",
  localite: "Pouytenga",
  actif: true,
  ...audit(),
  ...partie,
});

const arrivage = (partie: Record<string, unknown> = {}) => ({
  nom: "Arrivage mars 2026",
  fournisseurId: "f1",
  boutiqueId: "PTG",
  date: new Date("2026-03-12T00:00:00Z"),
  description: "40 motos HAOJUE",
  ...audit(),
  ...partie,
});

const motoDeLot = (partie: Record<string, unknown> = {}) => ({
  boutiqueId: "PTG",
  etat: "neuve",
  marqueId: "haojue",
  modeleId: "kpr",
  couleur: "Rouge",
  annee: null,
  numeroChassis: "LC6PCJ1A9K0000123",
  numeroMoteur: "",
  prixVenteConseille: null,
  provenanceId: "",
  arrivageId: "arr-1",
  papiersFournis: [],
  photos: [],
  statut: "en_stock",
  dateEntree: new Date("2026-03-12T09:00:00Z"),
  ...audit(),
  ...partie,
});

const cout = (partie: Record<string, unknown> = {}) => ({
  boutiqueId: "PTG",
  prixAchat: 450_000,
  fraisEntree: [],
  coutTotal: 450_000,
  updatedAt: serverTimestamp(),
  updatedBy: "resp-1",
  updatedByName: "Auteur",
  ...partie,
});

beforeAll(async () => {
  try {
    await fetch(`http://${HOTE}:${PORT}/`);
  } catch {
    throw new Error(
      `L’émulateur Firestore ne répond pas sur ${HOTE}:${PORT}.\n` +
        "Lancez « npm run test:regles:isole ».",
    );
  }
  env = await initializeTestEnvironment({
    projectId: "sdi-regles-arrivages",
    firestore: { rules: readFileSync("firestore.rules", "utf8"), host: HOTE, port: PORT },
  });
});

afterAll(async () => env?.cleanup());

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (contexte) => {
    const base = contexte.firestore();
    await setDoc(doc(base, "arrivages/arr-ptg"), arrivage({ boutiqueId: "PTG" }));
    await setDoc(doc(base, "arrivages/arr-kdg"), arrivage({ boutiqueId: "KDG" }));
    await setDoc(doc(base, "fournisseurs/f1"), fournisseur());
  });
});

describe("fournisseurs", () => {
  it("un gérant connecté ajoute un fournisseur valide : c'est un geste de comptoir", async () => {
    await assertSucceeds(setDoc(doc(gerant(), "fournisseurs/f-neuf"), fournisseur()));
  });

  it("un fournisseur sans nom est refusé", async () => {
    await assertFails(setDoc(doc(gerant(), "fournisseurs/f-vide"), fournisseur({ nom: "" })));
  });

  it("un fournisseur avec un champ inconnu est refusé", async () => {
    await assertFails(
      setDoc(doc(gerant(), "fournisseurs/f-x"), fournisseur({ marge: 1000 })),
    );
  });

  it("le nom seul suffit : téléphone et localité peuvent être vides", async () => {
    await assertSucceeds(
      setDoc(doc(gerant(), "fournisseurs/f-min"), fournisseur({ telephone: "", localite: "" })),
    );
  });
});

describe("arrivages — portée boutique", () => {
  it("un gérant crée un arrivage pour SA boutique", async () => {
    await assertSucceeds(setDoc(doc(gerant(), "arrivages/a-neuf"), arrivage({ boutiqueId: "PTG" })));
  });

  it("un gérant ne crée pas un arrivage pour une autre boutique", async () => {
    await assertFails(setDoc(doc(gerant(), "arrivages/a-kdg"), arrivage({ boutiqueId: "KDG" })));
  });

  it("un gérant lit les arrivages de sa boutique, pas ceux d'une autre", async () => {
    await assertSucceeds(getDoc(doc(gerant(), "arrivages/arr-ptg")));
    await assertFails(getDoc(doc(gerant(), "arrivages/arr-kdg")));
  });

  it("le responsable lit un arrivage de n'importe quelle boutique", async () => {
    await assertSucceeds(getDoc(doc(responsable(), "arrivages/arr-kdg")));
  });

  it("un arrivage sans fournisseur est refusé", async () => {
    await assertFails(setDoc(doc(gerant(), "arrivages/a-sans"), arrivage({ fournisseurId: "" })));
  });
});

describe("le lot ne fuit pas le coût (D2)", () => {
  it("un gérant fait entrer une moto de lot : arrivageId, aucune provenance, aucun coût", async () => {
    await assertSucceeds(setDoc(doc(gerant(), "motos/m-lot"), motoDeLot()));
  });

  it("un gérant ne peut PAS écrire le coût d'une moto de lot", async () => {
    await env.withSecurityRulesDisabled(async (c) => {
      await setDoc(doc(c.firestore(), "motos/m-lot2"), motoDeLot());
    });
    await assertFails(setDoc(doc(gerant(), "motos/m-lot2/prive/cout"), cout({ updatedBy: "ger-1" })));
  });

  it("une moto sans provenance ni arrivage est refusée : elle n'a pas d'origine", async () => {
    await assertFails(
      setDoc(doc(gerant(), "motos/m-orpheline"), motoDeLot({ provenanceId: "", arrivageId: null })),
    );
  });

  it("le responsable crée une moto de lot", async () => {
    await assertSucceeds(
      setDoc(doc(responsable(), "motos/m-resp"), motoDeLot({ createdBy: "resp-1", updatedBy: "resp-1" })),
    );
  });

  it("le responsable pose le coût d'une moto de lot", async () => {
    await env.withSecurityRulesDisabled(async (c) => {
      await setDoc(doc(c.firestore(), "motos/m-resp"), motoDeLot());
    });
    await assertSucceeds(
      setDoc(doc(responsable(), "motos/m-resp/prive/cout"), cout({ updatedBy: "resp-1" })),
    );
  });
});

/**
 * Le suivi d'un lot (S43) : marquer le CMC reçu, annuler, supprimer.
 *
 * Rien de tout cela n'ouvre le coût : marquer un CMC est une mise à jour de la
 * moto (jamais de `prive/cout`), et supprimer/annuler ne touche que l'arrivage.
 */
describe("S43 — suivi d'un lot", () => {
  const trace = (auteur = "ger-1") => ({
    updatedAt: serverTimestamp(),
    updatedBy: auteur,
    updatedByName: "Auteur",
  });

  it("un gérant marque « CMC reçu » sur une moto de sa boutique", async () => {
    await env.withSecurityRulesDisabled(async (c) => {
      await setDoc(doc(c.firestore(), "motos/m-cmc"), motoDeLot());
    });
    await assertSucceeds(updateDoc(doc(gerant(), "motos/m-cmc"), { cmcRecu: true, ...trace() }));
  });

  it("un cmcRecu non booléen est refusé", async () => {
    await env.withSecurityRulesDisabled(async (c) => {
      await setDoc(doc(c.firestore(), "motos/m-cmc2"), motoDeLot());
    });
    await assertFails(updateDoc(doc(gerant(), "motos/m-cmc2"), { cmcRecu: "oui", ...trace() }));
  });

  it("un gérant annule un lot de sa boutique", async () => {
    await assertSucceeds(updateDoc(doc(gerant(), "arrivages/arr-ptg"), { annule: true, ...trace() }));
  });

  it("un annule non booléen est refusé", async () => {
    await assertFails(updateDoc(doc(gerant(), "arrivages/arr-ptg"), { annule: "oui", ...trace() }));
  });

  it("un gérant supprime un arrivage de sa boutique, pas celui d'une autre", async () => {
    await assertSucceeds(deleteDoc(doc(gerant(), "arrivages/arr-ptg")));
    await assertFails(deleteDoc(doc(gerant(), "arrivages/arr-kdg")));
  });

  it("le responsable supprime un arrivage de n'importe quelle boutique", async () => {
    await assertSucceeds(deleteDoc(doc(responsable(), "arrivages/arr-kdg")));
  });
});
