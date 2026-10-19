import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { readFileSync } from "node:fs";
import { collection, deleteDoc, doc, getDoc, serverTimestamp, setDoc, updateDoc } from "firebase/firestore";
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";

/**
 * Règles sur la vente de pièces au comptoir (S21).
 *
 * **Une vente de pièces est une pièce comptable.** Elle porte un numéro qu'on
 * dicte au téléphone et elle ne se retouche pas : le stock est descendu, la
 * recette est au journal, et un document modifiable rendrait les trois
 * incohérents sans laisser de trace. C'est ce que ces tests figent.
 *
 * **Ce qu'ils figent aussi, c'est une absence.** Trois choses ne peuvent pas
 * être tenues par une règle — le détail des lignes au-delà de la première, le
 * lien vers les mouvements de stock, et le stock disponible — et les tests le
 * disent explicitement plutôt que de laisser croire à une protection qui
 * n'existe pas. Une règle qui ne peut pas protéger doit nommer qui protège à sa
 * place, sinon quelqu'un retirera un jour le garde-fou du geste en croyant la
 * base derrière lui.
 *
 * **Ce qui a changé, c'est l'argent.** Le total du document est désormais
 * confronté à la somme de son détail, et le total de chacune des vingt lignes
 * est exigé entier et positif. C'était le trou le plus large de cette
 * collection : une vente pouvait annoncer un franc en face de lignes en
 * annonçant douze mille, pour toujours, puisque rien ne se retouche ici.
 * Vérifier *entièrement* les vingt lignes a été essayé et mesuré : le plafond
 * de 1000 expressions par requête tombe dès la sixième (voir le dernier test du
 * groupe « la forme des lignes »).
 */

let env: RulesTestEnvironment;

const HOTE = "127.0.0.1";
const PORT = 8181;

const responsable = () => env.authenticatedContext("resp-1", { role: "responsable" }).firestore();
const gerant = (uid = "ger-1", boutiqueId = "PTG") =>
  env.authenticatedContext(uid, { role: "gerant", boutiqueId }).firestore();
const anonyme = () => env.unauthenticatedContext().firestore();

const audit = (auteur: string) => ({
  createdAt: serverTimestamp(),
  createdBy: auteur,
  createdByName: "Auteur",
  updatedAt: serverTimestamp(),
  updatedBy: auteur,
  updatedByName: "Auteur",
});

const ligne = (partie: Record<string, unknown> = {}) => ({
  pieceId: "plaquette",
  reference: "PLQ-0142",
  designation: "Plaquette de frein avant",
  quantite: 2,
  prixUnitaire: 3_500,
  /* Le coût du jour, recopié dans la ligne : la marge d'une vente passée ne
     doit pas bouger quand la même pièce est rachetée plus cher. */
  prixAchatUnitaire: 2_000,
  total: 7_000,
  ...partie,
});

const vente = (partie: Record<string, unknown> = {}, auteur = "ger-1") => ({
  numero: "PTG-2609-0001",
  numeroInitial: "PTG-2609-0001",
  boutiqueId: "PTG",
  date: new Date("2026-09-01T09:00:00Z"),
  clientId: "",
  lignes: [ligne()],
  total: 7_000,
  moyenPaiement: "especes",
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
    projectId: "sdi-regles-vente-pieces",
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
      boutiqueId: "PTG",
      prixVente: 3_500,
      prixAchat: 2_000,
      seuilAlerte: 5,
      actif: true,
      createdAt: new Date("2026-01-01T08:00:00Z"),
      createdBy: "resp-1",
      createdByName: "Auteur",
      updatedAt: new Date("2026-01-01T08:00:00Z"),
      updatedBy: "resp-1",
      updatedByName: "Auteur",
    });
  });
});

