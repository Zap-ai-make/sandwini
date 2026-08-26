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
 * Règles sur les référentiels et l’entreprise (S4).
 *
 * La frontière est simple — tout le monde lit, seul le responsable écrit — donc
 * ce qui mérite des tests, c’est le **contrat de forme** : ce sont ces listes
 * qui alimenteront les écrans de saisie. Un modèle sans marque, un prestataire
 * sans type de document ou un champ `token` glissé depuis le navigateur ne se
 * verraient qu’une fois le stock saisi.
 */

let env: RulesTestEnvironment;

const HOTE = "127.0.0.1";
const PORT = 8181;

const responsable = (uid = "resp-1") =>
  env.authenticatedContext(uid, { role: "responsable" }).firestore();
const gerant = (uid = "ger-1", boutiqueId = "PTG") =>
  env.authenticatedContext(uid, { role: "gerant", boutiqueId }).firestore();

const creation = (auteur = "resp-1") => ({
  createdAt: serverTimestamp(),
  createdBy: auteur,
  createdByName: "Responsable SDI",
  updatedAt: serverTimestamp(),
  updatedBy: auteur,
  updatedByName: "Responsable SDI",
});

const creationFigee = {
  createdAt: new Date("2026-01-01T08:00:00Z"),
  createdBy: "resp-1",
  createdByName: "Responsable SDI",
  updatedAt: new Date("2026-01-01T08:00:00Z"),
  updatedBy: "resp-1",
  updatedByName: "Responsable SDI",
};

const modification = (champs: Record<string, unknown>, auteur = "resp-1") => ({
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
    projectId: "sdi-regles-referentiels",
    firestore: { rules: readFileSync("firestore.rules", "utf8"), host: HOTE, port: PORT },
  });
});

afterAll(async () => env?.cleanup());

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (contexte) => {
    const base = contexte.firestore();
    await setDoc(doc(base, "marques/yamaha"), { nom: "Yamaha", actif: true, ...creationFigee });
    await setDoc(doc(base, "provenances/import"), { nom: "Import", actif: true, ...creationFigee });
    await setDoc(doc(base, "typesFrais/transport"), {
      nom: "Transport",
      actif: true,
      ...creationFigee,
    });
    await setDoc(doc(base, "modeles/crux"), {
      nom: "Crux",
      marqueId: "yamaha",
      actif: true,
      ...creationFigee,
    });
    await setDoc(doc(base, "prestataires/kabore"), {
      nom: "Kaboré",
      telephone: "70 00 00 00",
      typesDocuments: ["carte_grise"],
      actif: true,
      ...creationFigee,
    });
    await setDoc(doc(base, "entreprise/profil"), {
      nom: "Sandwidi et frère",
      adresse: "Pouytenga",
      telephone: "70 00 00 00",
      telephone2: "",
      identifiant: "",
      logo: null,
      updatedAt: new Date("2026-01-01T08:00:00Z"),
      updatedBy: "resp-1",
      updatedByName: "Responsable SDI",
    });
  });
});

const TROIS = ["marques", "provenances", "typesFrais"] as const;

describe("lecture — le gérant a besoin de ces listes pour saisir", () => {
  it("le gérant lit les trois référentiels de même forme", async () => {
    for (const nomCollection of TROIS) {
      await assertSucceeds(getDocs(collection(gerant(), nomCollection)));
    }
  });

  it("le gérant lit les modèles, les prestataires et l’entreprise", async () => {
    await assertSucceeds(getDocs(collection(gerant(), "modeles")));
    await assertSucceeds(getDocs(collection(gerant(), "prestataires")));
    await assertSucceeds(getDoc(doc(gerant(), "entreprise/profil")));
  });

  it("un anonyme ne lit rien, pas même le nom de l’entreprise", async () => {
    const anonyme = env.unauthenticatedContext().firestore();
    await assertFails(getDocs(collection(anonyme, "marques")));
    await assertFails(getDoc(doc(anonyme, "entreprise/profil")));
  });
});

