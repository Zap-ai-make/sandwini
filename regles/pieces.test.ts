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
 * Règles sur les pièces détachées (S20).
 *
 * Trois frontières, et aucune n’est évidente.
 *
 * **Le prix d’achat d’une référence est hors de portée du gérant**, dans les
 * deux sens dès le premier jour. S39 a montré ce que coûte un cloisonnement
 * tenu en lecture et ouvert en écriture (D89) : ces tests le vérifient des deux
 * côtés plutôt que d’attendre qu’on le découvre.
 *
 * **Le catalogue appartient au responsable**, le stock au comptoir. Un gérant
 * écrit des mouvements et ne touche pas aux références — une référence porte un
 * prix, et les prix appartiennent à la supervision.
 *
 * **Un mouvement ne se corrige pas.** La quantité étant la somme des
 * mouvements, retoucher l’un d’eux déplacerait un total sans laisser de trace.
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
  createdBy: "resp-1",
  createdByName: "Auteur",
  updatedAt: new Date("2026-01-01T08:00:00Z"),
  updatedBy: "resp-1",
  updatedByName: "Auteur",
};

const modification = (champs: Record<string, unknown>, auteur = "resp-1") => ({
  ...champs,
  updatedAt: serverTimestamp(),
  updatedBy: auteur,
  updatedByName: "Auteur",
});

const piece = (partie: Record<string, unknown> = {}, auteur = "resp-1") => ({
  reference: "PLQ-0142",
  designation: "Plaquette de frein avant",
  categorie: "Freinage",
  prixVente: 3_500,
  seuilAlerte: 5,
  actif: true,
  ...audit(auteur),
  ...partie,
});

const mouvement = (partie: Record<string, unknown> = {}, auteur = "ger-1") => ({
  boutiqueId: "PTG",
  pieceId: "plaquette",
  type: "entree",
  quantite: 10,
  note: "",
  date: new Date("2026-09-01T09:00:00Z"),
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
    projectId: "sdi-regles-pieces",
    firestore: { rules: readFileSync("firestore.rules", "utf8"), host: HOTE, port: PORT },
  });
});

afterAll(async () => env?.cleanup());

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (contexte) => {
    const base = contexte.firestore();
    await setDoc(doc(base, "pieces/plaquette"), {
      reference: "PLQ-0142",
      designation: "Plaquette de frein avant",
      categorie: "Freinage",
      prixVente: 3_500,
      seuilAlerte: 5,
      actif: true,
      ...auditFige,
    });
    await setDoc(doc(base, "pieces/plaquette/prive/cout"), {
      prixAchat: 2_000,
      updatedAt: new Date("2026-01-01T08:00:00Z"),
      updatedBy: "resp-1",
      updatedByName: "Auteur",
    });
    await setDoc(doc(base, "mouvementsPieces/m-ptg"), {
      boutiqueId: "PTG",
      pieceId: "plaquette",
      type: "entree",
      quantite: 40,
      note: "",
      date: new Date("2026-09-01T09:00:00Z"),
      ...auditFige,
    });
    await setDoc(doc(base, "mouvementsPieces/m-kdg"), {
      boutiqueId: "KDG",
      pieceId: "plaquette",
      type: "entree",
      quantite: 12,
      note: "",
      date: new Date("2026-09-01T09:00:00Z"),
      ...auditFige,
    });
  });
});

describe("le prix d’achat d’une référence", () => {
  it("le gérant ne le lit pas", async () => {
    await assertFails(getDoc(doc(gerant(), "pieces/plaquette/prive/cout")));
    await assertFails(getDocs(collection(gerant(), "pieces/plaquette/prive")));
  });

  /* L’autre moitié, et c’est celle qui manquait aux motos jusqu’à S39 : un
     cloisonnement tenu d’un seul côté n’est pas un cloisonnement (D89). */
  it("et ne l’écrit pas non plus", async () => {
    await assertFails(
      setDoc(doc(gerant(), "pieces/plaquette/prive/cout"), {
        prixAchat: 1,
        updatedAt: serverTimestamp(),
        updatedBy: "ger-1",
        updatedByName: "Gérant",
      }),
    );
  });

  it("le responsable le lit et le pose", async () => {
    await assertSucceeds(getDoc(doc(responsable(), "pieces/plaquette/prive/cout")));
    await assertSucceeds(
      setDoc(doc(responsable(), "pieces/plaquette/prive/cout"), {
        prixAchat: 2_100,
        updatedAt: serverTimestamp(),
        updatedBy: "resp-1",
        updatedByName: "Responsable",
      }),
    );
  });

  it("personne ne l’efface", async () => {
    await assertFails(deleteDoc(doc(responsable(), "pieces/plaquette/prive/cout")));
  });
});