describe("qui peut enregistrer une vente de pièces", () => {
  it("le gérant de la boutique la crée : c’est son comptoir", async () => {
    await assertSucceeds(setDoc(doc(gerant(), "ventesPieces/v1"), vente()));
  });

  it("le responsable aussi : il tient parfois le comptoir lui-même", async () => {
    await assertSucceeds(setDoc(doc(responsable(), "ventesPieces/v1"), vente({}, "resp-1")));
  });

  it("le gérant d’une autre boutique ne vend pas ici", async () => {
    await assertFails(
      setDoc(doc(gerant("ger-2", "OUA"), "ventesPieces/v1"), vente({}, "ger-2")),
    );
  });

  it("un visiteur anonyme n’écrit rien, et ne lit rien", async () => {
    await assertFails(setDoc(doc(anonyme(), "ventesPieces/v1"), vente({}, "personne")));

    await env.withSecurityRulesDisabled(async (contexte) => {
      await setDoc(doc(contexte.firestore(), "ventesPieces/v1"), vente());
    });
    await assertFails(getDoc(doc(anonyme(), "ventesPieces/v1")));
  });
});

describe("une vente enregistrée ne se retouche pas, elle se contre-passe", () => {
  beforeEach(async () => {
    await env.withSecurityRulesDisabled(async (contexte) => {
      await setDoc(doc(contexte.firestore(), "ventesPieces/v1"), vente());
    });
  });

  it("personne ne modifie une vente, pas même le responsable", async () => {
    await assertFails(updateDoc(doc(responsable(), "ventesPieces/v1"), { total: 1 }));
    await assertFails(updateDoc(doc(gerant(), "ventesPieces/v1"), { total: 1 }));
  });

  it("personne ne supprime une vente", async () => {
    await assertFails(deleteDoc(doc(responsable(), "ventesPieces/v1")));
    await assertFails(deleteDoc(doc(gerant(), "ventesPieces/v1")));
  });
});

describe("la forme des lignes", () => {
  it("refuse une quantité nulle : une ligne à zéro n’est pas une vente", async () => {
    await assertFails(
      setDoc(
        doc(gerant(), "ventesPieces/v1"),
        vente({ lignes: [ligne({ quantite: 0, total: 0 })], total: 0 }),
      ),
    );
  });

  it("refuse une quantité négative", async () => {
    await assertFails(
      setDoc(
        doc(gerant(), "ventesPieces/v1"),
        vente({ lignes: [ligne({ quantite: -2, total: -7000 })], total: -7000 }),
      ),
    );
  });

  it("refuse un prix unitaire nul : ce n’est pas un cadeau, c’est une faute de frappe", async () => {
    await assertFails(
      setDoc(
        doc(gerant(), "ventesPieces/v1"),
        vente({ lignes: [ligne({ prixUnitaire: 0, total: 0 })], total: 0 }),
      ),
    );
  });

  it("refuse un total de ligne qui ne somme pas : les nombres d’un document s’accordent", async () => {
    await assertFails(
      setDoc(
        doc(gerant(), "ventesPieces/v1"),
        vente({ lignes: [ligne({ total: 9_999 })], total: 9_999 }),
      ),
    );
  });

  it("refuse un panier vide", async () => {
    await assertFails(setDoc(doc(gerant(), "ventesPieces/v1"), vente({ lignes: [], total: 0 })));
  });

  it("refuse au-delà de vingt lignes : ce n’est plus un ticket de comptoir", async () => {
    const vingtUne = Array.from({ length: 21 }, (_, n) => ligne({ pieceId: `p${n}` }));
    await assertFails(
      setDoc(
        doc(gerant(), "ventesPieces/v1"),
        vente({ lignes: vingtUne, total: 21 * 7_000 }),
      ),
    );
  });

  it("refuse un champ inconnu dans une ligne", async () => {
    await assertFails(
      setDoc(
        doc(gerant(), "ventesPieces/v1"),
        vente({ lignes: [{ ...ligne(), remise: 500 }] }),
      ),
    );
  });

  it("refuse une ligne au total négatif : une ligne n’en compense pas une autre", async () => {
    /* La somme seule ne suffirait pas : deux lignes opposées tombent juste. Le
       total de chacune des vingt est donc exigé strictement positif — c'est ce
       que le plafond d'expressions laisse tenir sur les dix-neuf autres. Ici le
       total du document est correct, c'est bien la ligne qui est refusée. */
    await assertFails(
      setDoc(
        doc(gerant(), "ventesPieces/v1"),
        vente({
          lignes: [
            ligne(),
            ligne({ pieceId: "b", quantite: -2, total: -7_000 }),
            ligne({ pieceId: "c" }),
          ],
          total: 7_000,
        }),
      ),
    );
  });

  it("refuse une ligne au total nul", async () => {
    await assertFails(
      setDoc(
        doc(gerant(), "ventesPieces/v1"),
        vente({
          lignes: [ligne(), ligne({ pieceId: "autre", quantite: 0, total: 0 })],
          total: 7_000,
        }),
      ),
    );
  });

  it("va jusqu’à la vingtième ligne : la borne n’est pas un angle mort", async () => {
    const dixNeuf = Array.from({ length: 19 }, (_, n) => ligne({ pieceId: `p${n}` }));
    await assertFails(
      setDoc(
        doc(gerant(), "ventesPieces/v1"),
        vente({
          lignes: [...dixNeuf, ligne({ pieceId: "p19", total: -1 })],
          total: 19 * 7_000 - 1,
        }),
      ),
    );
  });

  it("accepte vingt lignes justes : le dépliage ne doit pas étouffer la borne", async () => {
    /* Vingt lignes, c'est le pire cas d'évaluation de ces règles, et le plafond
       de 1000 expressions par requête n'est pas loin : c'est lui qui a imposé
       de ne déplier que les totaux plutôt que la validation entière des lignes.
       Mesuré : six lignes intégralement vérifiées le franchissaient déjà, et
       dix en n'en gardant que les nombres. Ce test est la sentinelle de cette
       mesure — s'il rougit, c'est qu'une règle a grossi ailleurs et que le
       budget est épuisé. Le symptôme en production serait un refus d'écriture
       sur les grosses ventes, et lui seul. */
    const vingt = Array.from({ length: 20 }, (_, n) => ligne({ pieceId: `p${n}` }));
    await assertSucceeds(
      setDoc(doc(gerant(), "ventesPieces/v1"), vente({ lignes: vingt, total: 20 * 7_000 })),
    );
  });
});

