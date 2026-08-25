import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { readFileSync } from "node:fs";
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
  setDoc,
  updateDoc,
} from "firebase/firestore";
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";

/**
 * Règles sur les boutiques (S3).
 *
 * Deux choses à protéger, et elles ne se ressemblent pas.
 *
 * La première est une frontière : un gérant ne voit que sa boutique. La
 * seconde est une contrainte d’intégrité : le **code ne bouge jamais**, parce
 * qu’il est imprimé sur des reçus et qu’il ouvre leurs numéros. Un code qu’on
 * pourrait réécrire, ou une création qui recouvrirait une boutique existante,
 * rendraient faux des documents déjà remis à des clients.
 */

let env: RulesTestEnvironment;

const HOTE = "127.0.0.1";
const PORT = 8181;

const responsable = (uid = "resp-1") =>
  env.authenticatedContext(uid, { role: "responsable" }).firestore();
const gerant = (uid = "ger-1", boutiqueId = "PTG") =>
  env.authenticatedContext(uid, { role: "gerant", boutiqueId }).firestore();

/** Ce que le formulaire de création envoie réellement. */
const creation = (code: string, auteur = "resp-1") => ({
  nom: "Boutique de " + code,
  code,
  adresse: "Marché central",
  telephone: "70 00 00 00",
  actif: true,
  createdAt: serverTimestamp(),
  createdBy: auteur,
  createdByName: "Responsable SDI",
  updatedAt: serverTimestamp(),
  updatedBy: auteur,
  updatedByName: "Responsable SDI",
});

/** Une boutique déjà en base, avec des horodatages figés. */
const existante = (code: string) => ({
  nom: "Boutique de " + code,
  code,
  adresse: "Marché central",
  telephone: "70 00 00 00",
  actif: true,
  createdAt: new Date("2026-01-01T08:00:00Z"),
  createdBy: "resp-1",
  createdByName: "Responsable SDI",
  updatedAt: new Date("2026-01-01T08:00:00Z"),
  updatedBy: "resp-1",
  updatedByName: "Responsable SDI",
});

const miseAJour = (champs: Record<string, unknown>, auteur = "resp-1") => ({
  ...champs,
  updatedAt: serverTimestamp(),
  updatedBy: auteur,
  updatedByName: "Responsable SDI",
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
    projectId: "sdi-regles-boutiques",
    firestore: { rules: readFileSync("firestore.rules", "utf8"), host: HOTE, port: PORT },
  });
});

afterAll(async () => env?.cleanup());

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (contexte) => {
    const base = contexte.firestore();
    await setDoc(doc(base, "boutiques/PTG"), existante("PTG"));
    await setDoc(doc(base, "boutiques/KDG"), existante("KDG"));
  });
});

describe("lecture", () => {
  it("le responsable parcourt toutes les boutiques", async () => {
    await assertSucceeds(getDocs(collection(responsable(), "boutiques")));
  });

  it("un gérant lit la sienne — il en a besoin pour imprimer un reçu", async () => {
    await assertSucceeds(getDoc(doc(gerant(), "boutiques/PTG")));
  });

  it("un gérant ne lit pas la boutique d’à côté", async () => {
    await assertFails(getDoc(doc(gerant(), "boutiques/KDG")));
  });

  it("un gérant ne parcourt pas la liste des boutiques", async () => {
    await assertFails(getDocs(collection(gerant(), "boutiques")));
  });

  it("un anonyme ne lit rien", async () => {
    const anonyme = env.unauthenticatedContext().firestore();
    await assertFails(getDoc(doc(anonyme, "boutiques/PTG")));
    await assertFails(getDocs(collection(anonyme, "boutiques")));
  });

  it("un gérant dont le claim vise une boutique inexistante n’ouvre rien d’autre", async () => {
    const errant = gerant("ger-3", "ZZZ");
    await assertFails(getDoc(doc(errant, "boutiques/PTG")));
  });
});