describe("le catalogue", () => {
  it("tout le monde le lit : le comptoir vend avec", async () => {
    await assertSucceeds(getDocs(collection(gerant(), "pieces")));
    await assertSucceeds(getDoc(doc(gerant(), "pieces/plaquette")));
  });

  it("un anonyme ne lit rien", async () => {
    const anonyme = env.unauthenticatedContext().firestore();
    await assertFails(getDocs(collection(anonyme, "pieces")));
  });

  it("le responsable crée et corrige une référence", async () => {
    await assertSucceeds(addDoc(collection(responsable(), "pieces"), piece({ reference: "CHN-0088" })));
    await assertSucceeds(
      updateDoc(doc(responsable(), "pieces/plaquette"), modification({ prixVente: 3_800 })),
    );
  });

  /* La frontière avec les marques, et elle est volontaire : un gérant tape une
     marque manquante sur son formulaire (D90), mais pas une référence — une
     référence porte un prix. */
  it("le gérant n’en crée ni n’en corrige aucune", async () => {
    await assertFails(
      addDoc(collection(gerant(), "pieces"), piece({ reference: "CHN-0088" }, "ger-1")),
    );
    await assertFails(
      updateDoc(doc(gerant(), "pieces/plaquette"), modification({ prixVente: 1 }, "ger-1")),
    );
  });

  it("accepte une référence sans prix : elle existe et ne se vend pas", async () => {
    await assertSucceeds(
      addDoc(collection(responsable(), "pieces"), piece({ reference: "FLT-0003", prixVente: null })),
    );
  });

  /* Firestore ne masque pas un champ : un prix d’achat posé sur le document
     public serait lisible par tout gérant. La règle le refuse explicitement
     plutôt que de compter sur la discipline (D2). */
  it("refuse un prix d’achat glissé dans le document public", async () => {
    await assertFails(
      addDoc(collection(responsable(), "pieces"), piece({ reference: "X-1", prixAchat: 2_000 })),
    );
  });

  it("refuse une référence vide, une désignation vide, un seuil négatif", async () => {
    await assertFails(addDoc(collection(responsable(), "pieces"), piece({ reference: "" })));
    await assertFails(addDoc(collection(responsable(), "pieces"), piece({ designation: "" })));
    await assertFails(addDoc(collection(responsable(), "pieces"), piece({ seuilAlerte: -1 })));
  });

  it("refuse un montant décimal — le FCFA ne se divise pas", async () => {
    await assertFails(addDoc(collection(responsable(), "pieces"), piece({ prixVente: 3_500.5 })));
  });

  it("rien ne se supprime : des mouvements citent leur pièce", async () => {
    await assertFails(deleteDoc(doc(responsable(), "pieces/plaquette")));
  });
});

