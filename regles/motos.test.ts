import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { readFileSync } from "node:fs";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from "firebase/firestore";
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";

/**
 * Règles sur le stock motos (S5).
 *
 * Le test central de cette spec tient en une phrase : **un gérant ne doit
 * jamais pouvoir lire un prix d’achat.** Le cahier des charges réserve la marge
 * au responsable, et comme Firestore ne masque pas les champs, la seule
 * garantie possible est structurelle — le coût vit dans une sous-collection à
 * part. Une garantie structurelle se vérifie ; une promesse d’interface, non.
 */

let env: RulesTestEnvironment;

const HOTE = "127.0.0.1";
const PORT = 8181;

const responsable = () => env.authenticatedContext("resp-1", { role: "responsable" }).firestore();
const gerant = (uid = "ger-1", boutiqueId = "PTG") =>
  env.authenticatedContext(uid, { role: "gerant", boutiqueId }).firestore();

const audit = (auteur: string) => ({
  createdAt: serverTimestamp(),
  createdBy: auteur,
  createdByName: "Auteur",
  updatedAt: serverTimestamp(),
  updatedBy: auteur,
  updatedByName: "Auteur",
});

const auditFige = {
  createdAt: new Date("2026-01-01T08:00:00Z"),
  createdBy: "ger-1",
  createdByName: "Auteur",
  updatedAt: new Date("2026-01-01T08:00:00Z"),
  updatedBy: "ger-1",
  updatedByName: "Auteur",
};

const moto = (partie: Record<string, unknown> = {}, auteur = "ger-1") => ({
  boutiqueId: "PTG",
  etat: "neuve",
  marqueId: "yamaha",
  modeleId: "crux",
  couleur: "Rouge",
  annee: 2024,
  numeroChassis: "LC6PCJ1A9K0000123",
  numeroMoteur: "",
  prixVenteConseille: 1_100_000,
  provenanceId: "import",
  papiersFournis: [],
  photos: [],
  statut: "en_stock",
  dateEntree: new Date("2026-08-20T09:00:00Z"),
  ...audit(auteur),
  ...partie,
});

const motoFigee = (partie: Record<string, unknown> = {}) => ({
  ...moto(),
  ...auditFige,
  ...partie,
});

const cout = (partie: Record<string, unknown> = {}, auteur = "ger-1") => ({
  boutiqueId: "PTG",
  prixAchat: 850_000,
  fraisEntree: [{ typeFraisId: "transport", montant: 15_000, note: "" }],
  coutTotal: 865_000,
  updatedAt: serverTimestamp(),
  updatedBy: auteur,
  updatedByName: "Auteur",
  ...partie,
});

const modification = (champs: Record<string, unknown>, auteur = "ger-1") => ({
  ...champs,
  updatedAt: serverTimestamp(),
  updatedBy: auteur,
  updatedByName: "Auteur",
});

beforeAll(async () => {
  try {
    await fetch(`http://${HOTE}:${PORT}/`);
  } catch {
    throw new Error(
      `L’émulateur Firestore ne répond pas sur ${HOTE}:${PORT}.\n` +
        "Démarrez-le avec « npm run emulators », ou lancez « npm run test:regles:isole ».",
    );
  }
  env = await initializeTestEnvironment({
    projectId: "sdi-regles-motos",
    firestore: { rules: readFileSync("firestore.rules", "utf8"), host: HOTE, port: PORT },
  });
});

afterAll(async () => env?.cleanup());

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (contexte) => {
    const base = contexte.firestore();
    await setDoc(doc(base, "motos/moto-ptg"), motoFigee());
    await setDoc(doc(base, "motos/moto-ptg/prive/cout"), {
      boutiqueId: "PTG",
      prixAchat: 850_000,
      fraisEntree: [],
      coutTotal: 850_000,
      updatedAt: new Date("2026-01-01T08:00:00Z"),
      updatedBy: "ger-1",
      updatedByName: "Auteur",
    });
    await setDoc(doc(base, "motos/moto-kdg"), motoFigee({ boutiqueId: "KDG" }));
    await setDoc(doc(base, "motos/moto-kdg/prive/cout"), {
      boutiqueId: "KDG",
      prixAchat: 900_000,
      fraisEntree: [],
      coutTotal: 900_000,
      updatedAt: new Date("2026-01-01T08:00:00Z"),
      updatedBy: "ger-2",
      updatedByName: "Auteur",
    });
  });
});

describe("le coût est hors de portée du gérant", () => {
  it("le gérant ne lit pas le coût de sa propre moto", async () => {
    await assertFails(getDoc(doc(gerant(), "motos/moto-ptg/prive/cout")));
  });

  it("le gérant ne parcourt pas la sous-collection privée", async () => {
    await assertFails(getDocs(collection(gerant(), "motos/moto-ptg/prive")));
  });

  it("le responsable, lui, le lit", async () => {
    await assertSucceeds(getDoc(doc(responsable(), "motos/moto-ptg/prive/cout")));
  });

  it("un anonyme ne lit ni la moto ni son coût", async () => {
    const anonyme = env.unauthenticatedContext().firestore();
    await assertFails(getDoc(doc(anonyme, "motos/moto-ptg")));
    await assertFails(getDoc(doc(anonyme, "motos/moto-ptg/prive/cout")));
  });

  it("personne n’efface un coût", async () => {
    await assertFails(deleteDoc(doc(responsable(), "motos/moto-ptg/prive/cout")));
    await assertFails(deleteDoc(doc(gerant(), "motos/moto-ptg/prive/cout")));
  });
});

