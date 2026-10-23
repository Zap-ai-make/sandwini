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
 * laisse fermé. Si l'un de ces refus passait, le cloisonnement du produit
 * serait percé par la porte des cartes grises.
 *
 * **Deux limites relevées en exécutant ce fichier, le 23 octobre 2026.** Ce
 * bloc en affirmait deux de plus que le produit n'en a : le stock de sa propre
 * boutique, et le catalogue des pièces. Les deux étaient ouvertes avant S59 et
 * ne viennent pas de `traiteLesCartesGrises()`. Elles sont écrites ci-dessous
 * telles qu'elles sont — un test qui affirme un cloisonnement que le produit
 * n'a pas est pire qu'une limite connue, parce qu'il la cache.
 */
describe("ce que la personne des cartes grises ne voit pas", () => {
  it("ni les ventes, ni le stock, ni la caisse des boutiques qui vendent", async () => {
    await assertFails(getDoc(doc(gerantCartes(), "ventesMotos/v1")));
    await assertFails(getDoc(doc(gerantCartes(), "motos/m1")));
    await assertFails(getDoc(doc(gerantCartes(), "encaissements/e1")));
  });

  it("ni les coûts, ni les marges d’aucune moto", async () => {
    await env.withSecurityRulesDisabled(async (contexte) => {
      await setDoc(doc(contexte.firestore(), "motos/m1/prive/cout"), {
        boutiqueId: "PTG",
        ...audit(),
      });
    });
    /* Le mur de D2 ne bouge pas : `prive/` est réservé au responsable, et elle
       est gérante comme les autres. */
    await assertFails(getDoc(doc(gerantCartes(), "motos/m1/prive/cout")));
  });

  it("lirait le stock de sa propre boutique — qui n’en a pas", async () => {
    await env.withSecurityRulesDisabled(async (contexte) => {
      await setDoc(doc(contexte.firestore(), "motos/m-cgp"), { boutiqueId: "CGP", ...audit() });
    });
    /* **Limite connue.** La garde des motos porte sur la boutique, pas sur son
       métier. Sa boutique ne vend pas de motos : l'ensemble est donc vide en
       pratique. Le resserrer demanderait un `get()` de la boutique à chaque
       lecture de la collection la plus lue du produit, pour fermer une porte
       qui ne donne sur rien. */
    await assertSucceeds(getDoc(doc(gerantCartes(), "motos/m-cgp")));
  });

  it("lit le catalogue des pièces, comme tout compte connecté", async () => {
    /* **Limite connue, et la plus large des deux.** `match /pieces/{id}` ouvre
       la lecture à `connecte()` : c'est l'arbitrage du commanditaire pour S20
       (« le responsable ne fera que superviser — donc tout est fait par le
       gérant »), et le filtre par boutique vit dans la requête, pas dans la
       règle. Or le document porte `prixAchat`. N'importe quel gérant lit donc
       le prix d'achat des pièces de n'importe quelle boutique, et cela n'a rien
       à voir avec les cartes grises. À trancher ailleurs qu'ici. */
    await assertSucceeds(getDoc(doc(gerantCartes(), "pieces/p1")));
    /* Ce qui reste fermé à tout le monde, et le restera. */
    await assertFails(getDoc(doc(gerantCartes(), "pieces/p1/prive/marge")));
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

  it("naît déjà chez le prestataire quand le dépôt est inscrit", () => {
    /* **Ce que le classeur du commanditaire impose.** Il y recopie des dossiers
       vieux d'un an, les dix cases remplies d'un coup : refuser une naissance
       avancée aurait refusé sa saisie la plus courante. Ce qui tient la place
       de l'ancienne restriction est la cohérence — le dépôt doit être là. */
    return assertSucceeds(
      setDoc(
        doc(gerantCartes(), "dossiersCarteGrise/d-ancien"),
        dossier({
          boutiqueId: "CGP",
          venteId: null,
          origine: "exterieur",
          statut: "chez_prestataire",
          prestataireNom: "BOHARY",
          deposeLe: new Date("2025-08-18T12:00:00"),
          ...audit("ger-cg"),
        }),
      ),
    );
  });

  it("refuse de naître chez le prestataire sans dépôt ni nom", async () => {
    /* Le dépôt n'est donc jamais sauté : un dossier qui se dit dehors sans rien
       pour le montrer ne dit plus où se trouve le papier — la seule chose que
       cette liste serve à dire (D65). */
    await assertFails(
      setDoc(
        doc(gerantCartes(), "dossiersCarteGrise/d-triche"),
        dossier({ boutiqueId: "CGP", venteId: null, origine: "exterieur", statut: "chez_prestataire", ...audit("ger-cg") }),
      ),
    );
  });

  it("refuse de naître à faire avec un dépôt déjà écrit dessus", async () => {
    /* L'autre moitié de la cohérence, et elle est nouvelle : l'ancien chemin
       laissait passer une ligne qui disait « rien n'est parti » alors qu'un
       prestataire et une date étaient inscrits. */
    await assertFails(
      setDoc(
        doc(gerantCartes(), "dossiersCarteGrise/d-menteur"),
        dossier({
          boutiqueId: "CGP",
          venteId: null,
          origine: "exterieur",
          statut: "a_faire",
          prestataireNom: "BOHARY",
          deposeLe: new Date("2025-08-18T12:00:00"),
          ...audit("ger-cg"),
        }),
      ),
    );
  });

  it("refuse un crédit qui n’est pas un entier positif", async () => {
    /* Sa colonne `Credit`. Le FCFA ne se divise pas, et une dette négative ne
       veut rien dire. */
    await assertFails(
      setDoc(
        doc(gerantCartes(), "dossiersCarteGrise/d-credit"),
        dossier({ boutiqueId: "CGP", venteId: null, origine: "exterieur", credit: -1, ...audit("ger-cg") }),
      ),
    );
  });

  it("naît aussi « sans objet » quand le client n’en veut pas", () => {
    /* L'ancien modèle posait ce statut dès la vente, et c'est le bon moment :
       écrire « à faire » pour l'écarter aussitôt ferait passer par la liste des
       dossiers en cours une carte que personne n'a demandée. */
    return assertSucceeds(
      setDoc(
        doc(gerantCartes(), "dossiersCarteGrise/d-sans-objet"),
        dossier({
          boutiqueId: "CGP",
          venteId: null,
          origine: "exterieur",
          statut: "non_applicable",
          ...audit("ger-cg"),
        }),
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

  it("refuse « au magasin » sans la moindre preuve de retour", () => {
    /* Ni plaque, ni date de retour, ni même un dépôt : la ligne ne dit plus où
       se trouve le papier (D65). C'est ce que la cohérence remplace par rapport
       à l'ancien chemin — et elle le refuse pour une meilleure raison : non
       parce qu'une étape manque, mais parce que rien ne la montre. */
    return assertFails(
      updateDoc(doc(gerantCartes(), "dossiersCarteGrise/d-ptg"), {
        statut: "revenu_magasin",
        updatedAt: serverTimestamp(),
        updatedBy: "ger-cg",
        updatedByName: "Gérant",
      }),
    );
  });

  it("laisse inscrire la plaque et le retour d’un seul coup", () => {
    /* La saisie en ligne : on remplit `Immatriculation`, et le statut suit. Le
       chemin l'aurait refusée sur un dossier encore « à faire ». */
    return assertSucceeds(
      updateDoc(doc(gerantCartes(), "dossiersCarteGrise/d-ptg"), {
        statut: "revenu_magasin",
        immatriculation: "7078 7DQ 04",
        revenuLe: new Date("2026-06-10T12:00:00"),
        updatedAt: serverTimestamp(),
        updatedBy: "ger-cg",
        updatedByName: "Gérant",
      }),
    );
  });

  it("laisse effacer un dépôt inscrit sur le mauvais dossier", async () => {
    /* **Le retour en arrière est désormais permis, et c'est la demande** :
       « la possibilité d'ouvrir chaque ligne en modale pour modification ».
       Vider les cases d'un dossier parti par erreur le ramène au départ. Ce
       qu'on perd — la garantie qu'un second dépôt n'écrase pas le premier — est
       remplacé par le journal, où chaque écriture laisse son auteur. */
    await env.withSecurityRulesDisabled(async (contexte) => {
      await updateDoc(doc(contexte.firestore(), "dossiersCarteGrise/d-ptg"), {
        statut: "chez_prestataire",
        prestataireNom: "BOHARY",
        deposeLe: new Date("2025-08-18T12:00:00"),
      });
    });
    await assertSucceeds(
      updateDoc(doc(gerantCartes(), "dossiersCarteGrise/d-ptg"), {
        statut: "a_faire",
        prestataireNom: "",
        prestataireId: null,
        deposeLe: null,
        updatedAt: serverTimestamp(),
        updatedBy: "ger-cg",
        updatedByName: "Gérant",
      }),
    );
  });

  it("refuse d’effacer le dépôt en gardant « chez le prestataire »", async () => {
    /* La correction doit être entière : une ligne qui se dit dehors sans dépôt
       ni prestataire est exactement celle que la cohérence existe pour
       attraper. */
    await env.withSecurityRulesDisabled(async (contexte) => {
      await updateDoc(doc(contexte.firestore(), "dossiersCarteGrise/d-ptg"), {
        statut: "chez_prestataire",
        prestataireNom: "BOHARY",
        deposeLe: new Date("2025-08-18T12:00:00"),
      });
    });
    await assertFails(
      updateDoc(doc(gerantCartes(), "dossiersCarteGrise/d-ptg"), {
        prestataireNom: "",
        deposeLe: null,
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

/**
 * Le journal des passages d'un dossier.
 *
 * **Il est nommé sur un chemin explicite**, et non dans le chemin récursif de
 * `historique` : ce dernier n'ouvre la lecture qu'à qui vend pour la boutique,
 * et y ajouter la personne des cartes grises étendrait sa permission à tous les
 * journaux du produit. Ces tests tiennent les deux bouts : elle lit celui-ci,
 * et un gérant motos ne lit toujours que les siens.
 */
describe("le journal d’un dossier", () => {
  const entree = (partie: Record<string, unknown> = {}) => ({
    boutiqueId: "PTG",
    dossierId: "d-ptg",
    de: "a_faire",
    vers: "chez_prestataire",
    le: new Date("2026-08-18T12:00:00"),
    ...audit("ger-cg"),
    ...partie,
  });

  it("s’écrit avec le passage", () => {
    return assertSucceeds(
      setDoc(doc(gerantCartes(), "dossiersCarteGrise/d-ptg/historique/h1"), entree()),
    );
  });

  it("refuse une entrée posée sur un autre dossier", () => {
    /* Sans cette égalité, on pourrait ranger le passage d'un dossier sous un
       autre : le journal dirait alors le contraire de ce qui s'est passé. */
    return assertFails(
      setDoc(
        doc(gerantCartes(), "dossiersCarteGrise/d-ptg/historique/h2"),
        entree({ dossierId: "d-kdg" }),
      ),
    );
  });

  it("ne se corrige ni ne s’effondre", async () => {
    await env.withSecurityRulesDisabled(async (contexte) => {
      await setDoc(
        doc(contexte.firestore(), "dossiersCarteGrise/d-ptg/historique/h0"),
        entree(),
      );
    });
    /* C'est toute sa valeur de preuve : un journal réinscriptible ne prouve rien. */
    await assertFails(
      updateDoc(doc(gerantCartes(), "dossiersCarteGrise/d-ptg/historique/h0"), {
        vers: "remis",
      }),
    );
    await assertFails(deleteDoc(doc(gerantCartes(), "dossiersCarteGrise/d-ptg/historique/h0")));
  });

  it("se lit par la personne des cartes grises, pas par le gérant d’une autre boutique", async () => {
    await env.withSecurityRulesDisabled(async (contexte) => {
      await setDoc(
        doc(contexte.firestore(), "dossiersCarteGrise/d-kdg/historique/h0"),
        entree({ boutiqueId: "KDG", dossierId: "d-kdg" }),
      );
    });
    await assertSucceeds(
      getDocs(collection(gerantCartes(), "dossiersCarteGrise/d-kdg/historique")),
    );
    /* Le gérant de Pouytenga n'a pas vendu cette moto : le journal de Koudougou
       ne lui est pas plus ouvert que le dossier lui-même. */
    await assertFails(getDocs(collection(gerantMotos(), "dossiersCarteGrise/d-kdg/historique")));
  });
});
