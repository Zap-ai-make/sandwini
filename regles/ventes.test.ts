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
  collectionGroup,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from "firebase/firestore";
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";

/**
 * Règles sur les ventes de motos (S8).
 *
 * Deux frontières à prouver, et elles ne se ressemblent pas.
 *
 * La première est un cloisonnement : **un gérant ne lit jamais la marge d'une
 * vente**, et personne — pas même le responsable — ne l'écrit depuis un
 * navigateur. Elle n'est remplie que par un déclencheur, via le SDK Admin qui
 * ne passe pas par ces règles (D51). Une marge qu'un navigateur pourrait
 * écrire serait une marge qu'on peut maquiller.
 *
 * La seconde est une arithmétique : le formulaire vérifie que les montants
 * tombent juste, mais un formulaire ne protège rien. C'est ici que ça compte,
 * parce que c'est ici qu'un client modifié ne peut pas contourner.
 */

let env: RulesTestEnvironment;

const HOTE = "127.0.0.1";
const PORT = 8181;

const responsable = () => env.authenticatedContext("resp-1", { role: "responsable" }).firestore();
const gerant = (uid = "ger-1", boutiqueId = "PTG") =>
  env.authenticatedContext(uid, { role: "gerant", boutiqueId }).firestore();

const TOKEN = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLM012-_";
/** 43 caractères exactement : 32 octets en base64url. */
const TOKEN_VALIDE = TOKEN.slice(0, 43);

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

const hier = new Date(Date.now() - 24 * 3600 * 1000);

/** Une vente au comptant, entièrement payée : le cas de référence. */
const vente = (partie: Record<string, unknown> = {}, auteur = "ger-1") => ({
  numero: "PTG-2608-0042",
  numeroInitial: "PTG-2608-0042",
  boutiqueId: "PTG",
  motoId: "moto-ptg",
  clientId: "client-1",
  date: hier,
  prixConvenu: 1_200_000,
  modePaiement: "comptant",
  inclus: ["Casque"],
  nonInclus: [],
  totalPaye: 1_200_000,
  resteDu: 0,
  statutPaiement: "solde",
  dernierVersementAt: hier,
  motoRemise: true,
  dateRemiseMoto: hier,
  tokenSuivi: TOKEN_VALIDE,
  lienSuiviEnvoyeAt: null,
  statutDossier: "ouvert",
  dateClotureDossier: null,
  ...audit(auteur),
  ...partie,
});

/** Une vente en tranches : moto retenue, rien encore versé. */
const venteTranches = (partie: Record<string, unknown> = {}) =>
  vente({
    modePaiement: "tranches",
    totalPaye: 0,
    resteDu: 1_200_000,
    statutPaiement: "impaye",
    dernierVersementAt: null,
    motoRemise: false,
    dateRemiseMoto: null,
    ...partie,
  });

const documentDossier = (partie: Record<string, unknown> = {}, auteur = "ger-1") => ({
  boutiqueId: "PTG",
  venteId: "vente-ptg",
  type: "carte_grise",
  statut: "a_faire",
  ...audit(auteur),
  ...partie,
});

const versement = (partie: Record<string, unknown> = {}, auteur = "ger-1") => ({
  boutiqueId: "PTG",
  venteId: "vente-ptg",
  numeroRecu: "PTG-2608-0042",
  date: hier,
  montant: 400_000,
  moyenPaiement: "especes",
  reference: "",
  encaissementId: "enc-1",
  ...audit(auteur),
  ...partie,
});

const encaissement = (partie: Record<string, unknown> = {}, auteur = "ger-1") => ({
  boutiqueId: "PTG",
  date: hier,
  sens: "entree",
  montant: 400_000,
  moyenPaiement: "especes",
  origine: "vente_moto",
  origineRefId: "vente-ptg",
  libelle: "Vente PTG-2608-0042",
  categorieTranches: false,
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
    projectId: "sdi-regles-ventes",
    firestore: { rules: readFileSync("firestore.rules", "utf8"), host: HOTE, port: PORT },
  });
});

