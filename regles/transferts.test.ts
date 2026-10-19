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
 * Règles sur le déplacement d'une moto entre boutiques (S17).
 *
 * **La garde centrale tient en un mot : on pousse, on ne tire jamais.** La
 * règle vérifie le compte contre la boutique que la moto *quitte*. Un gérant
 * peut donc donner une moto qu'il détient, et ne peut pas s'en attribuer une
 * qu'il ne détient pas — faute du moindre droit d'écriture sur elle tant
 * qu'elle est ailleurs. Le sens du transfert est porté ici, pas par une
 * condition dans un écran.
 *
 * Et c'est le périmètre qui porte tous les comptes : prouver qu'après le
 * déplacement la boutique d'origine ne lit plus la moto et la destination la
 * lit, c'est prouver que le stock, la répartition par marque et les compteurs
 * des deux côtés disent la vérité — tout se recompte à la lecture (D61).
 */

let env: RulesTestEnvironment;

const HOTE = "127.0.0.1";
const PORT = 8181;

const responsable = () => env.authenticatedContext("resp-1", { role: "responsable" }).firestore();
const gerant = (uid = "ger-1", boutiqueId = "PTG") =>
  env.authenticatedContext(uid, { role: "gerant", boutiqueId }).firestore();

const auditFige = {
  createdAt: new Date("2026-01-01T08:00:00Z"),
  createdBy: "ger-1",
  createdByName: "Auteur",
  updatedAt: new Date("2026-01-01T08:00:00Z"),
  updatedBy: "ger-1",
  updatedByName: "Auteur",
};

const boutique = (code: string, actif = true) => ({
  nom: `Boutique ${code}`,
  code,
  metiers: ["motos"],
  adresse: "",
  telephone: "",
  actif,
  ...auditFige,
});

const moto = (partie: Record<string, unknown> = {}) => ({
  boutiqueId: "PTG",
  etat: "neuve",
  marqueId: "yamaha",
  modeleId: "crux",
  couleur: "Rouge",
  annee: 2024,
  numeroChassis: "LC6PCJ1A9K0000123",
  numeroMoteur: "",
  prixVenteConseille: 1_100_000,
  provenanceId: "import",
  papiersFournis: [],
  photos: [],
  statut: "en_stock",
  dateEntree: new Date("2026-08-20T09:00:00Z"),
  ...auditFige,
  ...partie,
});

/** Le geste de déplacement, côté moto : la boutique change, et rien d'autre. */
const deplacement = (vers: string, auteur = "ger-1") => ({
  boutiqueId: vers,
  updatedAt: serverTimestamp(),
  updatedBy: auteur,
  updatedByName: "Auteur",
});

/** La trace, côté collection. */
const trace = (partie: Record<string, unknown> = {}, auteur = "ger-1") => ({
  motoId: "moto-ptg",
  numeroChassis: "LC6PCJ1A9K0000123",
  deBoutiqueId: "PTG",
  versBoutiqueId: "KDG",
  motif: "",
  createdAt: serverTimestamp(),
  createdBy: auteur,
  createdByName: "Auteur",
  updatedAt: serverTimestamp(),
  updatedBy: auteur,
  updatedByName: "Auteur",
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
    projectId: "sdi-regles-transferts",
    firestore: { rules: readFileSync("firestore.rules", "utf8"), host: HOTE, port: PORT },
  });
});

afterAll(async () => env?.cleanup());

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (contexte) => {
    const base = contexte.firestore();
    await setDoc(doc(base, "boutiques/PTG"), boutique("PTG"));
    await setDoc(doc(base, "boutiques/KDG"), boutique("KDG"));
    await setDoc(doc(base, "boutiques/FRM"), boutique("FRM", false));
    await setDoc(doc(base, "motos/moto-ptg"), moto());
    await setDoc(doc(base, "motos/moto-kdg"), moto({ boutiqueId: "KDG" }));
    await setDoc(doc(base, "motos/moto-vendue"), moto({ statut: "vendue" }));
  });
});

describe("le geste appartient à la boutique d’origine", () => {
  it("le gérant de Pouytenga envoie une de ses motos à Koudougou", async () => {
    await assertSucceeds(updateDoc(doc(gerant(), "motos/moto-ptg"), deplacement("KDG")));
  });

  it("le responsable le fait aussi, depuis n’importe quel périmètre", async () => {
    await assertSucceeds(
      updateDoc(doc(responsable(), "motos/moto-ptg"), deplacement("KDG", "resp-1")),
    );
  });

  /**
   * **On pousse, on ne tire jamais.** C'est la garde centrale, et elle ne
   * coûte rien : la règle compare le compte à la boutique que la moto quitte.
   * Le gérant de Koudougou n'a aucun droit d'écriture sur une moto de
   * Pouytenga, donc il ne peut pas se l'attribuer.
   */
  it("le gérant de Koudougou ne tire pas à lui une moto de Pouytenga", async () => {
    const kdg = gerant("ger-2", "KDG");
    await assertFails(updateDoc(doc(kdg, "motos/moto-ptg"), deplacement("KDG", "ger-2")));
  });

  it("un gérant ne déplace pas la moto d’une boutique qui n’est pas la sienne", async () => {
    const kdg = gerant("ger-2", "KDG");
    await assertFails(updateDoc(doc(kdg, "motos/moto-ptg"), deplacement("FRM", "ger-2")));
  });

  it("un anonyme ne déplace rien", async () => {
    const anonyme = env.unauthenticatedContext().firestore();
    await assertFails(updateDoc(doc(anonyme, "motos/moto-ptg"), deplacement("KDG")));
  });
});