describe("écriture des référentiels", () => {
  it("le responsable ajoute une entrée dans chacun des trois", async () => {
    for (const nomCollection of TROIS) {
      await assertSucceeds(
        addDoc(collection(responsable(), nomCollection), {
          nom: "Nouvelle",
          actif: true,
          ...creation(),
        }),
      );
    }
  });

  it("le gérant n’en ajoute aucune", async () => {
    for (const nomCollection of TROIS) {
      await assertFails(
        addDoc(collection(gerant(), nomCollection), {
          nom: "Intruse",
          actif: true,
          ...creation("ger-1"),
        }),
      );
    }
  });

  it("le responsable renomme et désactive", async () => {
    await assertSucceeds(
      updateDoc(doc(responsable(), "marques/yamaha"), modification({ nom: "Yamaha Motor" })),
    );
    await assertSucceeds(
      updateDoc(doc(responsable(), "marques/yamaha"), modification({ actif: false })),
    );
  });

  it("refuse un nom vide — une liste de choix avec une ligne blanche est inutilisable", async () => {
    await assertFails(updateDoc(doc(responsable(), "marques/yamaha"), modification({ nom: "" })));
  });

  it("refuse un champ hors contrat", async () => {
    await assertFails(
      updateDoc(doc(responsable(), "marques/yamaha"), modification({ remise: 10 })),
    );
  });

  it("refuse d’antidater une modification ou de la signer au nom d’un autre", async () => {
    await assertFails(
      updateDoc(doc(responsable(), "marques/yamaha"), {
        nom: "Yamaha Motor",
        updatedAt: new Date("2020-01-01T00:00:00Z"),
        updatedBy: "resp-1",
        updatedByName: "Responsable SDI",
      }),
    );
    await assertFails(
      updateDoc(doc(responsable(), "marques/yamaha"), modification({ nom: "X" }, "resp-2")),
    );
  });

  it("la trace de création ne se réécrit pas", async () => {
    await assertFails(
      updateDoc(doc(responsable(), "marques/yamaha"), modification({ createdBy: "ger-1" })),
    );
  });

  it("rien ne se supprime — des motos citent leur marque", async () => {
    await assertFails(deleteDoc(doc(responsable(), "marques/yamaha")));
    await assertFails(deleteDoc(doc(responsable(), "provenances/import")));
    await assertFails(deleteDoc(doc(gerant(), "typesFrais/transport")));
  });
});

describe("modèles", () => {
  it("le responsable ajoute un modèle à une marque existante", async () => {
    await assertSucceeds(
      addDoc(collection(responsable(), "modeles"), {
        nom: "YBR",
        marqueId: "yamaha",
        actif: true,
        ...creation(),
      }),
    );
  });

  it("refuse un modèle orphelin : sa marque doit exister", async () => {
    await assertFails(
      addDoc(collection(responsable(), "modeles"), {
        nom: "Fantôme",
        marqueId: "marque-inexistante",
        actif: true,
        ...creation(),
      }),
    );
  });

  it("refuse un modèle sans marque du tout", async () => {
    await assertFails(
      addDoc(collection(responsable(), "modeles"), { nom: "Sans", actif: true, ...creation() }),
    );
  });

  it("un modèle ne change pas de marque — le stock déjà saisi le cite", async () => {
    await env.withSecurityRulesDisabled(async (contexte) => {
      await setDoc(doc(contexte.firestore(), "marques/tvs"), {
        nom: "TVS",
        actif: true,
        ...creationFigee,
      });
    });
    await assertFails(
      updateDoc(doc(responsable(), "modeles/crux"), modification({ marqueId: "tvs" })),
    );
  });

  it("le gérant ne touche pas aux modèles", async () => {
    await assertFails(
      updateDoc(doc(gerant(), "modeles/crux"), modification({ nom: "Crux 110" }, "ger-1")),
    );
  });
});

