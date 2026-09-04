import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { readFileSync } from "node:fs";
import { collection, doc, serverTimestamp, setDoc, updateDoc, writeBatch } from "firebase/firestore";
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";

/**
 * Règles sur le cycle des documents de dossier (S11).
 *
 * `lib/domain/dossier.ts` dit ce que l’application **propose** ; ce fichier
 * prouve ce que la base **accepte**. La distinction n’est pas théorique : un
 * appareil dont le code a été modifié — ou une version plus ancienne restée en
 * cache — ne doit pas pouvoir sauter le dépôt chez le prestataire. Ce saut-là
 * ne casse rien visuellement, il vide simplement la liste des dossiers de la
 * seule chose qu’elle sert à dire : qui détient le document en ce moment (D65).
 *
 * Les deux tables de transitions sont donc écrites deux fois, à dessein, et ces
 * tests sont ce qui garantit qu’elles disent la même chose.
 */

const HOTE = "127.0.0.1";
const PORT = 8181;

let env: RulesTestEnvironment;

const gerant = (uid = "ger-1", boutiqueId = "PTG") =>
  env.authenticatedContext(uid, { role: "gerant", boutiqueId }).firestore();
const responsable = () => env.authenticatedContext("resp-1", { role: "responsable" }).firestore();

const auditFige = {
  createdAt: new Date("2026-08-01T08:00:00Z"),
  createdBy: "ger-1",
  createdByName: "Auteur",
  updatedAt: new Date("2026-08-01T08:00:00Z"),
  updatedBy: "ger-1",
  updatedByName: "Auteur",
};

/** Ce qu’une création doit porter pour passer `traceCreation`. */
const traceCreation = {
  createdAt: serverTimestamp(),
  createdBy: "ger-1",
  createdByName: "Gérant",
  updatedAt: serverTimestamp(),
  updatedBy: "ger-1",
  updatedByName: "Gérant",
};

/** Ce qu’une modification doit porter pour passer `traceModification`. */
const traceMaj = {
  updatedAt: serverTimestamp(),
  updatedBy: "ger-1",
  updatedByName: "Gérant",
};

const chemin = (type: string) => `ventesMotos/vente-ptg/documents/${type}`;

/** Pose les quatre documents dans le statut voulu, hors règles. */
async function poser(statuts: Record<string, Record<string, unknown>>) {
  await env.withSecurityRulesDisabled(async (contexte) => {
    const base = contexte.firestore();
    for (const [type, champs] of Object.entries(statuts)) {
      await setDoc(doc(base, chemin(type)), {
        boutiqueId: "PTG",
        venteId: "vente-ptg",
        type,
        statut: "a_faire",
        ...auditFige,
        ...champs,
      });
    }
  });
}

const DEPOT = {
  prestataireId: "prest-1",
  prestataireNom: "Kaboré Plaques",
  deposeLe: new Date("2026-08-20T09:00:00Z"),
  avance: 15_000,
  disponibleLe: new Date("2026-08-27T09:00:00Z"),
};

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: "sdi-regles-dossier",
    firestore: { rules: readFileSync("firestore.rules", "utf8"), host: HOTE, port: PORT },
  });
});

afterAll(async () => env?.cleanup());

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (contexte) => {
    await setDoc(doc(contexte.firestore(), "ventesMotos/vente-ptg"), {
      boutiqueId: "PTG",
      ...auditFige,
    });
  });
});

describe("la quittance et le CMC, qui arrivent déjà faits", () => {
  it("vont directement au magasin, sans passer par un prestataire", async () => {
    await poser({ quittance: {}, cmc: {} });
    const base = gerant();
    for (const type of ["quittance", "cmc"]) {
      await assertSucceeds(
        updateDoc(doc(base, chemin(type)), { statut: "revenu_magasin", ...traceMaj }),
      );
    }
  });

  it("ne peuvent pas être déposées chez un prestataire — personne ne les détient", async () => {
    await poser({ quittance: {}, cmc: {} });
    const base = gerant();
    for (const type of ["quittance", "cmc"]) {
      await assertFails(
        updateDoc(doc(base, chemin(type)), {
          statut: "chez_prestataire",
          ...DEPOT,
          ...traceMaj,
        }),
      );
    }
  });
});