afterAll(async () => env?.cleanup());

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (contexte) => {
    const base = contexte.firestore();

    await setDoc(doc(base, "ventesMotos/vente-ptg"), { ...vente(), ...auditFige });
    await setDoc(doc(base, "ventesMotos/vente-ptg/documents/carte_grise"), {
      ...documentDossier(),
      ...auditFige,
    });
    await setDoc(doc(base, "ventesMotos/vente-ptg/versements/vers-1"), {
      ...versement(),
      ...auditFige,
    });
    /* La marge, telle que le déclencheur l'écrit : c'est elle que le gérant ne
       doit jamais atteindre. */
    await setDoc(doc(base, "ventesMotos/vente-ptg/prive/marge"), {
      boutiqueId: "PTG",
      coutMotoSnapshot: 865_000,
      marge: 335_000,
      updatedAt: new Date("2026-08-01T08:00:00Z"),
      updatedBy: "systeme",
      updatedByName: "Calcul automatique",
    });

    await setDoc(doc(base, "ventesMotos/vente-kdg"), {
      ...vente({ boutiqueId: "KDG", numero: "KDG-2608-0007", numeroInitial: "KDG-2608-0007" }),
      ...auditFige,
    });
    await setDoc(doc(base, "ventesMotos/vente-kdg/documents/carte_grise"), {
      ...documentDossier({ boutiqueId: "KDG", venteId: "vente-kdg" }),
      ...auditFige,
    });
    await setDoc(doc(base, "encaissements/enc-ptg"), { ...encaissement(), ...auditFige });
    await setDoc(doc(base, "encaissements/enc-kdg"), {
      ...encaissement({ boutiqueId: "KDG" }),
      ...auditFige,
    });
  });
});

describe("la marge est hors de portée, et infalsifiable", () => {
  it("le gérant ne lit pas la marge d’une vente de sa propre boutique", async () => {
    await assertFails(getDoc(doc(gerant(), "ventesMotos/vente-ptg/prive/marge")));
  });

  it("le gérant ne parcourt pas la sous-collection privée", async () => {
    await assertFails(getDocs(collection(gerant(), "ventesMotos/vente-ptg/prive")));
  });

  it("le responsable, lui, la lit", async () => {
    await assertSucceeds(getDoc(doc(responsable(), "ventesMotos/vente-ptg/prive/marge")));
  });

  it("personne ne l’écrit depuis un navigateur — pas même le responsable", async () => {
    const marge = { boutiqueId: "PTG", coutMotoSnapshot: 0, marge: 1_200_000 };
    await assertFails(setDoc(doc(gerant(), "ventesMotos/vente-ptg/prive/marge"), marge));
    await assertFails(setDoc(doc(responsable(), "ventesMotos/vente-ptg/prive/marge"), marge));
    await assertFails(
      updateDoc(doc(responsable(), "ventesMotos/vente-ptg/prive/marge"), { marge: 999 }),
    );
    await assertFails(deleteDoc(doc(responsable(), "ventesMotos/vente-ptg/prive/marge")));
  });

  it("un coût ne se glisse pas dans le document de vente lui-même", async () => {
    await assertFails(
      addDoc(collection(gerant(), "ventesMotos"), vente({ coutMotoSnapshot: 865_000 })),
    );
  });
});