describe("lecture du stock", () => {
  it("le gérant lit une moto de sa boutique", async () => {
    await assertSucceeds(getDoc(doc(gerant(), "motos/moto-ptg")));
  });

  it("le gérant ne lit pas une moto d’une autre boutique", async () => {
    await assertFails(getDoc(doc(gerant(), "motos/moto-kdg")));
  });

  it("le gérant interroge le stock de sa boutique, et de la sienne seulement", async () => {
    const base = gerant();
    await assertSucceeds(
      getDocs(query(collection(base, "motos"), where("boutiqueId", "==", "PTG"))),
    );
    await assertFails(getDocs(query(collection(base, "motos"), where("boutiqueId", "==", "KDG"))));
    // Sans filtre, la requête ramasserait tout : refusée.
    await assertFails(getDocs(collection(base, "motos")));
  });

  it("le responsable lit tout le stock, toutes boutiques", async () => {
    await assertSucceeds(getDocs(collection(responsable(), "motos")));
    await assertSucceeds(getDoc(doc(responsable(), "motos/moto-kdg")));
  });
});

describe("entrée en stock", () => {
  it("le gérant fait entrer une moto et son coût dans le même lot", async () => {
    const base = gerant();
    const reference = doc(collection(base, "motos"));
    const lot = writeBatch(base);
    lot.set(reference, moto());
    lot.set(doc(reference, "prive", "cout"), cout());
    await assertSucceeds(lot.commit());
  });

  it("le gérant n’entre pas une moto dans une autre boutique", async () => {
    await assertFails(addDoc(collection(gerant(), "motos"), moto({ boutiqueId: "KDG" })));
  });

  it("le gérant n’écrit pas un coût rattaché à une autre boutique", async () => {
    const base = gerant();
    const reference = doc(collection(base, "motos"));
    const lot = writeBatch(base);
    lot.set(reference, moto());
    lot.set(doc(reference, "prive", "cout"), cout({ boutiqueId: "KDG" }));
    await assertFails(lot.commit());
  });

  it("le gérant n’attache pas un coût à la moto d’une autre boutique", async () => {
    await assertFails(setDoc(doc(gerant(), "motos/moto-kdg/prive/cout"), cout({ boutiqueId: "PTG" })));
  });

  it("le responsable fait entrer une moto dans n’importe quelle boutique", async () => {
    await assertSucceeds(
      addDoc(collection(responsable(), "motos"), moto({ boutiqueId: "KDG" }, "resp-1")),
    );
  });

  it("une moto ne naît jamais déjà vendue", async () => {
    await assertFails(addDoc(collection(gerant(), "motos"), moto({ statut: "vendue" })));
  });

  it("exige un châssis, et un châssis propre", async () => {
    await assertFails(addDoc(collection(gerant(), "motos"), moto({ numeroChassis: "" })));
    await assertFails(addDoc(collection(gerant(), "motos"), moto({ numeroChassis: "lc6p-123" })));
  });

  it("exige un rattachement au référentiel", async () => {
    await assertFails(addDoc(collection(gerant(), "motos"), moto({ marqueId: "" })));
    await assertFails(addDoc(collection(gerant(), "motos"), moto({ provenanceId: "" })));
  });

  it("refuse un champ hors contrat — un prix d’achat glissé dans la moto, par exemple", async () => {
    await assertFails(addDoc(collection(gerant(), "motos"), moto({ prixAchat: 850_000 })));
  });

  it("refuse une photo tant que S19 n’a pas donné de file d’attente hors ligne", async () => {
    await assertFails(
      addDoc(collection(gerant(), "motos"), moto({ photos: ["https://exemple.test/a.jpg"] })),
    );
  });

  it("refuse une date d’entrée dans le futur — une horloge déréglée fausserait le stock", async () => {
    const demain = new Date(Date.now() + 3 * 24 * 3600 * 1000);
    await assertFails(addDoc(collection(gerant(), "motos"), moto({ dateEntree: demain })));
  });

  it("accepte une date d’entrée passée : la moto saisie hors ligne lundi est entrée lundi", async () => {
    const lundi = new Date(Date.now() - 3 * 24 * 3600 * 1000);
    await assertSucceeds(addDoc(collection(gerant(), "motos"), moto({ dateEntree: lundi })));
  });

  it("refuse un montant décimal — le FCFA ne se divise pas", async () => {
    const base = gerant();
    const reference = doc(collection(base, "motos"));
    const lot = writeBatch(base);
    lot.set(reference, moto());
    lot.set(doc(reference, "prive", "cout"), cout({ prixAchat: 850_000.5 }));
    await assertFails(lot.commit());
  });
});

describe("correction d’une moto", () => {
  it("le gérant corrige la couleur de sa moto", async () => {
    await assertSucceeds(
      updateDoc(doc(gerant(), "motos/moto-ptg"), modification({ couleur: "Bleu" })),
    );
  });

  it("le gérant ne déplace pas une moto vers une autre boutique — c’est un transfert", async () => {
    await assertFails(
      updateDoc(doc(gerant(), "motos/moto-ptg"), modification({ boutiqueId: "KDG" })),
    );
  });

  it("le gérant ne touche pas à la moto d’une autre boutique", async () => {
    await assertFails(
      updateDoc(doc(gerant(), "motos/moto-kdg"), modification({ couleur: "Bleu" })),
    );
  });

  it("la trace de création ne se réécrit pas", async () => {
    await assertFails(
      updateDoc(doc(gerant(), "motos/moto-ptg"), modification({ createdBy: "resp-1" })),
    );
  });

  it("une moto ne se supprime jamais", async () => {
    await assertFails(deleteDoc(doc(gerant(), "motos/moto-ptg")));
    await assertFails(deleteDoc(doc(responsable(), "motos/moto-ptg")));
  });
});
