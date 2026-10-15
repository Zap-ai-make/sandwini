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
  writeBatch,
} from "firebase/firestore";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

/**
 * Les règles du paquet de cartes grises (S53).
 *
 * **Une trace de premier niveau, comme `transfertsMotos` (S17).** Un paquet se
 * liste par sa boutique sans requête de groupe de collections, et il ne se
 * modifie jamais : on corrige en faisant revenir les cartes, ce qui laisse les
 * deux traces.
 *
 * **Aucun champ d'état n'est accepté**, et ces tests le figent. Un paquet est
 * soldé quand aucune de ses cartes n'est plus dehors, ce qui se calcule
 * (`lib/domain/paquet.ts`). Un champ « rendu » dirait un jour le contraire de
 * ses propres documents, et il faudrait un geste pour les raccorder.
 */

let env: RulesTestEnvironment;

const HOTE = "127.0.0.1";
const PORT = 8181;

const responsable = () => env.authenticatedContext("resp-1", { role: "responsable" }).firestore();
const gerant = (uid = "ger-1", boutiqueId = "PTG") =>
  env.authenticatedContext(uid, { role: "gerant", boutiqueId }).firestore();

const audit = (uid = "ger-1") => ({
  createdAt: serverTimestamp(),
  createdBy: uid,
  createdByName: "Gérant",
  updatedAt: serverTimestamp(),
  updatedBy: uid,
  updatedByName: "Gérant",
});

const paquet = (partie: Record<string, unknown> = {}) => ({
  boutiqueId: "PTG",
  prestataireId: "p1",
  prestataireNom: "Ouédraogo Plaques",
  deposeLe: new Date("2026-10-15T12:00:00"),
  disponibleLe: null,
  avance: 150_000,
  venteIds: ["v1", "v2"],
  ...audit(),
  ...partie,
});

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: "sdi-regles-paquets",
    firestore: { rules: readFileSync("firestore.rules", "utf8"), host: HOTE, port: PORT },
  });
});

afterAll(async () => env?.cleanup());

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (contexte) => {
    const base = contexte.firestore();
    await setDoc(doc(base, "lotsCartesGrises/lot-ptg"), paquet());
    await setDoc(doc(base, "lotsCartesGrises/lot-kdg"), paquet({ boutiqueId: "KDG" }));

    /* Deux ventes avec leur carte grise à faire : le décor réel d'un dépôt
       groupé. Les documents existent déjà — c'est S8 qui les ouvre à la vente —
       et le paquet ne fait que les faire avancer. */
    for (const venteId of ["v1", "v2"]) {
      await setDoc(doc(base, `ventesMotos/${venteId}`), { boutiqueId: "PTG", ...audit() });
      await setDoc(doc(base, `ventesMotos/${venteId}/documents/carte_grise`), {
        boutiqueId: "PTG",
        venteId,
        type: "carte_grise",
        statut: "a_faire",
        ...audit(),
      });
    }
  });
});

describe("le paquet de cartes grises", () => {
  it("le gérant confie un paquet dans sa boutique", async () => {
    await assertSucceeds(addDoc(collection(gerant(), "lotsCartesGrises"), paquet()));
  });

  /* **Le critère de la spec, nommément.** Un gérant ne lit ni n'écrit le paquet
     d'une autre boutique. */
  it("refuse le paquet d’une autre boutique, en lecture comme en écriture", async () => {
    await assertFails(getDoc(doc(gerant(), "lotsCartesGrises/lot-kdg")));
    await assertFails(
      addDoc(collection(gerant(), "lotsCartesGrises"), paquet({ boutiqueId: "KDG" })),
    );
  });

  it("le responsable lit toutes les boutiques", async () => {
    await assertSucceeds(getDoc(doc(responsable(), "lotsCartesGrises/lot-kdg")));
  });

  it("le gérant liste les paquets de sa boutique", async () => {
    await assertSucceeds(
      getDocs(query(collection(gerant(), "lotsCartesGrises"), where("boutiqueId", "==", "PTG"))),
    );
  });

  it("refuse un paquet sans carte : l’avance partirait sans contrepartie", async () => {
    await assertFails(addDoc(collection(gerant(), "lotsCartesGrises"), paquet({ venteIds: [] })));
  });

  it("refuse une avance nulle — sans montant, c’est un crédit", async () => {
    await assertFails(addDoc(collection(gerant(), "lotsCartesGrises"), paquet({ avance: 0 })));
  });

  it("refuse un prestataire vide", async () => {
    await assertFails(
      addDoc(collection(gerant(), "lotsCartesGrises"), paquet({ prestataireId: "" })),
    );
  });

  /* Le champ d'état que cette spec refuse. Le test existe pour qu'une
     reconstitution bien intentionnée de « rendu » bute ici. */
  it("refuse un champ inventé, et « rendu » en particulier", async () => {
    await assertFails(addDoc(collection(gerant(), "lotsCartesGrises"), paquet({ rendu: true })));
  });

  /* Un paquet est un fait. Lui donner un état modifiable rouvrirait la
     contradiction que `etatPaquet` ferme en le calculant. */
  it("ne se modifie ni ne se supprime, pour personne", async () => {
    await assertFails(
      updateDoc(doc(responsable(), "lotsCartesGrises/lot-ptg"), {
        avance: 1,
        updatedAt: serverTimestamp(),
        updatedBy: "resp-1",
        updatedByName: "Responsable",
      }),
    );
    await assertFails(deleteDoc(doc(responsable(), "lotsCartesGrises/lot-ptg")));
  });
});