describe("cloisonnement par boutique", () => {
  it("le gérant lit une vente de sa boutique, pas celle d’une autre", async () => {
    await assertSucceeds(getDoc(doc(gerant(), "ventesMotos/vente-ptg")));
    await assertFails(getDoc(doc(gerant(), "ventesMotos/vente-kdg")));
  });

  it("le gérant interroge les ventes de sa boutique, et des siennes seulement", async () => {
    const base = gerant();
    await assertSucceeds(
      getDocs(query(collection(base, "ventesMotos"), where("boutiqueId", "==", "PTG"))),
    );
    await assertFails(
      getDocs(query(collection(base, "ventesMotos"), where("boutiqueId", "==", "KDG"))),
    );
    await assertFails(getDocs(collection(base, "ventesMotos")));
  });

  it("la lecture d’ensemble des dossiers reste bornée à sa boutique", async () => {
    const base = gerant();
    await assertSucceeds(
      getDocs(query(collectionGroup(base, "documents"), where("boutiqueId", "==", "PTG"))),
    );
    await assertFails(
      getDocs(query(collectionGroup(base, "documents"), where("boutiqueId", "==", "KDG"))),
    );
    await assertFails(getDocs(collectionGroup(base, "documents")));
  });

  it("le responsable lit tout, sans filtre", async () => {
    await assertSucceeds(getDocs(collection(responsable(), "ventesMotos")));
    await assertSucceeds(getDocs(collectionGroup(responsable(), "documents")));
    await assertSucceeds(getDoc(doc(responsable(), "ventesMotos/vente-kdg")));
  });

  it("un anonyme ne lit rien", async () => {
    const anonyme = env.unauthenticatedContext().firestore();
    await assertFails(getDoc(doc(anonyme, "ventesMotos/vente-ptg")));
    await assertFails(getDoc(doc(anonyme, "ventesMotos/vente-ptg/prive/marge")));
    await assertFails(getDoc(doc(anonyme, "encaissements/enc-ptg")));
  });

  it("le gérant ne vend pas pour une autre boutique", async () => {
    await assertFails(addDoc(collection(gerant(), "ventesMotos"), vente({ boutiqueId: "KDG" })));
  });
});

describe("le lot complet d’une vente", () => {
  it("le gérant enregistre vente, dossier, versement et encaissement d’un seul coup", async () => {
    const base = gerant();
    const reference = doc(collection(base, "ventesMotos"));
    const enc = doc(collection(base, "encaissements"));
    const lot = writeBatch(base);

    lot.set(reference, vente());
    for (const type of ["quittance", "cmc", "carte_grise", "plaque"]) {
      lot.set(doc(reference, "documents", type), documentDossier({ type, venteId: reference.id }));
    }
    lot.set(doc(collection(reference, "versements")), {
      ...versement({ venteId: reference.id, montant: 1_200_000, encaissementId: enc.id }),
    });
    lot.set(enc, encaissement({ montant: 1_200_000, origineRefId: reference.id }));

    await assertSucceeds(lot.commit());
  });

  it("le responsable vend dans n’importe quelle boutique", async () => {
    await assertSucceeds(
      addDoc(
        collection(responsable(), "ventesMotos"),
        vente({ boutiqueId: "KDG", numero: "KDG-2608-0008", numeroInitial: "KDG-2608-0008" }, "resp-1"),
      ),
    );
  });
});

describe("les deux numéros", () => {
  it("exige que les deux soient égaux à la création — c’est la clé de rapprochement", async () => {
    await assertFails(
      addDoc(collection(gerant(), "ventesMotos"), vente({ numeroInitial: "PTG-2608-0041" })),
    );
  });

  it("refuse un numéro déjà suffixé : le -B est la réponse du serveur, pas une saisie", async () => {
    await assertFails(
      addDoc(
        collection(gerant(), "ventesMotos"),
        vente({ numero: "PTG-2608-0042-B", numeroInitial: "PTG-2608-0042-B" }),
      ),
    );
  });

  it("refuse un numéro qui n’a pas la forme attendue", async () => {
    await assertFails(
      addDoc(collection(gerant(), "ventesMotos"), vente({ numero: "42", numeroInitial: "42" })),
    );
  });

  it("aucun navigateur ne réécrit une vente : ni le numéro initial, ni rien d’autre", async () => {
    /* Les mises à jour sont fermées en bloc jusqu’à S9. `numeroInitial` est
       ainsi immuable par construction, et le restera : S9 ouvrira les agrégats
       en le laissant hors du contrat. */
    await assertFails(
      updateDoc(doc(gerant(), "ventesMotos/vente-ptg"), { numeroInitial: "PTG-2608-0001" }),
    );
    await assertFails(updateDoc(doc(responsable(), "ventesMotos/vente-ptg"), { resteDu: 0 }));
    await assertFails(deleteDoc(doc(responsable(), "ventesMotos/vente-ptg")));
  });
});