describe("prestataires", () => {
  const prestataire = (partie: Record<string, unknown> = {}) => ({
    nom: "Ouédraogo plaques",
    telephone: "70 11 22 33",
    typesDocuments: ["plaque"],
    actif: true,
    ...creation(),
    ...partie,
  });

  it("le responsable en ajoute un", async () => {
    await assertSucceeds(addDoc(collection(responsable(), "prestataires"), prestataire()));
  });

  it("refuse un prestataire sans téléphone — c’est par là qu’on relance", async () => {
    await assertFails(addDoc(collection(responsable(), "prestataires"), prestataire({ telephone: "" })));
  });

  it("refuse un prestataire qui ne traite aucun document : il ne serait jamais proposé", async () => {
    await assertFails(
      addDoc(collection(responsable(), "prestataires"), prestataire({ typesDocuments: [] })),
    );
  });

  it("refuse un type de document inventé", async () => {
    await assertFails(
      addDoc(collection(responsable(), "prestataires"), prestataire({ typesDocuments: ["passeport"] })),
    );
  });

  it("refuse un token écrit depuis le navigateur — un secret ne se fabrique pas ici", async () => {
    await assertFails(
      addDoc(collection(responsable(), "prestataires"), prestataire({ token: "jeton-choisi" })),
    );
    await assertFails(
      updateDoc(doc(responsable(), "prestataires/kabore"), modification({ token: "jeton-choisi" })),
    );
  });

  it("le gérant lit mais ne modifie pas", async () => {
    await assertSucceeds(getDoc(doc(gerant(), "prestataires/kabore")));
    await assertFails(
      updateDoc(doc(gerant(), "prestataires/kabore"), modification({ nom: "Autre" }, "ger-1")),
    );
  });
});

describe("entreprise", () => {
  const profil = (partie: Record<string, unknown> = {}) => ({
    nom: "Sandwidi et frère",
    adresse: "Pouytenga, marché central",
    telephone: "70 00 00 00",
    telephone2: "",
    identifiant: "",
    logo: null,
    updatedAt: serverTimestamp(),
    updatedBy: "resp-1",
    updatedByName: "Responsable SDI",
    ...partie,
  });

  it("le responsable enregistre les coordonnées", async () => {
    await assertSucceeds(setDoc(doc(responsable(), "entreprise/profil"), profil(), { merge: true }));
  });

  it("le responsable dépose un logo encodé dans le document", async () => {
    await assertSucceeds(
      setDoc(
        doc(responsable(), "entreprise/profil"),
        profil({ logo: `data:image/png;base64,${"A".repeat(5_000)}` }),
        { merge: true },
      ),
    );
  });

  it("refuse un logo qui n’est pas une image encodée — pas d’URL distante", async () => {
    await assertFails(
      setDoc(doc(responsable(), "entreprise/profil"), profil({ logo: "https://exemple.test/l.png" }), {
        merge: true,
      }),
    );
  });

  it("refuse un logo qui ferait exploser le document", async () => {
    await assertFails(
      setDoc(
        doc(responsable(), "entreprise/profil"),
        profil({ logo: `data:image/png;base64,${"A".repeat(220_000)}` }),
        { merge: true },
      ),
    );
  });

  it("refuse une entreprise sans nom — c’est lui qui s’imprime sur le reçu", async () => {
    await assertFails(
      setDoc(doc(responsable(), "entreprise/profil"), profil({ nom: "" }), { merge: true }),
    );
  });

  it("refuse un second document dans la collection", async () => {
    await assertFails(setDoc(doc(responsable(), "entreprise/autre"), profil()));
  });

  it("le gérant lit mais n’écrit pas", async () => {
    await assertSucceeds(getDoc(doc(gerant(), "entreprise/profil")));
    await assertFails(
      setDoc(doc(gerant(), "entreprise/profil"), profil({ updatedBy: "ger-1" }), { merge: true }),
    );
  });

  it("le profil ne se supprime pas", async () => {
    await assertFails(deleteDoc(doc(responsable(), "entreprise/profil")));
  });
});