describe("les mouvements", () => {
  it("le gérant interroge les mouvements de sa boutique, et de la sienne seulement", async () => {
    const base = gerant();
    await assertSucceeds(
      getDocs(query(collection(base, "mouvementsPieces"), where("boutiqueId", "==", "PTG"))),
    );
    await assertFails(
      getDocs(query(collection(base, "mouvementsPieces"), where("boutiqueId", "==", "KDG"))),
    );
    // Sans filtre, la requête ramasserait tout : refusée.
    await assertFails(getDocs(collection(base, "mouvementsPieces")));
  });

  it("le responsable lit tous les mouvements, toutes boutiques", async () => {
    await assertSucceeds(getDocs(collection(responsable(), "mouvementsPieces")));
  });

  it("le gérant écrit une entrée et une sortie dans sa boutique", async () => {
    await assertSucceeds(addDoc(collection(gerant(), "mouvementsPieces"), mouvement()));
    await assertSucceeds(
      addDoc(collection(gerant(), "mouvementsPieces"), mouvement({ type: "sortie_autre", quantite: 2 })),
    );
  });

  it("le gérant n’écrit pas dans une autre boutique", async () => {
    await assertFails(
      addDoc(collection(gerant(), "mouvementsPieces"), mouvement({ boutiqueId: "KDG" })),
    );
  });

  /* Le sens vient du type, jamais du nombre : une quantité négative écrite à la
     main est une faute de frappe qui ne se voit pas. */
  it("refuse une quantité nulle ou négative", async () => {
    await assertFails(addDoc(collection(gerant(), "mouvementsPieces"), mouvement({ quantite: 0 })));
    await assertFails(addDoc(collection(gerant(), "mouvementsPieces"), mouvement({ quantite: -5 })));
  });

  it("refuse un type inventé", async () => {
    await assertFails(
      addDoc(collection(gerant(), "mouvementsPieces"), mouvement({ type: "sortie_magique" })),
    );
  });

  it("refuse un mouvement sur une pièce qui n’existe pas", async () => {
    await assertFails(
      addDoc(collection(gerant(), "mouvementsPieces"), mouvement({ pieceId: "fantome" })),
    );
  });

  it("refuse une date dans le futur — une horloge déréglée fausserait le stock", async () => {
    const demain = new Date(Date.now() + 3 * 24 * 3600 * 1000);
    await assertFails(addDoc(collection(gerant(), "mouvementsPieces"), mouvement({ date: demain })));
  });

  it("accepte une date passée : le lot saisi hors ligne lundi est entré lundi", async () => {
    const lundi = new Date(Date.now() - 3 * 24 * 3600 * 1000);
    await assertSucceeds(
      addDoc(collection(gerant(), "mouvementsPieces"), mouvement({ date: lundi })),
    );
  });

  /* Un mouvement est un fait. La quantité étant leur somme, retoucher l’un
     d’eux déplacerait un total sans laisser de trace : on corrige par un
     mouvement inverse, qui se voit. */
  it("ne se corrige ni ne s’efface, par personne", async () => {
    await assertFails(
      updateDoc(doc(gerant(), "mouvementsPieces/m-ptg"), modification({ quantite: 1 }, "ger-1")),
    );
    await assertFails(
      updateDoc(doc(responsable(), "mouvementsPieces/m-ptg"), modification({ quantite: 1 })),
    );
    await assertFails(deleteDoc(doc(responsable(), "mouvementsPieces/m-ptg")));
  });
});

describe("ce que le modèle ne contient pas", () => {
  /* La collection du cahier des charges (§5.7) n’existe pas : la quantité se
     compte à la lecture depuis les mouvements (D61). Ce test fige l’absence —
     sans lui, quelqu’un rouvrirait la porte en croyant boucher un trou, et
     l’écran recommencerait à mentir hors ligne. */
  it("aucune collection stockPieces : la quantité se compte, elle ne se stocke pas", async () => {
    await assertFails(
      setDoc(doc(responsable(), "stockPieces/PTG_plaquette"), {
        boutiqueId: "PTG",
        pieceId: "plaquette",
        quantite: 40,
      }),
    );
    await assertFails(getDoc(doc(responsable(), "stockPieces/PTG_plaquette")));
  });

  /* Le référentiel de catégories que `prompt.md` §14 range dans les paramètres
     n’existe pas non plus : la catégorie est un mot libre porté par la pièce
     (D90). Deux mécanismes pour un besoin, c’est ce que D73 demande d’éviter. */
  it("aucun référentiel de catégories : la catégorie est un mot, pas une clé", async () => {
    await assertFails(
      addDoc(collection(responsable(), "categoriesPieces"), { nom: "Freinage", actif: true }),
    );
  });
});
