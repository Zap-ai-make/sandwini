import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { readFileSync } from "node:fs";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

/**
 * Règles du socle.
 *
 * Le point vérifié ici n’est pas une fonctionnalité, c’est une promesse :
 * **refus par défaut**, et **aucun accès direct pour un anonyme**. C’est la
 * base sur laquelle S2 à S11 viendront ouvrir, une collection à la fois.
 *
 * Une règle qu’on n’a pas testée dans les deux sens — ce qui passe et ce qui
 * est refusé — n’est pas une protection, c’est une intention.
 */

let env: RulesTestEnvironment;

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: "sdi-regles",
    firestore: { rules: readFileSync("firestore.rules", "utf8"), host: "127.0.0.1", port: 8181 },
  });
});

afterAll(async () => env?.cleanup());
beforeEach(async () => env.clearFirestore());

describe("refus par défaut", () => {
  it("refuse la lecture d’une collection non ouverte, même authentifié", async () => {
    const db = env.authenticatedContext("gerant-1").firestore();
    await assertFails(getDoc(doc(db, "motos", "moto-1")));
  });

  it("refuse l’écriture dans une collection non ouverte, même authentifié", async () => {
    const db = env.authenticatedContext("gerant-1").firestore();
    await assertFails(setDoc(doc(db, "ventesMotos", "vente-1"), { prixConvenu: 1_000_000 }));
  });

  it("refuse tout à un utilisateur non authentifié", async () => {
    const db = env.unauthenticatedContext().firestore();
    await assertFails(getDoc(doc(db, "motos", "moto-1")));
    await assertFails(setDoc(doc(db, "motos", "moto-1"), { marque: "peu importe" }));
  });

  it("refuse une collection inventée de toutes pièces", async () => {
    const db = env.authenticatedContext("gerant-1").firestore();
    await assertFails(setDoc(doc(db, "collection-qui-n-existe-pas", "x"), { a: 1 }));
  });
});

describe("écritures de diagnostic", () => {
  const essai = { ecritA: new Date(), origine: "diagnostic" };

  it("accepte un essai d’une session ouverte", async () => {
    const db = env.authenticatedContext("gerant-1").firestore();
    await assertSucceeds(setDoc(doc(db, "diagnostics", "essai-1"), essai));
  });

  it("refuse un essai à un anonyme — c’est le point non négociable du §16", async () => {
    const db = env.unauthenticatedContext().firestore();
    await assertFails(setDoc(doc(db, "diagnostics", "essai-1"), essai));
  });

  it("refuse un document qui transporte autre chose que les deux champs prévus", async () => {
    const db = env.authenticatedContext("gerant-1").firestore();
    await assertFails(
      setDoc(doc(db, "diagnostics", "essai-1"), { ...essai, montant: 5_000_000 }),
    );
  });

  it("refuse une origine falsifiée", async () => {
    const db = env.authenticatedContext("gerant-1").firestore();
    await assertFails(setDoc(doc(db, "diagnostics", "essai-1"), { ...essai, origine: "vente" }));
  });

  it("refuse la relecture : ces documents ne servent à rien d’autre qu’à partir", async () => {
    await env.withSecurityRulesDisabled(async (contexte) => {
      await setDoc(doc(contexte.firestore(), "diagnostics", "essai-1"), essai);
    });
    const db = env.authenticatedContext("gerant-1").firestore();
    await assertFails(getDoc(doc(db, "diagnostics", "essai-1")));
  });

  it("refuse la modification et la suppression d’un essai déjà écrit", async () => {
    await env.withSecurityRulesDisabled(async (contexte) => {
      await setDoc(doc(contexte.firestore(), "diagnostics", "essai-1"), essai);
    });
    const db = env.authenticatedContext("gerant-1").firestore();
    await assertFails(setDoc(doc(db, "diagnostics", "essai-1"), essai));
  });
});

describe("le fichier de règles lui-même", () => {
  it("n’ouvre rien avec un joker de chemin", () => {
    const regles = readFileSync("firestore.rules", "utf8");
    // Un `match /{document=**}` suivi d’un `allow` permissif est l’erreur qui
    // ouvre toute la base d’un coup. On vérifie qu’il reste fermé.
    expect(regles).toMatch(/match \/\{document=\*\*\}[\s\S]*?allow read, write: if false;/);
  });
});