describe("la destination est vérifiée", () => {
  it("refuse une boutique qui n’existe pas", async () => {
    await assertFails(updateDoc(doc(gerant(), "motos/moto-ptg"), deplacement("ZZZ")));
  });

  it("refuse une boutique fermée", async () => {
    await assertFails(updateDoc(doc(gerant(), "motos/moto-ptg"), deplacement("FRM")));
  });

  /* Un « déplacement » vers sa propre boutique n'est pas un déplacement. Il
     passe par l'autre branche de la règle — celle des modifications ordinaires
     — et n'y change rien. */
  it("accepte une mise à jour ordinaire qui ne change pas de boutique", async () => {
    await assertSucceeds(
      updateDoc(doc(gerant(), "motos/moto-ptg"), {
        couleur: "Noir",
        updatedAt: serverTimestamp(),
        updatedBy: "ger-1",
        updatedByName: "Auteur",
      }),
    );
  });
});

describe("seule une moto en stock se déplace", () => {
  it("refuse de déplacer une moto vendue", async () => {
    await assertFails(updateDoc(doc(gerant(), "motos/moto-vendue"), deplacement("KDG")));
  });

  /**
   * Un déplacement ne change que la boutique.
   *
   * Sans cette borne, le même geste pourrait faire passer une moto d'une
   * boutique à l'autre **et** la marquer vendue, ou lui changer son châssis —
   * en une écriture que la trace décrirait comme un simple déplacement.
   */
  it("refuse un déplacement qui change autre chose au passage", async () => {
    await assertFails(
      updateDoc(doc(gerant(), "motos/moto-ptg"), {
        ...deplacement("KDG"),
        statut: "reservee",
      }),
    );
    await assertFails(
      updateDoc(doc(gerant(), "motos/moto-ptg"), {
        ...deplacement("KDG"),
        prixVenteConseille: 1,
      }),
    );
  });
});

describe("le périmètre suit la moto — et avec lui tous les comptes", () => {
  /**
   * Le témoin qui porte les autres.
   *
   * Stock, répartition par marque, compteurs : tout se recompte à la lecture
   * depuis des écouteurs filtrés par boutique (D61). Prouver que le périmètre a
   * bougé des deux côtés, c'est prouver que les deux chiffres sont justes.
   */
  it("après le déplacement, l’origine ne lit plus la moto et la destination la lit", async () => {
    await assertSucceeds(updateDoc(doc(gerant(), "motos/moto-ptg"), deplacement("KDG")));

    await assertFails(getDoc(doc(gerant(), "motos/moto-ptg")));
    await assertSucceeds(getDoc(doc(gerant("ger-2", "KDG"), "motos/moto-ptg")));
  });

  it("et l’origine ne peut plus la modifier du tout", async () => {
    await assertSucceeds(updateDoc(doc(gerant(), "motos/moto-ptg"), deplacement("KDG")));
    await assertFails(updateDoc(doc(gerant(), "motos/moto-ptg"), deplacement("PTG")));
  });
});

describe("la trace", () => {
  it("le gérant d’origine l’écrit", async () => {
    await assertSucceeds(addDoc(collection(gerant(), "transfertsMotos"), trace()));
  });

  it("le responsable aussi", async () => {
    await assertSucceeds(
      addDoc(collection(responsable(), "transfertsMotos"), trace({}, "resp-1")),
    );
  });

  /* Même garde que sur la moto : la trace d'un départ appartient à la boutique
     d'où la moto part. Sans elle, un gérant écrirait l'histoire d'une boutique
     qui n'est pas la sienne. */
  it("le gérant de destination ne l’écrit pas à la place de l’origine", async () => {
    const kdg = gerant("ger-2", "KDG");
    await assertFails(addDoc(collection(kdg, "transfertsMotos"), trace({}, "ger-2")));
  });

  it("un anonyme n’écrit rien", async () => {
    const anonyme = env.unauthenticatedContext().firestore();
    await assertFails(addDoc(collection(anonyme, "transfertsMotos"), trace()));
  });

  it("refuse une trace dont les deux boutiques sont la même", async () => {
    await assertFails(
      addDoc(collection(gerant(), "transfertsMotos"), trace({ versBoutiqueId: "PTG" })),
    );
  });

  it("refuse un motif démesuré", async () => {
    await assertFails(
      addDoc(collection(gerant(), "transfertsMotos"), trace({ motif: "x".repeat(201) })),
    );
  });

  it("refuse une trace à qui il manque un champ", async () => {
    const incomplete = trace();
    delete (incomplete as Record<string, unknown>).numeroChassis;
    await assertFails(addDoc(collection(gerant(), "transfertsMotos"), incomplete));
  });

  it("refuse un champ en plus — notamment un montant", async () => {
    await assertFails(
      addDoc(collection(gerant(), "transfertsMotos"), trace({ prixAchat: 850_000 })),
    );
  });
});

