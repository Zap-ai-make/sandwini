import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { readFileSync } from "node:fs";
import { deleteDoc, doc, serverTimestamp, setDoc, updateDoc } from "firebase/firestore";
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";

/**
 * Règles sur le retour d'une vente de pièces (S67).
 *
 * **Un retour est une pièce comptable, immuable comme la vente qu'il défait.**
 * Il cite la vente, reprend ses lignes au prix figé, et porte le total
 * remboursé. Ces tests figent qui peut l'écrire, qu'il ne se retouche pas, que
 * son argent s'accorde avec son détail, et que les deux enums ouverts pour lui
 * — le type de mouvement `retour_vente` et l'origine d'encaissement
 * `remboursement_piece` — sont bien acceptés.
 */

let env: RulesTestEnvironment;

const HOTE = "127.0.0.1";
const PORT = 8181;

const responsable = () => env.authenticatedContext("resp-1", { role: "responsable" }).firestore();
const gerant = (uid = "ger-1", boutiqueId = "PTG") =>
  env.authenticatedContext(uid, { role: "gerant", boutiqueId }).firestore();
const anonyme = () => env.unauthenticatedContext().firestore();

const audit = (auteur: string) => ({
  createdAt: serverTimestamp(),
  createdBy: auteur,
  createdByName: "Auteur",
  updatedAt: serverTimestamp(),
  updatedBy: auteur,
  updatedByName: "Auteur",
});

const ligne = (partie: Record<string, unknown> = {}) => ({
  pieceId: "plaquette",
  reference: "PLQ-0142",
  designation: "Plaquette de frein avant",
  quantite: 2,
  prixUnitaire: 3_500,
  prixAchatUnitaire: 2_000,
  total: 7_000,
  ...partie,
});

const retour = (partie: Record<string, unknown> = {}, auteur = "ger-1") => ({
  venteId: "v1",
  venteNumero: "PTG-2609-0001",
  boutiqueId: "PTG",
  date: new Date("2026-09-02T09:00:00Z"),
  lignes: [ligne()],
  total: 7_000,
  moyenPaiement: "especes",
  motif: "Défaut",
  ...audit(auteur),
  ...partie,
});

const encaissementRemboursement = (partie: Record<string, unknown> = {}, auteur = "ger-1") => ({
  boutiqueId: "PTG",
  date: new Date("2026-09-02T09:00:00Z"),
  sens: "sortie",
  montant: 7_000,
  moyenPaiement: "especes",
  origine: "remboursement_piece",
  origineRefId: "r1",
  libelle: "Remboursement PTG-2609-0001",
  categorieTranches: false,
  ...audit(auteur),
  ...partie,
});

const mouvementRetour = (partie: Record<string, unknown> = {}, auteur = "ger-1") => ({
  boutiqueId: "PTG",
  pieceId: "plaquette",
  type: "retour_vente",
  quantite: 2,
  note: "Retour PTG-2609-0001",
  date: new Date("2026-09-02T09:00:00Z"),
  ...audit(auteur),
  ...partie,
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
    projectId: "sdi-regles-retour-pieces",
    firestore: { rules: readFileSync("firestore.rules", "utf8"), host: HOTE, port: PORT },
  });
});

afterAll(async () => env?.cleanup());

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (contexte) => {
    await setDoc(doc(contexte.firestore(), "pieces/plaquette"), {
      reference: "PLQ-0142",
      designation: "Plaquette de frein avant",
      categorie: "Freinage",
      boutiqueId: "PTG",
      prixVente: 3_500,
      prixAchat: 2_000,
      seuilAlerte: 5,
      actif: true,
      createdAt: new Date("2026-01-01T08:00:00Z"),
      createdBy: "resp-1",
      createdByName: "Auteur",
      updatedAt: new Date("2026-01-01T08:00:00Z"),
      updatedBy: "resp-1",
      updatedByName: "Auteur",
    });
  });
});

describe("qui peut enregistrer un retour", () => {
  it("le gérant de la boutique le crée : c’est son comptoir", async () => {
    await assertSucceeds(setDoc(doc(gerant(), "retoursPieces/r1"), retour()));
  });

  it("le responsable aussi", async () => {
    await assertSucceeds(setDoc(doc(responsable(), "retoursPieces/r1"), retour({}, "resp-1")));
  });

  it("le gérant d’une autre boutique ne reprend pas ici", async () => {
    await assertFails(
      setDoc(doc(gerant("ger-2", "OUA"), "retoursPieces/r1"), retour({}, "ger-2")),
    );
  });

  it("un visiteur anonyme n’écrit rien", async () => {
    await assertFails(setDoc(doc(anonyme(), "retoursPieces/r1"), retour({}, "personne")));
  });
});

describe("un retour ne se retouche pas", () => {
  beforeEach(async () => {
    await env.withSecurityRulesDisabled(async (contexte) => {
      await setDoc(doc(contexte.firestore(), "retoursPieces/r1"), retour());
    });
  });

  it("ne se modifie pas", async () => {
    await assertFails(updateDoc(doc(gerant(), "retoursPieces/r1"), { total: 1 }));
  });

  it("ne se supprime pas", async () => {
    await assertFails(deleteDoc(doc(gerant(), "retoursPieces/r1")));
  });
});

describe("l’argent du retour s’accorde avec son détail", () => {
  it("refuse un total qui ne somme pas", async () => {
    await assertFails(setDoc(doc(gerant(), "retoursPieces/r1"), retour({ total: 1 })));
  });

  it("refuse une liste de lignes vide", async () => {
    await assertFails(setDoc(doc(gerant(), "retoursPieces/r1"), retour({ lignes: [], total: 0 })));
  });

  it("refuse une ligne dont le total n’est pas entier positif (elle empoisonne la somme)", async () => {
    await assertFails(
      setDoc(
        doc(gerant(), "retoursPieces/r1"),
        retour({ lignes: [ligne({ total: 0, quantite: 0 })], total: 0 }),
      ),
    );
  });

  it("refuse un motif trop long", async () => {
    await assertFails(
      setDoc(doc(gerant(), "retoursPieces/r1"), retour({ motif: "x".repeat(121) })),
    );
  });

  it("refuse un moyen de paiement inconnu", async () => {
    await assertFails(
      setDoc(doc(gerant(), "retoursPieces/r1"), retour({ moyenPaiement: "troc" })),
    );
  });
});

describe("les deux enums ouverts pour le retour", () => {
  it("accepte un mouvement de type retour_vente", async () => {
    await assertSucceeds(setDoc(doc(gerant(), "mouvementsPieces/m1"), mouvementRetour()));
  });

  it("accepte un encaissement d’origine remboursement_piece en sortie", async () => {
    await assertSucceeds(
      setDoc(doc(gerant(), "encaissements/e1"), encaissementRemboursement()),
    );
  });
});
