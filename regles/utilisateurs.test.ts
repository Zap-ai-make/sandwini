import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { readFileSync } from "node:fs";
import { deleteDoc, doc, getDoc, getDocs, collection, setDoc, updateDoc } from "firebase/firestore";
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";

/**
 * Règles sur les comptes utilisateurs (S2).
 *
 * L’enjeu tient en une phrase : **le rôle ne doit jamais être modifiable depuis
 * un navigateur**. Le document `users/{uid}` n’est qu’un miroir lisible ; les
 * droits vivent dans le custom claim, posé par une Cloud Function.
 *
 * Ces tests vérifient donc surtout des refus. C’est normal : la valeur d’une
 * règle se mesure à ce qu’elle empêche.
 */

let env: RulesTestEnvironment;

const HOTE = "127.0.0.1";
const PORT = 8181;

const responsable = () => env.authenticatedContext("resp-1", { role: "responsable" }).firestore();
const gerant = (uid = "ger-1", boutiqueId = "PTG") =>
  env.authenticatedContext(uid, { role: "gerant", boutiqueId }).firestore();

const fiche = (nom: string, role: string, boutiqueId: string | null = null) => ({
  nom,
  email: `${nom}@sdi.test`,
  role,
  boutiqueId,
  actif: true,
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
    projectId: "sdi-regles-utilisateurs",
    firestore: { rules: readFileSync("firestore.rules", "utf8"), host: HOTE, port: PORT },
  });
});

afterAll(async () => env?.cleanup());

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (contexte) => {
    const base = contexte.firestore();
    await setDoc(doc(base, "users/resp-1"), fiche("resp", "responsable"));
    await setDoc(doc(base, "users/ger-1"), fiche("ger1", "gerant", "PTG"));
    await setDoc(doc(base, "users/ger-2"), fiche("ger2", "gerant", "KDG"));
  });
});

describe("lecture des comptes", () => {
  it("le responsable lit toute la liste", async () => {
    await assertSucceeds(getDocs(collection(responsable(), "users")));
  });

  it("un gérant lit sa propre fiche", async () => {
    await assertSucceeds(getDoc(doc(gerant(), "users/ger-1")));
  });

  it("un gérant ne lit pas la fiche d’un collègue", async () => {
    await assertFails(getDoc(doc(gerant(), "users/ger-2")));
  });

  it("un gérant ne parcourt pas la liste des comptes", async () => {
    await assertFails(getDocs(collection(gerant(), "users")));
  });

  it("un anonyme ne lit rien du tout", async () => {
    const anonyme = env.unauthenticatedContext().firestore();
    await assertFails(getDoc(doc(anonyme, "users/ger-1")));
    await assertFails(getDocs(collection(anonyme, "users")));
  });
});

describe("écriture des comptes — interdite à tous depuis le navigateur", () => {
  it("un gérant ne se promeut pas responsable", async () => {
    await assertFails(updateDoc(doc(gerant(), "users/ger-1"), { role: "responsable" }));
  });

  it("un gérant ne change pas sa boutique pour voir celle d’à côté", async () => {
    await assertFails(updateDoc(doc(gerant(), "users/ger-1"), { boutiqueId: "KDG" }));
  });

  it("un gérant ne se réactive pas lui-même après désactivation", async () => {
    await env.withSecurityRulesDisabled(async (contexte) => {
      await updateDoc(doc(contexte.firestore(), "users/ger-1"), { actif: false });
    });
    await assertFails(updateDoc(doc(gerant(), "users/ger-1"), { actif: true }));
  });

  it("le responsable lui-même n’écrit pas dans users — seule une Cloud Function le fait", async () => {
    await assertFails(updateDoc(doc(responsable(), "users/ger-1"), { nom: "Renommé" }));
    await assertFails(setDoc(doc(responsable(), "users/nouveau"), fiche("x", "gerant")));
    await assertFails(deleteDoc(doc(responsable(), "users/ger-1")));
  });

  it("personne ne crée un compte responsable en s’inventant un document", async () => {
    await assertFails(setDoc(doc(gerant("intrus"), "users/intrus"), fiche("intrus", "responsable")));
  });

  it("un compte n’est jamais supprimé — l’historique doit rester lisible", async () => {
    await assertFails(deleteDoc(doc(gerant(), "users/ger-1")));
  });
});

describe("le claim fait autorité, pas le document", () => {
  it("un gérant dont le document dit « responsable » reste un gérant", async () => {
    // Le document est falsifié directement en base ; seul le claim compte.
    await env.withSecurityRulesDisabled(async (contexte) => {
      await updateDoc(doc(contexte.firestore(), "users/ger-1"), { role: "responsable" });
    });
    await assertFails(getDocs(collection(gerant(), "users")));
  });

  it("un compte sans claim de rôle n’obtient rien de plus qu’un anonyme", async () => {
    const sansRole = env.authenticatedContext("sans-role").firestore();
    await assertFails(getDocs(collection(sansRole, "users")));
    await assertFails(getDoc(doc(sansRole, "users/ger-1")));
  });
});
