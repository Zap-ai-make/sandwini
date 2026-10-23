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
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from "firebase/firestore";
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";

/**
 * Les règles du dossier de carte grise (S59).
 *
 * **C'est la porte la plus large du fichier de règles, et ces tests sont ce qui
 * la tient.** La personne qui traite les cartes grises ne fait que ça : elle
 * doit voir les dossiers de *toutes* les boutiques, ce qu'aucun gérant n'a le
 * droit de faire ailleurs. Sa permission vient du **métier** de sa boutique,
 * pas d'un rôle nouveau — le produit en a deux, et c'est délibéré.
 *
 * Une permission qui élargit se prouve par ce qu'elle **n'ouvre pas** : la
 * moitié de ce fichier vérifie qu'elle ne déborde ni sur les ventes, ni sur le
 * stock, ni sur la caisse, ni sur les pièces.
 */

let env: RulesTestEnvironment;

const HOTE = "127.0.0.1";
const PORT = 8181;

const responsable = () => env.authenticatedContext("resp-1", { role: "responsable" }).firestore();
/** Un gérant de boutique motos : il ne voit que la sienne. */
const gerantMotos = () =>
  env.authenticatedContext("ger-1", { role: "gerant", boutiqueId: "PTG" }).firestore();
/** La personne des cartes grises : sa boutique porte le métier. */
const gerantCartes = () =>
  env.authenticatedContext("ger-cg", { role: "gerant", boutiqueId: "CGP" }).firestore();

const audit = (uid = "ger-1") => ({
  createdAt: serverTimestamp(),
  createdBy: uid,
  createdByName: "Gérant",
  updatedAt: serverTimestamp(),
  updatedBy: uid,
  updatedByName: "Gérant",
});

const dossier = (partie: Record<string, unknown> = {}) => ({
  boutiqueId: "PTG",
  venteId: "v1",
  origine: "vente",
  clientNom: "Sawadogo Harouna",
  motoLibelle: "SR - 115",
  numeroChassis: "02SY052982",
  statut: "a_faire",
  prestataireId: null,
  prestataireNom: "",
  deposeLe: null,
  avance: null,
  disponibleLe: null,
  immatriculation: "",
  revenuLe: null,
  remisLe: null,
  remisANom: "",
  remisATelephone: "",
  ...audit(),
  ...partie,
});

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: "sdi-regles-cartes-grises",
    firestore: { rules: readFileSync("firestore.rules", "utf8"), host: HOTE, port: PORT },
  });
});

afterAll(async () => env?.cleanup());

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (contexte) => {
    const base = contexte.firestore();

    /* Le décor : deux boutiques qui vendent, une qui fait les papiers. C'est le
       métier de la troisième qui lui ouvre tous les dossiers. */
    await setDoc(doc(base, "boutiques/PTG"), {
      nom: "Pouytenga",
      code: "PTG",
      metiers: ["motos"],
      actif: true,
      ...audit(),
    });
    await setDoc(doc(base, "boutiques/KDG"), {
      nom: "Koudougou",
      code: "KDG",
      metiers: ["motos"],
      actif: true,
      ...audit(),
    });
    await setDoc(doc(base, "boutiques/CGP"), {
      nom: "Carte grise et plaque",
      code: "CGP",
      metiers: ["cartes_grises"],
      actif: true,
      ...audit(),
    });

    await setDoc(doc(base, "dossiersCarteGrise/d-ptg"), dossier());
    await setDoc(doc(base, "dossiersCarteGrise/d-kdg"), dossier({ boutiqueId: "KDG", venteId: "v9" }));

    /* De quoi prouver ce que la permission n'ouvre PAS. */
    await setDoc(doc(base, "ventesMotos/v1"), { boutiqueId: "PTG", ...audit() });
    await setDoc(doc(base, "motos/m1"), { boutiqueId: "PTG", ...audit() });
    await setDoc(doc(base, "encaissements/e1"), { boutiqueId: "PTG", ...audit() });
    await setDoc(doc(base, "pieces/p1"), { boutiqueId: "PTG", ...audit() });
  });
});

describe("qui lit un dossier de carte grise", () => {
  it("la personne des cartes grises lit toutes les boutiques", () => {
    /* Le critère central de la spec : elle traite les papiers de l'entreprise
       entière, pas ceux d'un magasin. */
    return Promise.all([
      assertSucceeds(getDoc(doc(gerantCartes(), "dossiersCarteGrise/d-ptg"))),
      assertSucceeds(getDoc(doc(gerantCartes(), "dossiersCarteGrise/d-kdg"))),
      assertSucceeds(getDocs(collection(gerantCartes(), "dossiersCarteGrise"))),
    ]);
  });

  it("un gérant motos ne lit que la sienne", async () => {
    await assertSucceeds(getDoc(doc(gerantMotos(), "dossiersCarteGrise/d-ptg")));
    await assertFails(getDoc(doc(gerantMotos(), "dossiersCarteGrise/d-kdg")));
    /* Et sa requête doit nommer sa boutique, sinon elle ramènerait l'autre. */
    await assertSucceeds(
      getDocs(query(collection(gerantMotos(), "dossiersCarteGrise"), where("boutiqueId", "==", "PTG"))),
    );
    await assertFails(getDocs(collection(gerantMotos(), "dossiersCarteGrise")));
  });

  it("le responsable lit tout", () => {
    return assertSucceeds(getDocs(collection(responsable(), "dossiersCarteGrise")));
  });
});