describe("le total du document s’accorde avec son détail", () => {
  it("refuse un total qui contredit la somme des lignes", async () => {
    await assertFails(
      setDoc(
        doc(gerant(), "ventesPieces/v1"),
        vente({ lignes: [ligne(), ligne({ pieceId: "autre" })], total: 7_000 }),
      ),
    );
  });

  it("accepte le total juste sur plusieurs lignes", async () => {
    await assertSucceeds(
      setDoc(
        doc(gerant(), "ventesPieces/v1"),
        vente({ lignes: [ligne(), ligne({ pieceId: "autre" })], total: 14_000 }),
      ),
    );
  });
});

describe("la forme de la vente", () => {
  it("refuse un numéro qui n’est pas au format d’une pièce comptable", async () => {
    await assertFails(
      setDoc(
        doc(gerant(), "ventesPieces/v1"),
        vente({ numero: "vente-1", numeroInitial: "vente-1" }),
      ),
    );
  });

  it("refuse un numéro déjà suffixé : un appareil n’émet que des numéros d’origine", async () => {
    await assertFails(
      setDoc(
        doc(gerant(), "ventesPieces/v1"),
        vente({ numero: "PTG-2609-0001-B", numeroInitial: "PTG-2609-0001-B" }),
      ),
    );
  });

  it("refuse `numeroInitial` différent du numéro : c’est la clé de rapprochement", async () => {
    await assertFails(
      setDoc(doc(gerant(), "ventesPieces/v1"), vente({ numeroInitial: "PTG-2609-0002" })),
    );
  });

  it("accepte un client vide : au comptoir, on ne demande pas son nom", async () => {
    await assertSucceeds(setDoc(doc(gerant(), "ventesPieces/v1"), vente({ clientId: "" })));
  });

  it("refuse un moyen de paiement inconnu", async () => {
    await assertFails(
      setDoc(doc(gerant(), "ventesPieces/v1"), vente({ moyenPaiement: "cheque" })),
    );
  });

  it("refuse un total nul", async () => {
    await assertFails(setDoc(doc(gerant(), "ventesPieces/v1"), vente({ total: 0 })));
  });

  it("refuse une date d’appareil en avance de plus d’un jour", async () => {
    const dansDeuxJours = new Date(Date.now() + 2 * 24 * 3_600_000);
    await assertFails(setDoc(doc(gerant(), "ventesPieces/v1"), vente({ date: dansDeuxJours })));
  });

  it("refuse un champ inconnu sur la vente", async () => {
    await assertFails(setDoc(doc(gerant(), "ventesPieces/v1"), vente({ remise: 1_000 })));
  });
});

