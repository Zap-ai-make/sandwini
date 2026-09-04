import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { readFileSync } from "node:fs";
import { doc, getDoc, serverTimestamp, setDoc, updateDoc } from "firebase/firestore";
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";

/**
 * La passe de durcissement (S12).
 *
 * Chaque spec de S2 à S11 a livré ses règles avec ses tests. Ce fichier ne les
 * répète pas : il couvre les **cas croisés**, ceux qu'aucune spec isolée ne
 * voit parce qu'ils tombent entre deux.
 *
 * Il applique aussi la leçon de D69 : une restriction se vérifie **dans les
 * deux sens**. Ce qui est refusé, et ce qui doit rester possible. Une règle
 * trop stricte casse le produit aussi sûrement qu'une règle trop lâche
 * l'expose — et une CSP muette a coûté onze specs avant qu'on s'en aperçoive.
 */

const HOTE = "127.0.0.1";
const PORT = 8181;

let env: RulesTestEnvironment;

const anonyme = () => env.unauthenticatedContext().firestore();
const gerant = (uid = "ger-1", boutiqueId = "PTG") =>
  env.authenticatedContext(uid, { role: "gerant", boutiqueId }).firestore();
const responsable = () => env.authenticatedContext("resp-1", { role: "responsable" }).firestore();

const audit = (auteur: string) => ({
  createdAt: serverTimestamp(),
  createdBy: auteur,
  createdByName: "Auteur",
  updatedAt: serverTimestamp(),
  updatedBy: auteur,
  updatedByName: "Auteur",
});

const auditFige = {
  createdAt: new Date("2026-08-01T08:00:00Z"),
  createdBy: "ger-1",
  createdByName: "Auteur",
  updatedAt: new Date("2026-08-01T08:00:00Z"),
  updatedBy: "ger-1",
  updatedByName: "Auteur",
};

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: "sdi-regles-durcissement",
    firestore: { rules: readFileSync("firestore.rules", "utf8"), host: HOTE, port: PORT },
  });
});

afterAll(async () => env?.cleanup());

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (contexte) => {
    const base = contexte.firestore();
    await setDoc(doc(base, "boutiques/PTG"), {
      nom: "Pouytenga",
      code: "PTG",
      metiers: ["motos"],
      adresse: "",
      telephone: "",
      actif: true,
      ...auditFige,
    });
    await setDoc(doc(base, "motos/moto-ptg"), {
      boutiqueId: "PTG",
      etat: "neuve",
      marqueId: "m1",
      modeleId: "mo1",
      couleur: "",
      annee: null,
      numeroChassis: "LC6PCJ1A9K0000123",
      numeroMoteur: "",
      prixVenteConseille: null,
      provenanceId: "p1",
      papiersFournis: [],
      photos: [],
      statut: "en_stock",
      dateEntree: new Date("2026-08-01T08:00:00Z"),
      ...auditFige,
    });
    await setDoc(doc(base, "motos/moto-ptg/prive/cout"), {
      boutiqueId: "PTG",
      prixAchat: 850_000,
      coutTotal: 865_000,
      fraisEntree: [],
      ...auditFige,
    });
    await setDoc(doc(base, "users/ger-1"), {
      nom: "Gérant",
      email: "gerant@sdi.test",
      role: "gerant",
      boutiqueId: "PTG",
      actif: true,
      ...auditFige,
    });
  });
});

describe("refus par défaut", () => {
  /* Le filet de sécurité de `SECURITY.md` §1 : ce qu'aucune spec n'a ouvert
     reste fermé, même pour le responsable. Une collection ajoutée demain sans
     sa règle ne s'ouvre pas toute seule. */
  it("ferme les collections qu’aucune spec n’a ouvertes, pour tout le monde", async () => {
    for (const chemin of [
      "pieces/piece-1",
      "inventaires/inv-1",
      "prestataires/prest-1/prive/token",
      "ventesMotos/vente-1/inconnu/x",
    ]) {
      await assertFails(getDoc(doc(responsable(), chemin)));
      await assertFails(setDoc(doc(responsable(), chemin), { valeur: 1 }));
    }
  });
});