/**
 * **La moitié qui compte.** Une permission qui élargit se juge sur ce qu'elle
 * laisse fermé. Si l'un de ces quatre passait, le cloisonnement du produit
 * serait percé par la porte des cartes grises.
 */
describe("ce que la personne des cartes grises ne voit pas", () => {
  it("ni les ventes, ni le stock, ni la caisse, ni les pièces", async () => {
    await assertFails(getDoc(doc(gerantCartes(), "ventesMotos/v1")));
    await assertFails(getDoc(doc(gerantCartes(), "motos/m1")));
    await assertFails(getDoc(doc(gerantCartes(), "encaissements/e1")));
    await assertFails(getDoc(doc(gerantCartes(), "pieces/p1")));
  });

  it("pas même celles de sa propre boutique", async () => {
    await env.withSecurityRulesDisabled(async (contexte) => {
      await setDoc(doc(contexte.firestore(), "motos/m-cgp"), { boutiqueId: "CGP", ...audit() });
    });
    /* Sa boutique ne porte pas le métier motos : lui ouvrir son stock
       reviendrait à lui donner un magasin qu'elle n'a pas. */
    await assertFails(getDoc(doc(gerantCartes(), "motos/m-cgp")));
  });
});

describe("écrire un dossier", () => {
  it("la personne des cartes grises en ouvre un venu du dehors", () => {
    return assertSucceeds(
      setDoc(
        doc(gerantCartes(), "dossiersCarteGrise/d-ext"),
        dossier({
          boutiqueId: "CGP",
          venteId: null,
          origine: "exterieur",
          ...audit("ger-cg"),
        }),
      ),
    );
  });

  it("un dossier naît à faire, jamais déjà chez quelqu’un", async () => {
    /* Le faire naître « chez le prestataire » sauterait le dépôt — donc
       l'avance et la trace qui vont avec. */
    await assertFails(
      setDoc(
        doc(gerantCartes(), "dossiersCarteGrise/d-triche"),
        dossier({ boutiqueId: "CGP", venteId: null, origine: "exterieur", statut: "chez_prestataire", ...audit("ger-cg") }),
      ),
    );
  });

  it("refuse un dossier sans châssis", () => {
    return assertFails(
      setDoc(
        doc(gerantCartes(), "dossiersCarteGrise/d-nu"),
        dossier({ boutiqueId: "CGP", venteId: null, origine: "exterieur", numeroChassis: "", ...audit("ger-cg") }),
      ),
    );
  });
});

describe("faire avancer un dossier", () => {
  it("laisse passer le chemin normal", () => {
    return assertSucceeds(
      updateDoc(doc(gerantCartes(), "dossiersCarteGrise/d-ptg"), {
        statut: "chez_prestataire",
        prestataireId: "p1",
        prestataireNom: "Bohary",
        deposeLe: new Date("2026-08-18T12:00:00"),
        avance: 150_000,
        updatedAt: serverTimestamp(),
        updatedBy: "ger-cg",
        updatedByName: "Gérant",
      }),
    );
  });

  it("refuse de sauter le prestataire", () => {
    /* C'est lui qui dit qui détient le papier : sauter l'étape viderait la
       liste de la seule chose qu'elle sert à dire (D65). */
    return assertFails(
      updateDoc(doc(gerantCartes(), "dossiersCarteGrise/d-ptg"), {
        statut: "revenu_magasin",
        updatedAt: serverTimestamp(),
        updatedBy: "ger-cg",
        updatedByName: "Gérant",
      }),
    );
  });

  it("refuse de revenir en arrière", async () => {
    await env.withSecurityRulesDisabled(async (contexte) => {
      await updateDoc(doc(contexte.firestore(), "dossiersCarteGrise/d-ptg"), {
        statut: "remis",
      });
    });
    await assertFails(
      updateDoc(doc(gerantCartes(), "dossiersCarteGrise/d-ptg"), {
        statut: "revenu_magasin",
        updatedAt: serverTimestamp(),
        updatedBy: "ger-cg",
        updatedByName: "Gérant",
      }),
    );
  });

  it("refuse de déplacer un dossier d’une boutique à l’autre", () => {
    /* Une ligne qui changerait de boutique effacerait d'où elle vient — et
       sortirait du champ de vision de celui qui l'a vendue. */
    return assertFails(
      updateDoc(doc(gerantCartes(), "dossiersCarteGrise/d-ptg"), {
        boutiqueId: "CGP",
        updatedAt: serverTimestamp(),
        updatedBy: "ger-cg",
        updatedByName: "Gérant",
      }),
    );
  });

  it("ne supprime jamais un dossier", () => {
    /* On l'écarte en le passant « sans objet », ce qui laisse une trace. */
    return assertFails(deleteDoc(doc(gerantCartes(), "dossiersCarteGrise/d-ptg")));
  });
});