describe("la carte grise et la plaque, qui passent par un prestataire", () => {
  it("ne sautent pas le dépôt", async () => {
    await poser({ carte_grise: {}, plaque: {} });
    const base = gerant();
    for (const type of ["carte_grise", "plaque"]) {
      await assertFails(
        updateDoc(doc(base, chemin(type)), { statut: "revenu_magasin", ...traceMaj }),
      );
    }
  });

  it("se déposent avec le prestataire, la date et l’avance", async () => {
    await poser({ carte_grise: {} });
    await assertSucceeds(
      updateDoc(doc(gerant(), chemin("carte_grise")), {
        statut: "chez_prestataire",
        ...DEPOT,
        ...traceMaj,
      }),
    );
  });

  it("refusent un dépôt sans prestataire, sans date ou sans avance", async () => {
    for (const manquant of ["prestataireId", "deposeLe", "avance"] as const) {
      await poser({ carte_grise: {} });
      const depot: Record<string, unknown> = { ...DEPOT };
      delete depot[manquant];
      await assertFails(
        updateDoc(doc(gerant(), chemin("carte_grise")), {
          statut: "chez_prestataire",
          ...depot,
          ...traceMaj,
        }),
      );
    }
  });

  /* Une avance a zero n'est pas une avance : c'est un travail confie a credit,
     et le credit se modelise ailleurs. Les confondre ferait apparaitre des
     depots sans contrepartie en caisse, que rien ne viendrait solder. */
  it("refusent une avance nulle ou negative — sinon ce n’est plus une avance", async () => {
    for (const avance of [0, -1]) {
      await poser({ carte_grise: {} });
      await assertFails(
        updateDoc(doc(gerant(), chemin("carte_grise")), {
          statut: "chez_prestataire",
          ...DEPOT,
          avance,
          ...traceMaj,
        }),
      );
    }
  });
});

describe("ce qu’aucun document ne peut faire", () => {
  it("ne saute jamais la remise au client", async () => {
    await poser({ quittance: {}, carte_grise: {} });
    const base = gerant();
    for (const type of ["quittance", "carte_grise"]) {
      await assertFails(
        updateDoc(doc(base, chemin(type)), {
          statut: "remis_client",
          remisLe: new Date("2026-08-30T09:00:00Z"),
          ...traceMaj,
        }),
      );
    }
  });

  it("ne revient jamais en arrière", async () => {
    await poser({ carte_grise: { statut: "revenu_magasin", ...DEPOT } });
    const base = gerant();
    for (const retour of ["a_faire", "chez_prestataire"]) {
      await assertFails(
        updateDoc(doc(base, chemin("carte_grise")), { statut: retour, ...traceMaj }),
      );
    }
  });

  it("ne rouvre pas un document remis ou écarté", async () => {
    await poser({
      quittance: { statut: "remis_client", remisLe: new Date("2026-08-30T09:00:00Z") },
      cmc: { statut: "non_applicable" },
    });
    const base = gerant();
    await assertFails(
      updateDoc(doc(base, chemin("quittance")), { statut: "revenu_magasin", ...traceMaj }),
    );
    await assertFails(
      updateDoc(doc(base, chemin("cmc")), { statut: "revenu_magasin", ...traceMaj }),
    );
  });

  it("n’écarte pas un document déjà déposé : l’argent de l’avance est sorti", async () => {
    await poser({ carte_grise: { statut: "chez_prestataire", ...DEPOT } });
    await assertFails(
      updateDoc(doc(gerant(), chemin("carte_grise")), { statut: "non_applicable", ...traceMaj }),
    );
  });

  it("ne se remet pas au client sans date de remise", async () => {
    await poser({ quittance: { statut: "revenu_magasin" } });
    await assertFails(
      updateDoc(doc(gerant(), chemin("quittance")), { statut: "remis_client", ...traceMaj }),
    );
  });

  it("ne change ni de boutique, ni de vente, ni de type", async () => {
    const base = gerant();
    for (const fraude of [{ boutiqueId: "KDG" }, { venteId: "vente-kdg" }, { type: "plaque" }]) {
      await poser({ quittance: {} });
      await assertFails(
        updateDoc(doc(base, chemin("quittance")), {
          statut: "revenu_magasin",
          ...fraude,
          ...traceMaj,
        }),
      );
    }
  });

  it("ne se supprime pas — « non applicable » est la façon de l’écarter", async () => {
    await poser({ quittance: {} });
    await assertFails(
      updateDoc(doc(gerant(), chemin("quittance")), { statut: "non_applicable" }),
    );
  });
});

