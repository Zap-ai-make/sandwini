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
  serverTimestamp,
  setDoc,
  updateDoc,
} from "firebase/firestore";
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";

/**
 * Règles sur le fichier clients (S6).
 *
 * Cette collection est l’exception du projet : **elle n’est pas cloisonnée par
 * boutique** (D16). Ces tests servent donc surtout à border l’exception — un
 * gérant lit et écrit des clients, mais un anonyme n’a toujours rien, et le
 * contrat de forme tient, parce que c’est lui qui garantit qu’un client se
 * retrouve au lieu de se recréer.
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

const client = (partie: Record<string, unknown> = {}, auteur = "ger-1") => ({
  nom: "Ouédraogo Salif",
  nomNormalise: "ouedraogo salif",
  telephone: "70 12 34 56",
  telephoneNormalise: "+22670123456",
  telephone2: "",
  adresse: "",
  note: "",
  ...audit(auteur),
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
    projectId: "sdi-regles-clients",
    firestore: { rules: readFileSync("firestore.rules", "utf8"), host: HOTE, port: PORT },
  });
});

afterAll(async () => env?.cleanup());

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (contexte) => {
    await setDoc(doc(contexte.firestore(), "clients/salif"), {
      nom: "Ouédraogo Salif",
      nomNormalise: "ouedraogo salif",
      telephone: "70 12 34 56",
      telephoneNormalise: "+22670123456",
      telephone2: "",
      adresse: "",
      note: "",
      ...auditFige,
    });
  });
});

describe("le fichier est commun à toutes les boutiques", () => {
  it("un gérant lit tout le fichier, quelle que soit sa boutique", async () => {
    await assertSucceeds(getDocs(collection(gerant("ger-2", "KDG"), "clients")));
    await assertSucceeds(getDoc(doc(gerant("ger-2", "KDG"), "clients/salif")));
  });

  it("le responsable aussi", async () => {
    await assertSucceeds(getDocs(collection(responsable(), "clients")));
  });

  it("un anonyme n’a toujours rien", async () => {
    const anonyme = env.unauthenticatedContext().firestore();
    await assertFails(getDocs(collection(anonyme, "clients")));
    await assertFails(getDoc(doc(anonyme, "clients/salif")));
    await assertFails(addDoc(collection(anonyme, "clients"), client({}, "personne")));
  });
});

describe("création", () => {
  it("un gérant crée un client — c’est le geste de la vente au comptoir", async () => {
    await assertSucceeds(addDoc(collection(gerant(), "clients"), client()));
  });

  it("le responsable aussi", async () => {
    await assertSucceeds(addDoc(collection(responsable(), "clients"), client({}, "resp-1")));
  });

  it("exige un nom et un téléphone", async () => {
    await assertFails(addDoc(collection(gerant(), "clients"), client({ nom: "" })));
    await assertFails(addDoc(collection(gerant(), "clients"), client({ telephone: "" })));
  });

  it("exige la forme normalisée du numéro — sans elle, le client ne se retrouve pas", async () => {
    await assertFails(addDoc(collection(gerant(), "clients"), client({ telephoneNormalise: "" })));
  });

  it("refuse un champ hors contrat", async () => {
    await assertFails(addDoc(collection(gerant(), "clients"), client({ boutiqueId: "PTG" })));
    await assertFails(addDoc(collection(gerant(), "clients"), client({ solde: 100000 })));
  });

  it("refuse de signer la création au nom de quelqu’un d’autre", async () => {
    await assertFails(addDoc(collection(gerant(), "clients"), client({}, "resp-1")));
  });
});

/* S44 sépare le prénom du nom et ajoute le numéro de la pièce d'identité.
   Les deux champs sont **facultatifs au sens des règles**, et ce n'est pas un
   relâchement : `clientValide` tourne aussi à la modification, et tout le
   fichier d'avant S44 deviendrait incorrigible s'ils étaient exigés. */
describe("le prénom et la pièce d’identité (S44)", () => {
  const NIP = "12345678901234567";

  it("accepte une fiche neuve, prénom et NIP compris", async () => {
    await assertSucceeds(
      addDoc(
        collection(gerant(), "clients"),
        client({ nom: "Ouédraogo", prenom: "Salif", nip: NIP, nomNormalise: "ouedraogo salif" }),
      ),
    );
  });

  /* La rétro-compatibilité, prouvée plutôt qu'affirmée : la fixture `client()`
     est exactement une fiche d'avant S44 — ni `prenom`, ni `nip`. */
  it("accepte une fiche d’avant S44, qui n’a ni l’un ni l’autre", async () => {
    await assertSucceeds(addDoc(collection(gerant(), "clients"), client()));
  });

  it("accepte un NIP vide — le client a pu oublier sa carte", async () => {
    await assertSucceeds(addDoc(collection(gerant(), "clients"), client({ nip: "" })));
  });

  it("refuse un NIP qui n’a pas dix-sept chiffres", async () => {
    await assertFails(addDoc(collection(gerant(), "clients"), client({ nip: "1234567890123456" })));
    await assertFails(
      addDoc(collection(gerant(), "clients"), client({ nip: "123456789012345678" })),
    );
  });

  it("refuse un NIP qui n’est pas fait que de chiffres", async () => {
    await assertFails(addDoc(collection(gerant(), "clients"), client({ nip: "B234567890123456" })));
  });

  /* La forme cherchée porte maintenant le nom **et** le prénom : sa borne a
     grandi en conséquence, et elle doit tenir les deux champs pleins. */
  it("accepte une forme cherchée qui réunit un nom et un prénom longs", async () => {
    await assertSucceeds(
      addDoc(
        collection(gerant(), "clients"),
        client({
          nom: "n".repeat(80),
          prenom: "p".repeat(80),
          nomNormalise: `${"n".repeat(80)} ${"p".repeat(80)}`,
        }),
      ),
    );
  });

  it("refuse un prénom trop long", async () => {
    await assertFails(addDoc(collection(gerant(), "clients"), client({ prenom: "p".repeat(81) })));
  });

  it("corrige une fiche d’avant S44 en lui ajoutant son prénom", async () => {
    await assertSucceeds(
      updateDoc(
        doc(gerant(), "clients/salif"),
        modification({ nom: "Ouédraogo", prenom: "Salif", nomNormalise: "ouedraogo salif" }),
      ),
    );
  });
});

describe("correction", () => {
  it("un gérant corrige un numéro mal noté", async () => {
    await assertSucceeds(
      updateDoc(
        doc(gerant(), "clients/salif"),
        modification({ telephone: "70 12 34 57", telephoneNormalise: "+22670123457" }),
      ),
    );
  });

  it("la trace de création ne se réécrit pas", async () => {
    await assertFails(
      updateDoc(doc(gerant(), "clients/salif"), modification({ createdBy: "resp-1" })),
    );
  });

  it("la date de modification est celle du serveur", async () => {
    await assertFails(
      updateDoc(doc(gerant(), "clients/salif"), {
        nom: "Ouédraogo S.",
        updatedAt: new Date("2020-01-01T00:00:00Z"),
        updatedBy: "ger-1",
        updatedByName: "Auteur",
      }),
    );
  });

  it("un client ne se supprime jamais — des ventes le citent", async () => {
    await assertFails(deleteDoc(doc(gerant(), "clients/salif")));
    await assertFails(deleteDoc(doc(responsable(), "clients/salif")));
  });
});
