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
} from "firebase/firestore";
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";

/**
 * Les règles du paquet de cartes grises (S53).
 *
 * **Une trace de premier niveau, comme `transfertsMotos` (S17).** Un paquet se
 * liste par sa boutique sans requête de groupe de collections, et il ne se
 * modifie jamais : on corrige en faisant revenir les cartes, ce qui laisse les
 * deux traces.
 *
 * **Aucun champ d'état n'est accepté**, et ces tests le figent. Un paquet est
 * soldé quand aucune de ses cartes n'est plus dehors, ce qui se calcule
 * (`lib/domain/paquet.ts`). Un champ « rendu » dirait un jour le contraire de
 * ses propres documents, et il faudrait un geste pour les raccorder.
 */

let env: RulesTestEnvironment;

const HOTE = "127.0.0.1";
const PORT = 8181;

const responsable = () => env.authenticatedContext("resp-1", { role: "responsable" }).firestore();
const gerant = (uid = "ger-1", boutiqueId = "PTG") =>
  env.authenticatedContext(uid, { role: "gerant", boutiqueId }).firestore();

const audit = (uid = "ger-1") => ({
  createdAt: serverTimestamp(),
  createdBy: uid,
  createdByName: "Gérant",
  updatedAt: serverTimestamp(),
  updatedBy: uid,
  updatedByName: "Gérant",
});

const paquet = (partie: Record<string, unknown> = {}) => ({
  boutiqueId: "PTG",
  prestataireId: "p1",
  prestataireNom: "Ouédraogo Plaques",
  deposeLe: new Date("2026-10-15T12:00:00"),
  disponibleLe: null,
  avance: 150_000,
  venteIds: ["v1", "v2"],
  ...audit(),
  ...partie,
});

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: "sdi-regles-paquets",
    firestore: { rules: readFileSync("firestore.rules", "utf8"), host: HOTE, port: PORT },
  });
});

afterAll(async () => env?.cleanup());

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (contexte) => {
    const base = contexte.firestore();
    await setDoc(doc(base, "lotsCartesGrises/lot-ptg"), paquet());
    await setDoc(doc(base, "lotsCartesGrises/lot-kdg"), paquet({ boutiqueId: "KDG" }));
  });
});

describe("le paquet de cartes grises", () => {
  it("le gérant confie un paquet dans sa boutique", async () => {
    await assertSucceeds(addDoc(collection(gerant(), "lotsCartesGrises"), paquet()));
  });

  /* **Le critère de la spec, nommément.** Un gérant ne lit ni n'écrit le paquet
     d'une autre boutique. */
  it("refuse le paquet d’une autre boutique, en lecture comme en écriture", async () => {
    await assertFails(getDoc(doc(gerant(), "lotsCartesGrises/lot-kdg")));
    await assertFails(
      addDoc(collection(gerant(), "lotsCartesGrises"), paquet({ boutiqueId: "KDG" })),
    );
  });

  it("le responsable lit toutes les boutiques", async () => {
    await assertSucceeds(getDoc(doc(responsable(), "lotsCartesGrises/lot-kdg")));
  });

  it("le gérant liste les paquets de sa boutique", async () => {
    await assertSucceeds(
      getDocs(query(collection(gerant(), "lotsCartesGrises"), where("boutiqueId", "==", "PTG"))),
    );
  });

  it("refuse un paquet sans carte : l’avance partirait sans contrepartie", async () => {
    await assertFails(addDoc(collection(gerant(), "lotsCartesGrises"), paquet({ venteIds: [] })));
  });

  it("refuse une avance nulle — sans montant, c’est un crédit", async () => {
    await assertFails(addDoc(collection(gerant(), "lotsCartesGrises"), paquet({ avance: 0 })));
  });

  it("refuse un prestataire vide", async () => {
    await assertFails(
      addDoc(collection(gerant(), "lotsCartesGrises"), paquet({ prestataireId: "" })),
    );
  });

  /* Le champ d'état que cette spec refuse. Le test existe pour qu'une
     reconstitution bien intentionnée de « rendu » bute ici. */
  it("refuse un champ inventé, et « rendu » en particulier", async () => {
    await assertFails(addDoc(collection(gerant(), "lotsCartesGrises"), paquet({ rendu: true })));
  });

  /* Un paquet est un fait. Lui donner un état modifiable rouvrirait la
     contradiction que `etatPaquet` ferme en le calculant. */
  it("ne se modifie ni ne se supprime, pour personne", async () => {
    await assertFails(
      updateDoc(doc(responsable(), "lotsCartesGrises/lot-ptg"), {
        avance: 1,
        updatedAt: serverTimestamp(),
        updatedBy: "resp-1",
        updatedByName: "Responsable",
      }),
    );
    await assertFails(deleteDoc(doc(responsable(), "lotsCartesGrises/lot-ptg")));
  });
});