describe("un visiteur sans compte", () => {
  it("ne lit rien, nulle part", async () => {
    for (const chemin of [
      "boutiques/PTG",
      "motos/moto-ptg",
      "users/ger-1",
      "prestataires/prest-1",
      "encaissements/enc-1",
    ]) {
      await assertFails(getDoc(doc(anonyme(), chemin)));
    }
  });

  it("n’écrit rien, nulle part", async () => {
    await assertFails(setDoc(doc(anonyme(), "boutiques/KDG"), { nom: "Kaya" }));
    await assertFails(updateDoc(doc(anonyme(), "motos/moto-ptg"), { couleur: "rouge" }));
  });
});

describe("le coût d’une moto : écrit sans être lu (D4)", () => {
  /* La formulation la plus délicate du dépôt. Elle se teste dans les deux
     sens, sinon on croit avoir cloisonné alors qu'on a seulement compliqué. */
  it("laisse le gérant écrire le coût à l’entrée en stock", async () => {
    await assertSucceeds(
      setDoc(doc(gerant(), "motos/moto-ptg/prive/cout"), {
        boutiqueId: "PTG",
        prixAchat: 900_000,
        coutTotal: 915_000,
        fraisEntree: [],
        updatedAt: serverTimestamp(),
        updatedBy: "ger-1",
        updatedByName: "Gérant",
      }),
    );
  });

  it("mais lui refuse de le relire", async () => {
    await assertFails(getDoc(doc(gerant(), "motos/moto-ptg/prive/cout")));
  });

  it("et le laisse au responsable", async () => {
    await assertSucceeds(getDoc(doc(responsable(), "motos/moto-ptg/prive/cout")));
  });
});

describe("aucune élévation de privilège", () => {
  /* `users/{uid}` est un miroir lisible, jamais une source de droits : le rôle
     vit dans le custom claim, que seul le SDK Admin pose. La règle refuse donc
     toute écriture — y compris celle qui ne changerait « que » le nom. */
  it("empêche un gérant de se donner un rôle ou une autre boutique", async () => {
    for (const fraude of [{ role: "responsable" }, { boutiqueId: "KDG" }, { actif: true }]) {
      await assertFails(updateDoc(doc(gerant(), "users/ger-1"), fraude));
    }
  });

  it("l’empêche aussi au responsable : le rôle ne s’écrit pas depuis un navigateur", async () => {
    await assertFails(updateDoc(doc(responsable(), "users/ger-1"), { role: "responsable" }));
  });

  it("laisse chacun lire sa propre fiche, et le responsable celle des autres", async () => {
    await assertSucceeds(getDoc(doc(gerant(), "users/ger-1")));
    await assertSucceeds(getDoc(doc(responsable(), "users/ger-1")));
  });

  it("empêche un gérant de lire la fiche d’un autre compte", async () => {
    await assertFails(getDoc(doc(gerant("ger-2", "KDG"), "users/ger-1")));
  });
});

describe("la trace d’audit ne se falsifie pas", () => {
  it("refuse une écriture signée du nom de quelqu’un d’autre", async () => {
    await assertFails(
      setDoc(doc(gerant(), "motos/moto-neuve"), {
        boutiqueId: "PTG",
        etat: "neuve",
        marqueId: "m1",
        modeleId: "mo1",
        couleur: "",
        annee: null,
        numeroChassis: "LC6PCJ1A9K0000999",
        numeroMoteur: "",
        prixVenteConseille: null,
        provenanceId: "p1",
        papiersFournis: [],
        photos: [],
        statut: "en_stock",
        dateEntree: serverTimestamp(),
        ...audit("resp-1"),
      }),
    );
  });
});