describe("l’arithmétique de la vente, vérifiée côté serveur", () => {
  it("refuse un total payé et un reste dû qui ne font pas le prix convenu", async () => {
    await assertFails(
      addDoc(collection(gerant(), "ventesMotos"), vente({ totalPaye: 500_000, resteDu: 0 })),
    );
  });

  it("refuse un statut de paiement qui ment sur les montants", async () => {
    await assertFails(
      addDoc(
        collection(gerant(), "ventesMotos"),
        vente({ totalPaye: 0, resteDu: 1_200_000, statutPaiement: "solde", dernierVersementAt: null }),
      ),
    );
    await assertFails(
      addDoc(
        collection(gerant(), "ventesMotos"),
        venteTranches({ totalPaye: 400_000, resteDu: 800_000, statutPaiement: "impaye" }),
      ),
    );
  });

  it("refuse une vente au comptant qui laisse un reste dû", async () => {
    await assertFails(
      addDoc(
        collection(gerant(), "ventesMotos"),
        vente({ totalPaye: 400_000, resteDu: 800_000, statutPaiement: "partiel" }),
      ),
    );
  });

  it("refuse un prix nul, négatif ou décimal", async () => {
    await assertFails(
      addDoc(collection(gerant(), "ventesMotos"), vente({ prixConvenu: 0, totalPaye: 0, resteDu: 0 })),
    );
    await assertFails(
      addDoc(
        collection(gerant(), "ventesMotos"),
        vente({ prixConvenu: 1_200_000.5, totalPaye: 1_200_000.5, resteDu: 0 }),
      ),
    );
  });

  it("refuse un versement daté du futur — une horloge déréglée fausserait la caisse", async () => {
    const demain = new Date(Date.now() + 3 * 24 * 3600 * 1000);
    await assertFails(
      addDoc(collection(gerant(), "ventesMotos"), vente({ date: demain, dernierVersementAt: demain, dateRemiseMoto: demain })),
    );
  });

  it("accepte une vente datée d’hier : celle qui a été saisie hors ligne", async () => {
    await assertSucceeds(addDoc(collection(gerant(), "ventesMotos"), vente()));
  });
});

describe("crédit et tranches ne se confondent pas", () => {
  it("une vente en tranches retient la moto : pas de remise, pas de date de remise", async () => {
    await assertSucceeds(addDoc(collection(gerant(), "ventesMotos"), venteTranches()));
    await assertFails(
      addDoc(collection(gerant(), "ventesMotos"), venteTranches({ motoRemise: true })),
    );
    await assertFails(
      addDoc(collection(gerant(), "ventesMotos"), venteTranches({ dateRemiseMoto: hier })),
    );
  });

  it("une vente à crédit livre la moto, même si rien n’a été versé", async () => {
    await assertSucceeds(
      addDoc(
        collection(gerant(), "ventesMotos"),
        vente({
          modePaiement: "credit",
          totalPaye: 0,
          resteDu: 1_200_000,
          statutPaiement: "impaye",
          dernierVersementAt: null,
        }),
      ),
    );
  });

  it("une vente à crédit ne peut pas retenir la moto — ce serait des tranches", async () => {
    await assertFails(
      addDoc(
        collection(gerant(), "ventesMotos"),
        vente({
          modePaiement: "credit",
          totalPaye: 0,
          resteDu: 1_200_000,
          statutPaiement: "impaye",
          dernierVersementAt: null,
          motoRemise: false,
          dateRemiseMoto: null,
        }),
      ),
    );
  });
});

describe("le token de suivi", () => {
  it("exige 32 octets en base64url, ni plus court ni mal formé", async () => {
    await assertFails(addDoc(collection(gerant(), "ventesMotos"), vente({ tokenSuivi: "court" })));
    await assertFails(
      addDoc(collection(gerant(), "ventesMotos"), vente({ tokenSuivi: `${"+".repeat(43)}` })),
    );
    await assertFails(addDoc(collection(gerant(), "ventesMotos"), vente({ tokenSuivi: null })));
  });
});

