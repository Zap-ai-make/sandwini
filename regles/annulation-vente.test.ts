import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { readFileSync } from "node:fs";
import { doc, serverTimestamp, setDoc, updateDoc, writeBatch } from "firebase/firestore";
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";

/**
 * Règles de l'annulation et de la correction d'une vente (S25).
 *
 * Trois principes à prouver, ceux de D10 : **rien ne s'efface** — une vente
 * annulée reste, et ne bouge plus ; **un versement ne se retouche pas** —
 * l'argent ressort par un encaissement de sens inverse ; **tout est attribué**
 * — l'annulation porte son auteur, sa date et son motif, et l'auteur est bien
 * l'appelant. Le gérant de la boutique annule comme le responsable (D109) ;
 * celui d'une autre boutique, non.
 */

let env: RulesTestEnvironment;

const HOTE = "127.0.0.1";
const PORT = 8181;

const responsable = () => env.authenticatedContext("resp-1", { role: "responsable" }).firestore();
const gerant = (uid = "ger-1", boutiqueId = "PTG") =>
  env.authenticatedContext(uid, { role: "gerant", boutiqueId }).firestore();

const TOKEN_VALIDE = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLM012-_".slice(0, 43);
const hier = new Date(Date.now() - 24 * 3600 * 1000);

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

const modification = (auteur: string) => ({
  updatedAt: serverTimestamp(),
  updatedBy: auteur,
  updatedByName: "Auteur",
});

/** Une vente à crédit partiellement payée : il y a de l'argent à rendre. */
const vente = (partie: Record<string, unknown> = {}, auteur = "ger-1") => ({
  numero: "PTG-2610-0042",
  numeroInitial: "PTG-2610-0042",
  boutiqueId: "PTG",
  motoId: "moto-ptg",
  clientId: "client-1",
  date: hier,
  prixConvenu: 1_200_000,
  modePaiement: "credit",
  carteGrise: true,
  casque: true,
  totalPaye: 400_000,
  resteDu: 800_000,
  statutPaiement: "partiel",
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

/** Les quatre champs de l'annulation, posés ensemble. */
const annulation = (auteur = "ger-1", partie: Record<string, unknown> = {}) => ({
  annulee: true,
  annuleeLe: new Date(),
  annuleePar: { uid: auteur, nom: "Auteur" },
  motifAnnulation: "Le client s'est rétracté",
  ...modification(auteur),
  ...partie,
});

const encaissement = (partie: Record<string, unknown> = {}, auteur = "ger-1") => ({
  boutiqueId: "PTG",
  date: new Date(),
  sens: "sortie",
  montant: 400_000,
  moyenPaiement: "especes",
  origine: "annulation_vente",
  origineRefId: "vente-ptg",
  libelle: "Remboursement vente 0042",
  categorieTranches: false,
  ...audit(auteur),
  ...partie,
});

const dossier = (partie: Record<string, unknown> = {}) => ({
  boutiqueId: "PTG",
  venteId: "vente-ptg",
  origine: "vente",
  clientNom: "Sawadogo Harouna",
  motoLibelle: "Yamaha SR 115",
  numeroChassis: "02SY052982",
  statut: "chez_prestataire",
  prestataireId: null,
  prestataireNom: "Kaboré",
  deposeLe: hier,
  avance: null,
  disponibleLe: null,
  immatriculation: "",
  revenuLe: null,
  remisLe: null,
  remisANom: "",
  remisATelephone: "",
  ...auditFige,
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
    projectId: "sdi-regles-annulation",
    firestore: { rules: readFileSync("firestore.rules", "utf8"), host: HOTE, port: PORT },
  });
});

afterAll(async () => env?.cleanup());

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (contexte) => {
    const base = contexte.firestore();
    await setDoc(doc(base, "ventesMotos/vente-ptg"), { ...vente(), ...auditFige });
    await setDoc(doc(base, "ventesMotos/vente-kdg"), {
      ...vente({ boutiqueId: "KDG", numero: "KDG-2610-0007", numeroInitial: "KDG-2610-0007" }),
      ...auditFige,
    });
    await setDoc(doc(base, "ventesMotos/vente-annulee"), {
      ...vente({ numero: "PTG-2610-0043", numeroInitial: "PTG-2610-0043" }),
      ...auditFige,
      annulee: true,
      annuleeLe: hier,
      annuleePar: { uid: "ger-1", nom: "Auteur" },
      motifAnnulation: "Erreur de saisie",
    });
    await setDoc(doc(base, "dossiersCarteGrise/vente-ptg"), dossier());
  });
});

describe("qui annule", () => {
  it("le gérant annule une vente de sa boutique", async () => {
    await assertSucceeds(updateDoc(doc(gerant(), "ventesMotos/vente-ptg"), annulation()));
  });

  it("le responsable annule une vente de n’importe quelle boutique", async () => {
    await assertSucceeds(
      updateDoc(doc(responsable(), "ventesMotos/vente-kdg"), annulation("resp-1")),
    );
  });

  it("le gérant d’une autre boutique, non", async () => {
    await assertFails(updateDoc(doc(gerant(), "ventesMotos/vente-kdg"), annulation()));
  });

  it("l’auteur inscrit est l’appelant, et personne d’autre", async () => {
    await assertFails(
      updateDoc(
        doc(gerant(), "ventesMotos/vente-ptg"),
        annulation("ger-1", { annuleePar: { uid: "resp-1", nom: "Le patron" } }),
      ),
    );
  });
});

