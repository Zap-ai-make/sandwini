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
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

/**
 * Règles sur les pièces détachées (S20).
 *
 * Trois frontières, et aucune n’est évidente.
 *
 * **Le prix d'achat d'une pièce est visible du gérant**, et c'est l'inverse
 * d'une moto. Le commanditaire a tranché : « pour les pièces c'est complètement
 * différent, le responsable ne fera que superviser, rien d'autre — donc tout
 * est fait par le gérant ». Celui qui vend la bougie fixe son coût et lit sa
 * marge. L'ancien sous-dossier `prive/cout`, qu'aucun écran n'a jamais écrit,
 * est désormais fermé à tout le monde — un cloisonnement qui ne cloisonne plus
 * rien doit cesser de le prétendre.
 *
 * **Le catalogue appartient à la boutique qui le vend**, et non plus au
 * responsable. Chaque gérant tient ses références et ses prix ; le responsable
 * garde l'écriture pour ne pas rouvrir le trou de S55, mais son métier est de
 * regarder.
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
  boutiqueId: "PTG",
  prixVente: 3_500,
  prixAchat: 2_000,
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
    /* `boutiqueOuverte` lit la boutique : sans elle, aucune référence ne peut
       naître, et l'échec accuserait la propriété au lieu du décor. */
    await setDoc(doc(base, "boutiques/PTG"), { nom: "Pouytenga", actif: true, ...auditFige });
    await setDoc(doc(base, "boutiques/KDG"), { nom: "Koudougou", actif: true, ...auditFige });
    await setDoc(doc(base, "boutiques/FERMEE"), { nom: "Fermée", actif: false, ...auditFige });
    await setDoc(doc(base, "pieces/plaquette"), {
      reference: "PLQ-0142",
      designation: "Plaquette de frein avant",
      categorie: "Freinage",
      boutiqueId: "PTG",
      prixVente: 3_500,
      prixAchat: 2_000,
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

describe("le prix d’achat d’une pièce, que le gérant voit", () => {
  it("se lit sur la pièce elle-même, par celui qui la vend", async () => {
    /* Firestore ne masque pas un champ : poser le coût sur le document public
       le rend lisible par quiconque lit la pièce. C'est précisément ce que le
       commanditaire a voulu pour les pièces, et ce test le fige — sans quoi
       un retour au cloisonnement passerait pour une correction. */
    const instantane = await assertSucceeds(getDoc(doc(gerant(), "pieces/plaquette")));
    expect(instantane.data()?.prixAchat).toBe(2_000);
  });

  it("se pose et se corrige par le gérant de la boutique", async () => {
    await assertSucceeds(
      updateDoc(doc(gerant(), "pieces/plaquette"), modification({ prixAchat: 2_100 }, "ger-1")),
    );
  });

  it("reste facultatif : une caisse reçue dont la facture suit", async () => {
    await assertSucceeds(
      addDoc(collection(gerant(), "pieces"), piece({ reference: "X-9", prixAchat: null }, "ger-1")),
    );
  });

  it("refuse un coût décimal — le FCFA ne se divise pas", async () => {
    await assertFails(
      addDoc(collection(gerant(), "pieces"), piece({ reference: "X-8", prixAchat: 1.5 }, "ger-1")),
    );
  });

  /* L'ancien sous-dossier privé, fermé des deux côtés et pour tout le monde.
     Le laisser ouvert au responsable aurait entretenu deux endroits où lire un
     prix d'achat, dont un que plus rien n'écrit — la panne la plus pénible à
     diagnostiquer, six mois plus tard. */
  it("l’ancien sous-dossier privé ne s’ouvre plus à personne", async () => {
    await assertFails(getDoc(doc(gerant(), "pieces/plaquette/prive/cout")));
    await assertFails(getDoc(doc(responsable(), "pieces/plaquette/prive/cout")));
    await assertFails(
      setDoc(doc(responsable(), "pieces/plaquette/prive/cout"), { prixAchat: 1 }),
    );
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

  /* **Le gérant tient son catalogue, et c'est le renversement de S20.** Il ne
     pouvait ni créer ni corriger une référence, parce qu'une référence porte un
     prix. Le commanditaire a tranché l'inverse : pour les pièces, tout est fait
     par le gérant. */
  it("le gérant crée et corrige une référence dans sa boutique", async () => {
    await assertSucceeds(
      addDoc(collection(gerant(), "pieces"), piece({ reference: "CHN-0088" }, "ger-1")),
    );
    await assertSucceeds(
      updateDoc(doc(gerant(), "pieces/plaquette"), modification({ prixVente: 3_800 }, "ger-1")),
    );
  });

  it("mais pas dans celle d'un autre", async () => {
    /* La moitié qui compte : ouvrir l'écriture au gérant sans la borner à sa
       boutique aurait fait de chaque gérant le maître des prix de tous. */
    await assertFails(
      addDoc(
        collection(gerant(), "pieces"),
        piece({ reference: "CHN-0099", boutiqueId: "KDG" }, "ger-1"),
      ),
    );
  });

  it("et ne corrige pas une référence d'une autre boutique", async () => {
    await assertFails(
      updateDoc(
        doc(gerant("ger-2", "KDG"), "pieces/plaquette"),
        modification({ prixVente: 1 }, "ger-2"),
      ),
    );
  });

  it("une référence ne change jamais de boutique", async () => {
    /* Son stock et ses ventes la citent là où elle est née. Un transfert de
       pièces déplacera du stock, pas le catalogue. */
    await assertFails(
      updateDoc(doc(gerant(), "pieces/plaquette"), modification({ boutiqueId: "KDG" }, "ger-1")),
    );
  });

  it("et ne naît pas dans une boutique inconnue ou fermée", async () => {
    await assertFails(
      addDoc(collection(responsable(), "pieces"), piece({ reference: "Z-1", boutiqueId: "NEANT" })),
    );
    await assertFails(
      addDoc(collection(responsable(), "pieces"), piece({ reference: "Z-2", boutiqueId: "FERMEE" })),
    );
  });

  it("refuse une référence sans boutique", async () => {
    await assertFails(
      addDoc(collection(responsable(), "pieces"), piece({ reference: "Z-3", boutiqueId: "" })),
    );
  });

  it("accepte une référence sans prix : elle existe et ne se vend pas", async () => {
    await assertSucceeds(
      addDoc(collection(responsable(), "pieces"), piece({ reference: "FLT-0003", prixVente: null })),
    );
  });

  it("accepte un prix d’achat sur le document public — c’est désormais sa place", async () => {
    await assertSucceeds(
      addDoc(collection(gerant(), "pieces"), piece({ reference: "X-1", prixAchat: 2_000 }, "ger-1")),
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
