import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { readFileSync } from "node:fs";
import { addDoc, collection, doc, getDoc, serverTimestamp, setDoc, updateDoc, deleteDoc } from "firebase/firestore";
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";

/**
 * Règles sur la caisse (S22).
 *
 * **Ce qu'un formulaire ne peut pas protéger.** L'écran de clôture vérifie que
 * l'écart tombe juste et qu'un motif accompagne les gros écarts. Un navigateur
 * modifié contourne un écran ; il ne contourne pas ces règles. Trois choses ne
 * tiennent donc qu'ici :
 *
 * 1. **Une clôture ne se réécrit jamais.** C'est une affirmation datée — « j'ai
 *    compté, il y avait ceci » — et une affirmation qu'on retouche le lendemain
 *    n'affirme plus rien.
 * 2. **L'écart est calculé, jamais déclaré.** Le laisser libre permettrait
 *    d'annoncer un tiroir juste avec un comptage qui ne l'est pas.
 * 3. **Une clôture automatique ne porte pas de comptage**, et son écart est
 *    `null` — pas zéro. C'est la réponse 4 du commanditaire tenue honnête, et
 *    c'est la règle qui l'empêche de dériver.
 *
 * S'y ajoute la sortie d'espèces (réponse 2) : elle n'a demandé aucune règle
 * nouvelle — `encaissementValide` acceptait déjà `origine: 'depense'` depuis
 * S8. Ce fichier le prouve, parce qu'une règle qu'on croit acquise sans l'avoir
 * exercée n'est pas une règle, c'est une supposition.
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
  createdByName: "Ousmane Sawadogo",
  updatedAt: serverTimestamp(),
  updatedBy: auteur,
  updatedByName: "Ousmane Sawadogo",
});

const hier = new Date(Date.now() - 24 * 3600 * 1000);
const JOUR = "2026-09-05";

/** Une clôture comptée par le gérant : le cas de référence. */
const cloture = (partie: Record<string, unknown> = {}, auteur = "ger-1") => ({
  boutiqueId: "PTG",
  jour: JOUR,
  fondsOuverture: 50_000,
  especesAttendues: 742_000,
  especesComptees: 742_000,
  ecart: 0,
  motif: "",
  cloturePar: "gerant",
  clotureLe: hier,
  clotureParNom: "Ousmane Sawadogo",
  ...audit(auteur),
  ...partie,
});

/** Une sortie d'espèces : le seul geste d'écriture que S22 ajoute (réponse 2). */
const sortieEspeces = (partie: Record<string, unknown> = {}, auteur = "ger-1") => ({
  boutiqueId: "PTG",
  date: hier,
  sens: "sortie",
  montant: 15_000,
  moyenPaiement: "especes",
  origine: "depense",
  origineRefId: "",
  libelle: "Carburant groupe",
  categorieTranches: false,
  ...audit(auteur),
  ...partie,
});

const cle = (boutiqueId = "PTG", jour = JOUR) => `${boutiqueId}_${jour}`;

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: "sdi-regles-caisse",
    firestore: {
      rules: readFileSync("firestore.rules", "utf8"),
      host: HOTE,
      port: PORT,
    },
  });
});

afterAll(async () => {
  await env.cleanup();
});

beforeEach(async () => {
  await env.clearFirestore();
});

/* ------------------------------------------------------------------------- */

describe("clôturer une journée", () => {
  it("le gérant de la boutique clôture la sienne", async () => {
    await assertSucceeds(setDoc(doc(gerant(), "cloturesCaisse", cle()), cloture()));
  });

  it("le gérant d’une autre boutique ne clôture pas celle-ci", async () => {
    const autre = gerant("ger-2", "FMZ");
    await assertFails(setDoc(doc(autre, "cloturesCaisse", cle()), cloture()));
  });

  it("le responsable lit les clôtures et n’en fait pas — arbitrage du commanditaire", async () => {
    await env.withSecurityRulesDisabled(async (libre) => {
      await setDoc(doc(libre.firestore(), "cloturesCaisse", cle()), cloture());
    });

    await assertSucceeds(getDoc(doc(responsable(), "cloturesCaisse", cle())));
    /* Question 3 : « le gérant de la boutique, puisque c'est lui qui tient le
       tiroir. Le responsable lit les clôtures sans en faire. » Si cet
       arbitrage change, c'est ce test qui doit échouer en premier. */
    await assertFails(
      setDoc(doc(responsable(), "cloturesCaisse", cle("FMZ")), cloture({ boutiqueId: "FMZ" }, "resp-1")),
    );
  });

  it("un anonyme ne lit ni n’écrit rien", async () => {
    const dehors = env.unauthenticatedContext().firestore();
    await assertFails(getDoc(doc(dehors, "cloturesCaisse", cle())));
    await assertFails(setDoc(doc(dehors, "cloturesCaisse", cle()), cloture()));
  });
});

describe("une clôture est une affirmation, pas un brouillon", () => {
  beforeEach(async () => {
    await env.withSecurityRulesDisabled(async (libre) => {
      await setDoc(doc(libre.firestore(), "cloturesCaisse", cle()), cloture());
    });
  });

  it("ne se réécrit pas, même par celui qui l’a faite", async () => {
    /* Le test que la spec exigeait : il doit échouer à la réécrire, au niveau
       des règles et pas seulement de l'écran. Un écart qu'on peut corriger le
       lendemain cesse d'être une mesure. */
    await assertFails(
      updateDoc(doc(gerant(), "cloturesCaisse", cle()), { especesComptees: 999_999 }),
    );
    await assertFails(setDoc(doc(gerant(), "cloturesCaisse", cle()), cloture({ ecart: 0 })));
  });

  it("ne se supprime pas non plus, par personne", async () => {
    await assertFails(deleteDoc(doc(gerant(), "cloturesCaisse", cle())));
    await assertFails(deleteDoc(doc(responsable(), "cloturesCaisse", cle())));
  });
});