describe("ce que porte une annulation", () => {
  it("exige un motif", async () => {
    await assertFails(
      updateDoc(doc(gerant(), "ventesMotos/vente-ptg"), annulation("ger-1", { motifAnnulation: "" })),
    );
  });

  it("borne le motif à 200 caractères", async () => {
    await assertFails(
      updateDoc(
        doc(gerant(), "ventesMotos/vente-ptg"),
        annulation("ger-1", { motifAnnulation: "m".repeat(201) }),
      ),
    );
  });

  it("exige les quatre champs ensemble", async () => {
    const sansMotif: Record<string, unknown> = annulation();
    delete sansMotif.motifAnnulation;
    await assertFails(updateDoc(doc(gerant(), "ventesMotos/vente-ptg"), sansMotif));
  });

  it("refuse une annulation datée du futur", async () => {
    await assertFails(
      updateDoc(
        doc(gerant(), "ventesMotos/vente-ptg"),
        annulation("ger-1", { annuleeLe: new Date(Date.now() + 3 * 24 * 3600 * 1000) }),
      ),
    );
  });

  it("ne change rien d’autre : le prix reste intouchable", async () => {
    await assertFails(
      updateDoc(
        doc(gerant(), "ventesMotos/vente-ptg"),
        annulation("ger-1", { prixConvenu: 900_000, resteDu: 500_000 }),
      ),
    );
  });

  it("accepte le lien vers la vente qui la corrige", async () => {
    await assertSucceeds(
      updateDoc(
        doc(gerant(), "ventesMotos/vente-ptg"),
        annulation("ger-1", { remplaceeParId: "vente-nouvelle" }),
      ),
    );
  });
});

describe("une vente annulée ne bouge plus", () => {
  it("ne se ré-annule pas", async () => {
    await assertFails(
      updateDoc(
        doc(gerant(), "ventesMotos/vente-annulee"),
        annulation("ger-1", { motifAnnulation: "Une seconde fois" }),
      ),
    );
  });

  it("ne se désannule pas", async () => {
    await assertFails(
      updateDoc(doc(gerant(), "ventesMotos/vente-annulee"), {
        annulee: false,
        ...modification("ger-1"),
      }),
    );
  });

  it("n’accepte plus de versement", async () => {
    await assertFails(
      updateDoc(doc(gerant(), "ventesMotos/vente-annulee"), {
        totalPaye: 600_000,
        resteDu: 600_000,
        statutPaiement: "partiel",
        dernierVersementAt: new Date(),
        ...modification("ger-1"),
      }),
    );
  });

  it("n’accepte plus de papier emporté", async () => {
    await assertFails(
      updateDoc(doc(gerant(), "ventesMotos/vente-annulee"), {
        emporte: { quittance: true, cmc: false },
        ...modification("ger-1"),
      }),
    );
  });

  it("une vente qui ne l’est pas accepte toujours son versement", async () => {
    await assertSucceeds(
      updateDoc(doc(gerant(), "ventesMotos/vente-ptg"), {
        totalPaye: 600_000,
        resteDu: 600_000,
        statutPaiement: "partiel",
        dernierVersementAt: new Date(),
        ...modification("ger-1"),
      }),
    );
  });
});

describe("l’argent rendu", () => {
  it("le remboursement d’une vente est une sortie de caisse", async () => {
    await assertSucceeds(setDoc(doc(gerant(), "encaissements/remb-1"), encaissement()));
  });

  it("jamais une entrée", async () => {
    await assertFails(
      setDoc(doc(gerant(), "encaissements/remb-1"), encaissement({ sens: "entree" })),
    );
  });
});

describe("le dossier d’une vente annulée", () => {
  it("se marque « vente annulée » quand la carte est déjà partie", async () => {
    await assertSucceeds(
      updateDoc(doc(gerant(), "dossiersCarteGrise/vente-ptg"), {
        venteAnnulee: true,
        ...modification("ger-1"),
      }),
    );
  });

  it("refuse une marque qui ne soit pas un booléen", async () => {
    await assertFails(
      updateDoc(doc(gerant(), "dossiersCarteGrise/vente-ptg"), {
        venteAnnulee: "oui",
        ...modification("ger-1"),
      }),
    );
  });
});

describe("la correction, d’un seul lot", () => {
  it("annule l’ancienne et enregistre la nouvelle, qui la cite", async () => {
    const base = gerant();
    const lot = writeBatch(base);
    lot.update(
      doc(base, "ventesMotos/vente-ptg"),
      annulation("ger-1", {
        motifAnnulation: "Corrigée par la vente 0044",
        remplaceeParId: "vente-nouvelle",
      }),
    );
    lot.set(
      doc(base, "ventesMotos/vente-nouvelle"),
      vente({
        numero: "PTG-2610-0044",
        numeroInitial: "PTG-2610-0044",
        date: new Date(),
        dernierVersementAt: new Date(),
        dateRemiseMoto: new Date(),
        remplaceId: "vente-ptg",
      }),
    );
    lot.set(doc(base, "encaissements/remb-1"), encaissement());
    await assertSucceeds(lot.commit());
  });

  it("refuse une nouvelle vente qui citerait une vente vide", async () => {
    await assertFails(
      setDoc(
        doc(gerant(), "ventesMotos/vente-nouvelle"),
        vente({
          numero: "PTG-2610-0044",
          numeroInitial: "PTG-2610-0044",
          remplaceId: "",
        }),
      ),
    );
  });
});