describe("les cas croisés, entre deux specs", () => {
  /* Une moto transférée change de `boutiqueId`. La vente, elle, garde le sien —
     elle a eu lieu dans la boutique où elle a eu lieu. Le gérant d'origine doit
     continuer de lire sa propre vente, sinon son historique se vide quand une
     moto part ailleurs (S17). */
  it("laisse un gérant lire sa vente même si la moto est partie ailleurs", async () => {
    await env.withSecurityRulesDisabled(async (contexte) => {
      const base = contexte.firestore();
      await setDoc(doc(base, "ventesMotos/vente-ptg"), {
        boutiqueId: "PTG",
        motoId: "moto-ptg",
        ...auditFige,
      });
      await setDoc(doc(base, "motos/moto-ptg"), { boutiqueId: "KDG", ...auditFige });
    });

    await assertSucceeds(getDoc(doc(gerant(), "ventesMotos/vente-ptg")));
    /* Et il perd bien la moto : elle appartient désormais à l'autre boutique. */
    await assertFails(getDoc(doc(gerant(), "motos/moto-ptg")));
  });

  /* Un `prive/` sans son parent est **accepté**, et c'est voulu : dans un lot,
     Firestore évalue chaque écriture contre l'état d'AVANT, donc la moto
     n'existe pas encore quand son coût est validé. Fermer cette tolérance
     casserait l'entrée en stock — qui écrit la moto et son coût ensemble, et
     doit marcher hors ligne.

     Ce que le gérant y gagne se limite à des documents orphelins qu'il ne peut
     pas relire. Ce test existe pour que la tolérance soit **écrite** quelque
     part : personne ne la retrouverait en lisant la règle six mois plus tard,
     et quelqu'un la refermerait en croyant boucher un trou. */
  it("accepte un coût sans sa moto — le lot d’entrée en stock l’exige", async () => {
    await assertSucceeds(
      setDoc(doc(gerant(), "motos/moto-a-venir/prive/cout"), {
        boutiqueId: "PTG",
        prixAchat: 100_000,
        coutTotal: 100_000,
        fraisEntree: [],
        updatedAt: serverTimestamp(),
        updatedBy: "ger-1",
        updatedByName: "Gérant",
      }),
    );
  });

  /* La garde qui protège vraiment : dès que la moto existe, sa boutique fait
     foi. Un gérant ne peut pas coller un coût sur une moto d'ailleurs, ni
     maquiller la boutique du coût pour se l'approprier. */
  it("refuse un coût dont la boutique contredit celle de la moto", async () => {
    await assertFails(
      setDoc(doc(gerant("ger-2", "KDG"), "motos/moto-ptg/prive/cout"), {
        boutiqueId: "KDG",
        prixAchat: 100_000,
        coutTotal: 100_000,
        fraisEntree: [],
        updatedAt: serverTimestamp(),
        updatedBy: "ger-2",
        updatedByName: "Gérant KDG",
      }),
    );
  });

  /* Le cloisonnement par boutique se lit dans le document, pas dans le chemin :
     un gérant qui devine l'identifiant d'une moto d'ailleurs n'y gagne rien. */
  it("refuse à un gérant la moto d’une autre boutique, identifiant connu ou non", async () => {
    await assertFails(getDoc(doc(gerant("ger-2", "KDG"), "motos/moto-ptg")));
    await assertFails(updateDoc(doc(gerant("ger-2", "KDG"), "motos/moto-ptg"), { couleur: "x" }));
  });
});

describe("ce qui doit rester possible (D69)", () => {
  /* Le miroir de tout ce qui précède. Une règle trop stricte ne se voit pas :
     elle ne produit aucune alerte, seulement un produit qui ne marche pas. */
  it("laisse un gérant lire sa boutique, son stock et ses référentiels", async () => {
    const base = gerant();
    await assertSucceeds(getDoc(doc(base, "boutiques/PTG")));
    await assertSucceeds(getDoc(doc(base, "motos/moto-ptg")));
    await assertSucceeds(getDoc(doc(base, "prestataires/prest-1")));
  });

  it("laisse un gérant faire entrer une moto dans sa boutique", async () => {
    await assertSucceeds(
      setDoc(doc(gerant(), "motos/moto-neuve"), {
        boutiqueId: "PTG",
        etat: "neuve",
        marqueId: "m1",
        modeleId: "mo1",
        couleur: "",
        annee: null,
        numeroChassis: "LC6PCJ1A9K0000888",
        numeroMoteur: "",
        prixVenteConseille: null,
        provenanceId: "p1",
        papiersFournis: [],
        photos: [],
        statut: "en_stock",
        dateEntree: serverTimestamp(),
        ...audit("ger-1"),
      }),
    );
  });
});