describe("la trace se lit des deux côtés, et ne se retouche pas", () => {
  beforeEach(async () => {
    await env.withSecurityRulesDisabled(async (contexte) => {
      await setDoc(doc(contexte.firestore(), "transfertsMotos/t-1"), {
        ...trace(),
        createdAt: new Date("2026-10-06T10:00:00Z"),
        updatedAt: new Date("2026-10-06T10:00:00Z"),
      });
    });
  });

  it("la boutique de départ la lit — c’est elle qui se demande où est passée la moto", async () => {
    await assertSucceeds(getDoc(doc(gerant(), "transfertsMotos/t-1")));
  });

  it("la boutique d’arrivée la lit — elle veut savoir d’où vient la moto", async () => {
    await assertSucceeds(getDoc(doc(gerant("ger-2", "KDG"), "transfertsMotos/t-1")));
  });

  it("une boutique étrangère au déplacement ne la lit pas", async () => {
    await assertFails(getDoc(doc(gerant("ger-3", "FRM"), "transfertsMotos/t-1")));
  });

  it("le responsable la lit, et parcourt la collection entiere", async () => {
    await assertSucceeds(getDoc(doc(responsable(), "transfertsMotos/t-1")));
    await assertSucceeds(getDocs(collection(responsable(), "transfertsMotos")));
  });

  /**
   * Un gerant n'interroge que sa boutique, et c'est le contrat de lecture.
   *
   * Firestore refuse une requete de liste des qu'un seul document du resultat
   * echouerait a la regle — il ne filtre pas, il refuse. Un gerant doit donc
   * poser la contrainte lui-meme, exactement comme `ecouterStock` le fait deja
   * pour les motos. C'est ce que l'ecran fera : une requete pour ce qui part,
   * une pour ce qui arrive.
   */
  it("un gerant liste les departs de sa boutique", async () => {
    const requete = query(
      collection(gerant(), "transfertsMotos"),
      where("deBoutiqueId", "==", "PTG"),
    );
    await assertSucceeds(getDocs(requete));
  });

  it("un gerant liste les arrivees dans sa boutique", async () => {
    const requete = query(
      collection(gerant("ger-2", "KDG"), "transfertsMotos"),
      where("versBoutiqueId", "==", "KDG"),
    );
    await assertSucceeds(getDocs(requete));
  });

  it("un gerant ne parcourt pas la collection entiere", async () => {
    await assertFails(getDocs(collection(gerant(), "transfertsMotos")));
  });

  it("un gerant ne lit pas les departs d'une autre boutique", async () => {
    const requete = query(
      collection(gerant(), "transfertsMotos"),
      where("deBoutiqueId", "==", "KDG"),
    );
    await assertFails(getDocs(requete));
  });

  /** Un déplacement est un fait. On le corrige en retransférant. */
  it("personne ne la modifie ni ne la supprime", async () => {
    await assertFails(updateDoc(doc(gerant(), "transfertsMotos/t-1"), { motif: "retouche" }));
    await assertFails(updateDoc(doc(responsable(), "transfertsMotos/t-1"), { motif: "retouche" }));
    await assertFails(deleteDoc(doc(gerant(), "transfertsMotos/t-1")));
    await assertFails(deleteDoc(doc(responsable(), "transfertsMotos/t-1")));
  });
});

describe("le lot complet, tel que l’application l’écrit", () => {
  it("la moto change de boutique et sa trace part dans la même écriture", async () => {
    const base = gerant();
    const lot = writeBatch(base);
    lot.update(doc(base, "motos/moto-ptg"), deplacement("KDG"));
    lot.set(doc(collection(base, "transfertsMotos")), trace());
    await assertSucceeds(lot.commit());
  });

  /* Le lot est atomique : un refus sur l'une des deux écritures fait tomber
     l'autre. C'est ce qui garantit qu'aucune moto ne change de boutique sans
     laisser de trace — les règles, elles, ne voient pas les autres documents
     d'un même lot et ne pourraient pas l'exiger. */
  it("un lot dont le déplacement est refusé n’écrit pas la trace non plus", async () => {
    const base = gerant();
    const lot = writeBatch(base);
    lot.update(doc(base, "motos/moto-ptg"), deplacement("FRM"));
    lot.set(doc(collection(base, "transfertsMotos")), trace({ versBoutiqueId: "FRM" }));
    await assertFails(lot.commit());

    /* Rien n'est passe : on le lit avec le responsable, seul a pouvoir
       parcourir la collection entiere. */
    const restantes = await assertSucceeds(
      getDocs(collection(responsable(), "transfertsMotos")),
    );
    expect(restantes.empty).toBe(true);
  });
});