describe("le dossier naît ouvert, ses quatre documents à faire", () => {
  it("refuse une vente qui naîtrait close ou déjà envoyée", async () => {
    await assertFails(
      addDoc(collection(gerant(), "ventesMotos"), vente({ statutDossier: "clos" })),
    );
    await assertFails(
      addDoc(collection(gerant(), "ventesMotos"), vente({ lienSuiviEnvoyeAt: hier })),
    );
  });

  it("refuse un document de dossier qui naîtrait déjà avancé — c’est S11 qui le fera vivre", async () => {
    const base = gerant();
    const reference = doc(collection(base, "ventesMotos"));
    for (const statut of ["chez_prestataire", "remis_client", "non_applicable"]) {
      const lot = writeBatch(base);
      lot.set(reference, vente());
      lot.set(
        doc(reference, "documents", "carte_grise"),
        documentDossier({ statut, venteId: reference.id }),
      );
      await assertFails(lot.commit());
    }
  });

  it("refuse un type de document inconnu, et un type qui ment sur son identifiant", async () => {
    const base = gerant();
    const reference = doc(collection(base, "ventesMotos"));

    const inconnu = writeBatch(base);
    inconnu.set(reference, vente());
    inconnu.set(
      doc(reference, "documents", "assurance"),
      documentDossier({ type: "assurance", venteId: reference.id }),
    );
    await assertFails(inconnu.commit());

    const menteur = writeBatch(base);
    menteur.set(reference, vente());
    menteur.set(
      doc(reference, "documents", "plaque"),
      documentDossier({ type: "carte_grise", venteId: reference.id }),
    );
    await assertFails(menteur.commit());
  });

  it("un document de dossier ne se modifie ni ne s’efface avant S11", async () => {
    await assertFails(
      updateDoc(doc(gerant(), "ventesMotos/vente-ptg/documents/carte_grise"), {
        statut: "remis_client",
      }),
    );
    await assertFails(
      deleteDoc(doc(responsable(), "ventesMotos/vente-ptg/documents/carte_grise")),
    );
  });
});

describe("versements et encaissements", () => {
  it("refuse un versement de zéro ou négatif", async () => {
    const base = gerant();
    await assertFails(
      addDoc(collection(base, "ventesMotos/vente-ptg/versements"), versement({ montant: 0 })),
    );
    await assertFails(
      addDoc(collection(base, "ventesMotos/vente-ptg/versements"), versement({ montant: -1000 })),
    );
  });

  it("refuse un moyen de paiement inconnu", async () => {
    await assertFails(
      addDoc(
        collection(gerant(), "ventesMotos/vente-ptg/versements"),
        versement({ moyenPaiement: "cheque" }),
      ),
    );
  });

  it("un versement ne se retouche pas ici : corriger est une opération de S9", async () => {
    await assertFails(
      updateDoc(doc(gerant(), "ventesMotos/vente-ptg/versements/vers-1"), { montant: 1 }),
    );
    await assertFails(
      deleteDoc(doc(responsable(), "ventesMotos/vente-ptg/versements/vers-1")),
    );
  });

  it("le gérant écrit un encaissement pour sa boutique, jamais pour une autre", async () => {
    await assertSucceeds(addDoc(collection(gerant(), "encaissements"), encaissement()));
    await assertFails(
      addDoc(collection(gerant(), "encaissements"), encaissement({ boutiqueId: "KDG" })),
    );
  });

  it("refuse une origine ou un sens hors contrat", async () => {
    await assertFails(
      addDoc(collection(gerant(), "encaissements"), encaissement({ origine: "cadeau" })),
    );
    await assertFails(
      addDoc(collection(gerant(), "encaissements"), encaissement({ sens: "transfert" })),
    );
  });

  it("exige de dire si l’argent est un engagement — la caisse en dépendra", async () => {
    await assertFails(
      addDoc(collection(gerant(), "encaissements"), encaissement({ categorieTranches: "oui" })),
    );
  });

  it("une écriture de caisse ne se retouche pas : on la contre-passe", async () => {
    await assertFails(updateDoc(doc(responsable(), "encaissements/enc-ptg"), { montant: 1 }));
    await assertFails(deleteDoc(doc(responsable(), "encaissements/enc-ptg")));
  });

  it("le gérant ne lit pas la caisse d’une autre boutique", async () => {
    await assertSucceeds(getDoc(doc(gerant(), "encaissements/enc-ptg")));
    await assertFails(getDoc(doc(gerant(), "encaissements/enc-kdg")));
  });
});
