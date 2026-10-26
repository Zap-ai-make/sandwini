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
 * Règles du registre des CMC retirés (26 octobre 2026).
 *
 * Les tests qui ne peuvent pas manquer : **un gérant ne lit pas le registre
 * d'un autre comptoir**, et **une ligne ne s'efface pas**. Le reste — les
 * champs exigés — protège la seule chose que la ligne doit prouver : qu'un
 * papier identifiable est sorti, remis à quelqu'un d'identifiable.
 */

let env: RulesTestEnvironment;
const HOTE = "127.0.0.1";
const PORT = 8181;

const responsable = () => env.authenticatedContext("resp-1", { role: "responsable" }).firestore();
const gerant = (uid = "ger-1", boutiqueId = "PTG") =>
  env.authenticatedContext(uid, { role: "gerant", boutiqueId }).firestore();
const anonyme = () => env.unauthenticatedContext().firestore();

const audit = (auteur = "ger-1") => ({
  createdAt: serverTimestamp(),
  createdBy: auteur,
  createdByName: "Auteur",
  updatedAt: serverTimestamp(),
  updatedBy: auteur,
  updatedByName: "Auteur",
});

const retrait = (partie: Record<string, unknown> = {}) => ({
  boutiqueId: "PTG",
  nom: "Yameogo",
  prenom: "Lassane",
  telephone: "70760240",
  numeroMoto: "MH8DL15AZTJ506023",
  date: new Date("2026-10-26T09:00:00Z"),
  ...audit(),
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
    projectId: "sdi-regles-retraits-cmc",
    firestore: { rules: readFileSync("firestore.rules", "utf8"), host: HOTE, port: PORT },
  });
});

afterAll(async () => {
  await env?.cleanup();
});

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), "retraitsCmc/r-ptg"), retrait());
    await setDoc(doc(ctx.firestore(), "retraitsCmc/r-kdg"), retrait({ boutiqueId: "KDG" }));
  });
});

describe("qui écrit au registre", () => {
  it("laisse le gérant inscrire un retrait dans sa boutique", async () => {
    await assertSucceeds(setDoc(doc(gerant(), "retraitsCmc/neuf"), retrait()));
  });

  it("laisse le responsable inscrire partout", async () => {
    await assertSucceeds(
      setDoc(doc(responsable(), "retraitsCmc/neuf"), retrait({ boutiqueId: "KDG", ...audit("resp-1") })),
    );
  });

  /* **On pousse chez soi, jamais chez le voisin.** Une ligne inscrite dans le
     registre d'un autre comptoir ferait croire à ce comptoir qu'il a remis un
     papier qu'il n'a jamais eu en main. */
  it("refuse au gérant d’inscrire dans une autre boutique", async () => {
    await assertFails(setDoc(doc(gerant(), "retraitsCmc/neuf"), retrait({ boutiqueId: "KDG" })));
  });

  it("refuse un visiteur non connecté", async () => {
    await assertFails(setDoc(doc(anonyme(), "retraitsCmc/neuf"), retrait()));
  });
});

describe("ce qu’une ligne doit porter", () => {
  /* Sans nom, la ligne ne désigne personne ; sans numéro de moto, elle ne dit
     pas quel papier est sorti. Dans les deux cas elle ne prouve rien. */
  it("refuse une ligne sans nom", async () => {
    await assertFails(setDoc(doc(gerant(), "retraitsCmc/neuf"), retrait({ nom: "" })));
  });

  it("refuse une ligne sans numéro de moto", async () => {
    await assertFails(setDoc(doc(gerant(), "retraitsCmc/neuf"), retrait({ numeroMoto: "" })));
  });

  it("accepte un prénom et un téléphone vides", async () => {
    /* Le comptoir ne refuse pas un CMC à qui n'a pas de téléphone. */
    await assertSucceeds(
      setDoc(doc(gerant(), "retraitsCmc/neuf"), retrait({ prenom: "", telephone: "" })),
    );
  });

  it("refuse un champ inconnu", async () => {
    await assertFails(setDoc(doc(gerant(), "retraitsCmc/neuf"), retrait({ montant: 1000 })));
  });

  it("refuse une date qui n’en est pas une", async () => {
    await assertFails(setDoc(doc(gerant(), "retraitsCmc/neuf"), retrait({ date: "26/10/2026" })));
  });

  it("refuse un nom trop long", async () => {
    await assertFails(setDoc(doc(gerant(), "retraitsCmc/neuf"), retrait({ nom: "x".repeat(81) })));
  });
});

describe("qui lit le registre", () => {
  it("laisse le gérant lire son registre", async () => {
    await assertSucceeds(getDoc(doc(gerant(), "retraitsCmc/r-ptg")));
  });

  /* Le cloisonnement des comptoirs : un gérant ne sait pas qui est passé
     ailleurs, pas plus qu'il ne voit les ventes d'ailleurs. */
  it("ferme au gérant le registre d’une autre boutique", async () => {
    await assertFails(getDoc(doc(gerant(), "retraitsCmc/r-kdg")));
  });

  it("laisse le responsable lire partout", async () => {
    await assertSucceeds(getDoc(doc(responsable(), "retraitsCmc/r-kdg")));
  });
});

describe("corriger et effacer", () => {
  it("laisse corriger une faute de frappe", async () => {
    await assertSucceeds(
      updateDoc(doc(gerant(), "retraitsCmc/r-ptg"), {
        nom: "Yaméogo",
        updatedAt: serverTimestamp(),
        updatedBy: "ger-1",
        updatedByName: "Auteur",
      }),
    );
  });

  /* La ligne appartient au comptoir qui a remis le papier : la déplacer la
     ferait disparaître de son registre. */
  it("refuse de changer la boutique d’une ligne", async () => {
    await assertFails(
      updateDoc(doc(gerant(), "retraitsCmc/r-ptg"), {
        boutiqueId: "KDG",
        updatedAt: serverTimestamp(),
        updatedBy: "ger-1",
        updatedByName: "Auteur",
      }),
    );
  });

  /* **Un registre ne s'efface pas. C'est ce qui en fait un registre.** */
  it("refuse la suppression, au gérant comme au responsable", async () => {
    await assertFails(deleteDoc(doc(gerant(), "retraitsCmc/r-ptg")));
    await assertFails(deleteDoc(doc(responsable(), "retraitsCmc/r-ptg")));
  });
});