describe("création", () => {
  it("le responsable déclare une nouvelle boutique", async () => {
    await assertSucceeds(setDoc(doc(responsable(), "boutiques/ZRG"), creation("ZRG")));
  });

  it("un gérant n’en crée pas, même dans sa propre boutique", async () => {
    await assertFails(setDoc(doc(gerant(), "boutiques/ZRG"), creation("ZRG", "ger-1")));
  });

  it("le code du document et le champ code ne peuvent pas diverger", async () => {
    await assertFails(setDoc(doc(responsable(), "boutiques/ZRG"), creation("XXX")));
  });

  it("refuse un code qui casserait un numéro de reçu", async () => {
    for (const code of ["ZR", "ZRGA", "ZR1", "zrg"]) {
      await assertFails(setDoc(doc(responsable(), `boutiques/${code}`), creation(code)));
    }
  });

  it("refuse une boutique sans nom", async () => {
    await assertFails(
      setDoc(doc(responsable(), "boutiques/ZRG"), { ...creation("ZRG"), nom: "" }),
    );
  });

  it("refuse un champ qui n’est pas au contrat", async () => {
    await assertFails(
      setDoc(doc(responsable(), "boutiques/ZRG"), { ...creation("ZRG"), marge: 42 }),
    );
  });

  it("refuse une date de création choisie par le client", async () => {
    await assertFails(
      setDoc(doc(responsable(), "boutiques/ZRG"), {
        ...creation("ZRG"),
        createdAt: new Date("2020-01-01T00:00:00Z"),
      }),
    );
  });

  it("refuse de signer la création au nom de quelqu’un d’autre", async () => {
    await assertFails(setDoc(doc(responsable(), "boutiques/ZRG"), creation("ZRG", "resp-2")));
  });

  it("une création ne recouvre pas une boutique existante", async () => {
    // Le formulaire enverrait un createdAt neuf : c’est ce que la règle voit.
    await assertFails(setDoc(doc(responsable(), "boutiques/PTG"), creation("PTG")));
  });
});

describe("modification", () => {
  it("le responsable corrige le nom, l’adresse et le téléphone", async () => {
    await assertSucceeds(
      updateDoc(
        doc(responsable(), "boutiques/PTG"),
        miseAJour({ nom: "Pouytenga centre", adresse: "Face à la gare", telephone: "70 11 22 33" }),
      ),
    );
  });

  it("le responsable ferme et rouvre une boutique", async () => {
    await assertSucceeds(
      updateDoc(doc(responsable(), "boutiques/PTG"), miseAJour({ actif: false })),
    );
  });

  it("le code ne se réécrit pas — des reçus le portent déjà", async () => {
    await assertFails(updateDoc(doc(responsable(), "boutiques/PTG"), miseAJour({ code: "PTX" })));
  });

  it("la trace de création ne se réécrit pas", async () => {
    await assertFails(
      updateDoc(doc(responsable(), "boutiques/PTG"), miseAJour({ createdBy: "ger-1" })),
    );
    await assertFails(
      updateDoc(
        doc(responsable(), "boutiques/PTG"),
        miseAJour({ createdAt: new Date("2020-01-01T00:00:00Z") }),
      ),
    );
  });

  it("la date de modification est celle du serveur, pas celle du client", async () => {
    await assertFails(
      updateDoc(doc(responsable(), "boutiques/PTG"), {
        nom: "Pouytenga centre",
        updatedAt: new Date("2020-01-01T00:00:00Z"),
        updatedBy: "resp-1",
        updatedByName: "Responsable SDI",
      }),
    );
  });

  it("un gérant ne modifie pas sa boutique, même pour corriger un téléphone", async () => {
    await assertFails(
      updateDoc(doc(gerant(), "boutiques/PTG"), miseAJour({ telephone: "70 99 99 99" }, "ger-1")),
    );
  });

  it("un gérant ne se rouvre pas une boutique fermée", async () => {
    await env.withSecurityRulesDisabled(async (contexte) => {
      await updateDoc(doc(contexte.firestore(), "boutiques/PTG"), { actif: false });
    });
    await assertFails(updateDoc(doc(gerant(), "boutiques/PTG"), miseAJour({ actif: true }, "ger-1")));
  });
});

describe("suppression", () => {
  it("personne ne supprime une boutique — son code vit dans des numéros de reçus", async () => {
    await assertFails(deleteDoc(doc(responsable(), "boutiques/PTG")));
    await assertFails(deleteDoc(doc(gerant(), "boutiques/PTG")));
  });
});