describe("le mouvement de stock que la vente produit", () => {
  it("le gérant écrit un `sortie_vente` pour sa boutique", async () => {
    await assertSucceeds(
      setDoc(doc(gerant(), "mouvementsPieces/m1"), {
        boutiqueId: "PTG",
        pieceId: "plaquette",
        type: "sortie_vente",
        quantite: 2,
        note: "Vente PTG-2609-0001",
        date: new Date("2026-09-01T09:00:00Z"),
        ...audit("ger-1"),
      }),
    );
  });

  it("et il ne le retouche pas ensuite : un mouvement est un fait", async () => {
    await env.withSecurityRulesDisabled(async (contexte) => {
      await setDoc(doc(contexte.firestore(), "mouvementsPieces/m1"), {
        boutiqueId: "PTG",
        pieceId: "plaquette",
        type: "sortie_vente",
        quantite: 2,
        note: "",
        date: new Date("2026-09-01T09:00:00Z"),
        createdAt: new Date("2026-09-01T09:00:00Z"),
        createdBy: "ger-1",
        createdByName: "Auteur",
        updatedAt: new Date("2026-09-01T09:00:00Z"),
        updatedBy: "ger-1",
        updatedByName: "Auteur",
      });
    });
    await assertFails(updateDoc(doc(gerant(), "mouvementsPieces/m1"), { quantite: 1 }));
  });
});

describe("ce que ces règles ne peuvent pas tenir", () => {
  /**
   * Ces trois tests figent une **absence de protection**, et c'est délibéré.
   *
   * Les écrire à l'envers — en attendant un refus — ferait croire que la base
   * protège. Elle ne le peut pas, et le jour où quelqu'un allégera le garde-fou
   * du geste « puisque les règles le tiennent », ce sont ces tests qui lui
   * diront qu'il se trompe.
   */
  it("le détail d’une ligne au-delà de la première n’est pas confronté à son total", async () => {
    /* Le plafond d'expressions tombe avant : seule la première ligne est
       vérifiée entièrement. Ce qui est tenu sur les dix-neuf autres, c'est leur
       total — entier, positif, et sommé juste. Une quantité absurde en face
       d'un total exact passe donc encore ; elle ne fait plus mentir la recette,
       et `figerLignes` reste seul à l'empêcher. */
    await assertSucceeds(
      setDoc(
        doc(gerant(), "ventesPieces/v1"),
        vente({
          lignes: [ligne(), ligne({ pieceId: "autre", quantite: 999, prixUnitaire: 1 })],
          total: 14_000,
        }),
      ),
    );
  });

  it("rien n’oblige la vente à produire ses mouvements de stock", async () => {
    /* Une règle ne voit qu'un document à la fois. C'est le **batch** de
       `enregistrerVentePiece` qui lie la vente, ses sorties de stock et son
       encaissement — et rien ne le vérifie aujourd'hui : le test bout en bout
       qui le pourrait est le critère resté ouvert de la spec S21. */
    await assertSucceeds(setDoc(doc(gerant(), "ventesPieces/v1"), vente()));

    let ecrite = false;
    await env.withSecurityRulesDisabled(async (contexte) => {
      const lu = await getDoc(doc(collection(contexte.firestore(), "ventesPieces"), "v1"));
      ecrite = lu.exists();
    });
    if (!ecrite) throw new Error("La vente aurait dû être écrite.");
  });

  it("rien n’empêche une vente de sortir plus que le stock", async () => {
    /* Une règle ne sait pas additionner une collection, et une transaction ne
       fonctionne pas hors ligne. « Pas de négatif » est une règle du geste
       (D94), tenue par `validerPanier` là où le geste se fait. */
    /* Mille pièces d'un stock qui n'en compte aucune. La quantité reste sous le
       plafond de forme — c'est bien le **stock** qu'on met à l'épreuve ici, pas
       la borne du montant. */
    await assertSucceeds(
      setDoc(
        doc(gerant(), "ventesPieces/v1"),
        vente({ lignes: [ligne({ quantite: 1_000, total: 3_500_000 })], total: 3_500_000 }),
      ),
    );
  });
});