/**
 * Le lot exact que `lib/repositories/paquets.ts` envoie.
 *
 * **Les cas ci-dessus valident le document du paquet SEUL.** Or le produit ne
 * l'envoie jamais seul : il part avec les mises à jour des documents, leurs
 * lignes d'historique et la sortie de caisse de l'avance, dans un
 * `writeBatch`. Et un lot est accepté ou refusé **en bloc** — une seule des
 * écritures refusée, et le dépôt entier reste coincé dans la file, sans erreur
 * visible à l'écran puisque l'affichage optimiste a déjà montré le résultat.
 *
 * C'est exactement la panne trouvée en S30 sur le dépôt unitaire, et la raison
 * pour laquelle elle est retestée ici sur la forme groupée.
 */
describe("le lot complet du dépôt groupé", () => {
  const depot = (base: ReturnType<typeof gerant>, venteIds: readonly string[]) => {
    const lot = writeBatch(base);
    const reference = doc(collection(base, "lotsCartesGrises"));
    const depose = new Date("2026-10-15T12:00:00");

    lot.set(reference, paquet({ venteIds: [...venteIds] }));

    for (const venteId of venteIds) {
      const cible = doc(base, `ventesMotos/${venteId}/documents/carte_grise`);
      lot.update(cible, {
        statut: "chez_prestataire",
        prestataireId: "p1",
        prestataireNom: "Ouédraogo Plaques",
        deposeLe: depose,
        avance: 75_000,
        disponibleLe: null,
        updatedAt: serverTimestamp(),
        updatedBy: "ger-1",
        updatedByName: "Gérant",
      });
      lot.set(doc(collection(cible, "historique")), {
        boutiqueId: "PTG",
        venteId,
        type: "carte_grise",
        de: "a_faire",
        vers: "chez_prestataire",
        le: depose,
        ...audit(),
      });
    }

    return { lot, reference };
  };

  const sortie = (montant: number, refId: string, nombre: number) => ({
    boutiqueId: "PTG",
    date: new Date("2026-10-15T12:00:00"),
    sens: "sortie",
    montant,
    moyenPaiement: "especes",
    origine: "avance_prestataire",
    origineRefId: refId,
    libelle: `Avance Ouédraogo Plaques — ${nombre} cartes grises`,
    categorieTranches: false,
    ...audit(),
  });

  it("passe : le paquet, les deux documents, leurs historiques et une seule sortie de caisse", async () => {
    const base = gerant();
    const { lot, reference } = depot(base, ["v1", "v2"]);
    lot.set(doc(collection(base, "encaissements")), sortie(150_000, reference.id, 2));
    await assertSucceeds(lot.commit());
  });

  /* **La preuve d'atomicité, et ce qu'elle peut prouver.** Les règles Firestore
     ne savent pas joindre : aucune ne peut vérifier que les `venteIds` du
     paquet correspondent aux documents mis à jour dans le même lot. Ce que la
     base garantit, et qui suffit, c'est qu'un lot est accepté ou refusé **en
     bloc** — donc qu'une seule écriture fautive empêche le paquet d'exister.

     Le test le prouve par la conséquence, qui est la seule chose qui compte :
     après le refus, le paquet n'est **pas** là. Sans cela, on aurait un paquet
     qui promet des cartes que personne n'a fait partir. */
  it("ne laisse aucun paquet derrière lui quand une écriture du lot est refusée", async () => {
    const base = gerant();
    const { lot, reference } = depot(base, ["v1"]);
    /* La trace mensongère est l'écriture fautive : `traceCreation` exige que
       `createdBy` soit le compte qui écrit. */
    lot.set(doc(collection(base, "encaissements")), {
      ...sortie(150_000, reference.id, 1),
      createdBy: "quelqu-un-dautre",
    });
    await assertFails(lot.commit());

    /* Et c'est ici que l'atomicité se vérifie : le paquet, première écriture du
       lot et parfaitement valide à elle seule, n'existe pas. */
    await env.withSecurityRulesDisabled(async (contexte) => {
      const relu = await getDoc(doc(contexte.firestore(), "lotsCartesGrises", reference.id));
      expect(relu.exists()).toBe(false);
    });
  });

  /* Le symétrique : un document que la machine à états refuse de faire avancer
     emporte le paquet avec lui. Une carte déjà chez un prestataire n'a pas de
     transition vers `chez_prestataire` — c'est ce que `cartesConfiables` écarte
     côté écran, et voici ce qui se passerait si l'écran se trompait. */
  it("échoue si une carte du lot est déjà chez un prestataire", async () => {
    await env.withSecurityRulesDisabled(async (contexte) => {
      await updateDoc(doc(contexte.firestore(), "ventesMotos/v2/documents/carte_grise"), {
        statut: "chez_prestataire",
        prestataireId: "p1",
        prestataireNom: "Un autre",
        deposeLe: new Date("2026-10-01T12:00:00"),
        avance: 10_000,
      });
    });

    const base = gerant();
    const { lot, reference } = depot(base, ["v1", "v2"]);
    lot.set(doc(collection(base, "encaissements")), sortie(150_000, reference.id, 2));
    await assertFails(lot.commit());
  });
});