describe("qui a le droit de faire avancer un document", () => {
  it("laisse passer le responsable, qui voit toutes les boutiques", async () => {
    await poser({ quittance: {} });
    await assertSucceeds(
      updateDoc(doc(responsable(), chemin("quittance")), {
        statut: "revenu_magasin",
        updatedAt: serverTimestamp(),
        updatedBy: "resp-1",
        updatedByName: "Responsable",
      }),
    );
  });

  it("refuse le gérant d’une autre boutique", async () => {
    await poser({ quittance: {} });
    await assertFails(
      updateDoc(doc(gerant("ger-2", "KDG"), chemin("quittance")), {
        statut: "revenu_magasin",
        updatedAt: serverTimestamp(),
        updatedBy: "ger-2",
        updatedByName: "Gérant KDG",
      }),
    );
  });

  it("refuse une modification qui ne laisse pas sa trace", async () => {
    await poser({ quittance: {} });
    await assertFails(
      updateDoc(doc(gerant(), chemin("quittance")), { statut: "revenu_magasin" }),
    );
  });
});

/**
 * Le lot exact que `lib/repositories/dossier.ts` envoie au dépôt.
 *
 * Les cas ci-dessus valident l'`update` **seul**. Or le produit n'envoie jamais
 * cet update seul : il part avec sa ligne d'historique et la sortie de caisse
 * de l'avance, dans un `writeBatch`. Et un lot est accepté ou refusé **en
 * bloc** — une seule des trois écritures refusée, et le dépôt entier reste
 * coincé dans la file, sans erreur visible à l'écran puisque l'affichage
 * optimiste, lui, a déjà montré le résultat.
 *
 * C'est exactement la panne trouvée en bout-en-bout : « Hors ligne · 1 saisie
 * en attente », avec un dépôt affiché qui n'était jamais parti.
 */
describe("le lot complet du dépôt", () => {
  it("passe : le statut, l’historique et la sortie de caisse ensemble", async () => {
    await poser({ carte_grise: {} });
    const base = gerant();
    const document = doc(base, chemin("carte_grise"));
    const lot = writeBatch(base);

    lot.update(document, { statut: "chez_prestataire", ...DEPOT, ...traceMaj });
    lot.set(doc(collection(document, "historique")), {
      boutiqueId: "PTG",
      venteId: "vente-ptg",
      type: "carte_grise",
      de: "a_faire",
      vers: "chez_prestataire",
      le: new Date("2026-08-20T09:00:00Z"),
      ...traceCreation,
    });
    lot.set(doc(collection(base, "encaissements")), {
      boutiqueId: "PTG",
      date: new Date("2026-08-20T09:00:00Z"),
      sens: "sortie",
      montant: 15_000,
      moyenPaiement: "especes",
      origine: "avance_prestataire",
      origineRefId: "vente-ptg",
      libelle: "Avance Kaboré Plaques — Carte grise",
      categorieTranches: false,
      ...traceCreation,
    });

    await assertSucceeds(lot.commit());
  });
});