describe("l’écart est calculé, jamais déclaré", () => {
  it("refuse un écart qui ne correspond pas au comptage", async () => {
    /* Le cœur du sujet : sans cette règle, on annonce un tiroir juste — écart
       zéro — avec un comptage qui ne l'est pas, et l'anomalie disparaît. */
    await assertFails(
      setDoc(doc(gerant(), "cloturesCaisse", cle()), cloture({ especesComptees: 700_000, ecart: 0 })),
    );
  });

  it("accepte un écart exact, dans un sens comme dans l’autre", async () => {
    await assertSucceeds(
      setDoc(
        doc(gerant(), "cloturesCaisse", cle()),
        cloture({ especesComptees: 740_000, ecart: -2_000, motif: "billet manquant" }),
      ),
    );
    await assertSucceeds(
      setDoc(
        doc(gerant(), "cloturesCaisse", cle("PTG", "2026-09-06")),
        cloture({ jour: "2026-09-06", especesComptees: 745_000, ecart: 3_000, motif: "vente non saisie" }),
      ),
    );
  });
});

describe("une clôture automatique ne compte rien — réponse 4 du commanditaire", () => {
  it("s’écrit sans comptage et sans écart", async () => {
    await assertSucceeds(
      setDoc(
        doc(gerant(), "cloturesCaisse", cle()),
        cloture({ cloturePar: "automatique", especesComptees: null, ecart: null }),
      ),
    );
  });

  it("ne peut pas porter un écart de zéro à la place d’un écart inconnu", async () => {
    /* La règle qui empêche la réponse 4 de dériver en mensonge tranquille. Un
       zéro s'additionnerait sur un mois et dirait « tout allait bien » ; un
       `null` s'exclut et laisse la question ouverte, ce qu'elle est. */
    await assertFails(
      setDoc(
        doc(gerant(), "cloturesCaisse", cle()),
        cloture({ cloturePar: "automatique", especesComptees: null, ecart: 0 }),
      ),
    );
  });

  it("ne peut pas porter un comptage : compter, c’est clôturer volontairement", async () => {
    await assertFails(
      setDoc(
        doc(gerant(), "cloturesCaisse", cle()),
        cloture({ cloturePar: "automatique", especesComptees: 742_000, ecart: 0 }),
      ),
    );
  });

  it("et une clôture de gérant ne peut pas se passer de comptage", async () => {
    await assertFails(
      setDoc(
        doc(gerant(), "cloturesCaisse", cle()),
        cloture({ cloturePar: "gerant", especesComptees: null, ecart: null }),
      ),
    );
  });
});

describe("l’identifiant porte la boutique et le jour", () => {
  it("refuse une clôture rangée sous un autre identifiant que le sien", async () => {
    /* Sans cette règle, l'identifiant composé ne garantirait plus l'unicité :
       on écrirait deux clôtures du 5 septembre sous deux identifiants
       différents, et l'historique en montrerait deux. */
    await assertFails(setDoc(doc(gerant(), "cloturesCaisse", "n-importe-quoi"), cloture()));
    await assertFails(setDoc(doc(gerant(), "cloturesCaisse", cle("PTG", "2026-09-06")), cloture()));
  });

  it("refuse un jour qui n’est pas un jour", async () => {
    await assertFails(
      setDoc(doc(gerant(), "cloturesCaisse", "PTG_hier"), cloture({ jour: "hier" })),
    );
  });
});

describe("la sortie d’espèces — réponse 2, et aucune règle nouvelle", () => {
  it("s’écrit comme n’importe quel encaissement, avec origine « depense »", async () => {
    /* La spec l'annonçait sans l'avoir exercé : `encaissementValide` accepte
       `depense` depuis S8. Une règle qu'on croit acquise sans l'avoir essayée
       est une supposition, pas une règle. */
    await assertSucceeds(addDoc(collection(gerant(), "encaissements"), sortieEspeces()));
  });

  it("ne s’écrit pas pour la boutique d’un autre", async () => {
    const autre = gerant("ger-2", "FMZ");
    await assertFails(addDoc(collection(autre, "encaissements"), sortieEspeces()));
  });

  it("ne se retouche pas davantage qu’une clôture", async () => {
    let identifiant = "";
    await env.withSecurityRulesDisabled(async (libre) => {
      const ecrit = await addDoc(collection(libre.firestore(), "encaissements"), sortieEspeces());
      identifiant = ecrit.id;
    });

    /* « Une écriture de caisse ne se retouche pas : on la contre-passe. »
       C'était le commentaire laissé par S8 en annonçant cette spec ; il vaut
       toujours, et S25 portera la contre-passation. */
    await assertFails(updateDoc(doc(gerant(), "encaissements", identifiant), { montant: 1 }));
    await assertFails(deleteDoc(doc(gerant(), "encaissements", identifiant)));
  });

  it("refuse un montant nul : une sortie de rien n’est pas un mouvement", async () => {
    await assertFails(addDoc(collection(gerant(), "encaissements"), sortieEspeces({ montant: 0 })));
  });
});
